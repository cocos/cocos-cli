import fs from 'fs';
import { Severity, validateBytes, validateString, type ValidationOptions } from 'gltf-validator';

interface ValidationWorkerRequest {
    gltfFilePath: string;
}

function send(message: unknown) {
    if (typeof process.send === 'function') {
        process.send(message, () => process.disconnect());
    }
}

process.once('message', async (message: ValidationWorkerRequest) => {
    try {
        const { gltfFilePath } = message;
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
        // For some glTF files exported by fbx2glTF, the validator can report
        // invalid JSON when it is given bytes. Read textual glTF as a string.
        const report = await (isGlb
            ? validateBytes(Uint8Array.from(fs.readFileSync(gltfFilePath)), validationOptions)
            : validateString(fs.readFileSync(gltfFilePath).toString(), validationOptions));
        send({ report });
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        send({
            error: {
                message: err.message,
                stack: err.stack,
            },
        });
    }
});
