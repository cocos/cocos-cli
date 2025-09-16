import fs from 'fs';
import { Severity, validateBytes, validateString, ValidationOptions } from 'gltf-validator';

export async function validateGlTf(gltfFilePath: string, assetPath: string) {
    const validationOptions: ValidationOptions = {
        uri: gltfFilePath,
        ignoredIssues: [],
        severityOverrides: {
            NON_RELATIVE_URI: Severity.Information,
            UNDECLARED_EXTENSION: Severity.Warning,
            ACCESSOR_TOTAL_OFFSET_ALIGNMENT: Severity.Information,
        },
    };
    const isGlb = gltfFilePath.endsWith('.glb');
    // For some gltf(fbx2glTf exported), the gltf-validator may emit `invalid JSON` error.
    // We should read the string by self.
    const report = await (isGlb
        ? validateBytes(Uint8Array.from(fs.readFileSync(gltfFilePath)), validationOptions)
        : validateString(fs.readFileSync(gltfFilePath).toString()));

    // Remove specified errors.
    const ignoredMessages = report.issues.messages.filter((message) => {
        if (
            message.code === 'VALUE_NOT_IN_RANGE' &&
            /\/accessors\/\d+\/count/.test(message.pointer) &&
            message.message === 'Value 0 is out of range.'
        ) {
            // Babylon exporter
            return true;
        }
        if (message.code === 'ROTATION_NON_UNIT' && /\/nodes\/\d+\/rotation/.test(message.pointer)) {
            // Babylon exporter
            return true;
        }
        return false;
    });
    for (const message of ignoredMessages) {
        switch (message.severity) {
            case Severity.Error:
                --report.issues.numErrors;
                break;
            case Severity.Warning:
                --report.issues.numInfos;
                break;
        }
        console.debug(`glTf-validator issue(from ${assetPath}) ${JSON.stringify(message)} is ignored.`);
        report.issues.messages.splice(report.issues.messages.indexOf(message), 1);
    }

    const strintfyMessages = (severity: number) => {
        return JSON.stringify(
            report.issues.messages.filter((message) => message.severity === severity),
            undefined,
            2,
        );
    };
    if (report.issues.numErrors !== 0) {
        console.debug(
            `File ${assetPath} contains errors, ` +
                'this may cause problem unexpectly, ' +
                'please fix them: ' +
                '\n' +
                `${strintfyMessages(Severity.Error)}\n`,
        );
        // throw new Error(`Bad glTf format ${assetPath}.`);
    } else if (report.issues.numWarnings !== 0) {
        console.debug(
            `File ${assetPath} contains warnings, ` +
                'the result may be not what you want, ' +
                'please fix them if possible: ' +
                '\n' +
                `${strintfyMessages(Severity.Warning)}\n`,
        );
    } else if (report.issues.numHints !== 0 || report.issues.numInfos !== 0) {
        console.debug(`Logs from ${assetPath}:` + '\n' + `${strintfyMessages(Severity.Information)}\n`);
    }
}
