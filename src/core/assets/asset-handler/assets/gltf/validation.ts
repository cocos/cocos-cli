import { fork } from 'child_process';
import path from 'path';
import type { Report } from 'gltf-validator';

const enum ValidationSeverity {
    Error = 0,
    Warning = 1,
    Information = 3,
}

interface ValidationWorkerResponse {
    report?: Report;
    error?: {
        message: string;
        stack?: string;
    };
}

function runValidatorInNodeProcess(gltfFilePath: string): Promise<Report> {
    return new Promise((resolve, reject) => {
        const worker = fork(path.join(__dirname, 'validation-worker.js'), [], {
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        });
        let settled = false;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            callback();
        };
        const timeout = setTimeout(() => {
            finish(() => {
                worker.kill();
                reject(new Error(`glTF validation timed out: ${gltfFilePath}`));
            });
        }, 30_000);

        worker.once('error', (error) => finish(() => reject(error)));
        worker.once('exit', (code, signal) => {
            if (!settled) {
                finish(() => reject(new Error(`glTF validation worker exited before replying (code=${code}, signal=${signal})`)));
            }
        });
        worker.once('message', (message: ValidationWorkerResponse) => {
            if (message?.error) {
                const error = new Error(message.error.message);
                error.stack = message.error.stack ?? error.stack;
                finish(() => reject(error));
                return;
            }
            if (!message?.report) {
                finish(() => reject(new Error('glTF validation worker returned an invalid response.')));
                return;
            }
            finish(() => resolve(message.report!));
        });
        worker.send({ gltfFilePath });
    });
}

export async function validateGlTf(gltfFilePath: string, assetPath: string) {
    const report = await runValidatorInNodeProcess(gltfFilePath);

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
            case ValidationSeverity.Error:
                --report.issues.numErrors;
                break;
            case ValidationSeverity.Warning:
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
                `${strintfyMessages(ValidationSeverity.Error)}\n`,
        );
        // throw new Error(`Bad glTf format ${assetPath}.`);
    } else if (report.issues.numWarnings !== 0) {
        console.debug(
            `File ${assetPath} contains warnings, ` +
                'the result may be not what you want, ' +
                'please fix them if possible: ' +
                '\n' +
                `${strintfyMessages(ValidationSeverity.Warning)}\n`,
        );
    } else if (report.issues.numHints !== 0 || report.issues.numInfos !== 0) {
        console.debug(`Logs from ${assetPath}:` + '\n' + `${strintfyMessages(ValidationSeverity.Information)}\n`);
    }
}
