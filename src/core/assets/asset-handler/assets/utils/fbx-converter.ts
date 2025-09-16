import { Asset } from '@editor/asset-db';
import { IAbstractConverter } from './model-convert-routine';
import ps from 'path';
import fs, { pathExists } from 'fs-extra';
import cp from 'child_process';
import { i18nTranslate, linkToAssetTarget } from '../../utils';

export function createFbxConverter(options: {
    unitConversion?: 'geometry-level' | 'hierarchy-level' | 'disabled';
    animationBakeRate?: number;
    preferLocalTimeSpan?: boolean;
    smartMaterialEnabled?: boolean;
    matchMeshNames?: boolean;
}): IAbstractConverter<string> {
    const outFileName = 'out.gltf';
    let { tool: toolPath } = require('@cocos/fbx-gltf-conv');

    const temp = toolPath.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(temp)) {
        toolPath = temp;
    }

    return {
        get options() {
            return options;
        },

        get(asset: Asset, outputDir: string) {
            return ps.join(outputDir, outFileName);
        },

        async convert(asset: Asset, outputDir: string) {
            const cliArgs: string[] = [];

            // <input file>
            cliArgs.push(quotPathArg(asset.source));

            // --unit-conversion
            cliArgs.push('--unit-conversion', options.unitConversion ?? 'geometry-level');

            // --animation-bake-rate
            cliArgs.push('--animation-bake-rate', `${options.animationBakeRate ?? 0}`);

            // --prefer-local-time-span
            // Note for boolean parameters, `--o false` does not work.
            cliArgs.push(`--prefer-local-time-span=${options.preferLocalTimeSpan ?? true}`);

            cliArgs.push(`--match-mesh-names=${options.matchMeshNames ?? true}`);

            if (options.smartMaterialEnabled ?? false) {
                cliArgs.push('--export-fbx-file-header-info');
                cliArgs.push('--export-raw-materials');
            }

            // --out
            const outFile = ps.join(outputDir, outFileName);
            await fs.ensureDir(ps.dirname(outFile));
            cliArgs.push('--out', quotPathArg(outFile));

            // --fbm-dir
            const fbmDir = ps.join(outputDir, '.fbm');
            await fs.ensureDir(fbmDir);
            cliArgs.push('--fbm-dir', quotPathArg(fbmDir));

            // --log-file
            const logFile = getLogFile(outputDir);
            await fs.ensureDir(ps.dirname(logFile));
            cliArgs.push('--log-file', quotPathArg(logFile));

            let callOk = await callFbxGLTFConv(toolPath, cliArgs, outputDir);
            if (callOk && !(await pathExists(outFile))) {
                callOk = false;
                console.error(`Tool FBX-glTF-conv ends abnormally(spawn ${toolPath} ${cliArgs.join(' ')}).`);
            }

            return callOk;
        },

        async printLogs(asset, outputDir) {
            const logFile = getLogFile(outputDir);

            if (await pathExists(logFile)) {
                let logs: IFbxGlTfConvLog | undefined;
                try {
                    logs = await fs.readJson(logFile);
                } catch {
                    console.debug('No logs are generated, it should not happen indeed.');
                }
                if (Array.isArray(logs)) {
                    // We are lazy here.
                    // If any exception happen due to log printing.
                    // We simply ignore.
                    try {
                        printConverterLogs(logs, asset);
                    } catch (err) {
                        console.error(err);
                    }
                }
            }
        },
    };

    function quotPathArg(p: string) {
        return `"${p}"`;
    }

    function callFbxGLTFConv(tool: string, args: string[], cwd: string) {
        return new Promise<boolean>((resolve, reject) => {
            const child = cp.spawn(quotPathArg(tool), args, {
                cwd,
                shell: true,
            });

            let output = '';
            if (child.stdout) {
                child.stdout.on('data', (data) => (output += data));
            }
            let errOutput = '';
            if (child.stderr) {
                child.stderr.on('data', (data) => (errOutput += data));
            }
            child.on('error', reject);
            child.on('close', (code) => {
                if (output) {
                    console.log(output);
                }
                if (errOutput) {
                    console.error(errOutput);
                }
                // non-zero exit code is failure
                if (code === 0) {
                    resolve(true);
                } else {
                    if (code === 1) {
                        // Defined by FBX-glTF-conv:
                        // Error happened, the convert result may not complete.
                        // But errors are logged.
                    } else if (code === 3221225781) {
                        console.error(i18nTranslate('engine-extends.importers.fbx.fbxGlTfConv.missing_dll'));
                    } else if (code === 126 && process.platform === 'darwin') {
                        console.error(i18nTranslate('engine-extends.importers.fbx.fbxGlTfConv.badCPU'));
                    } else {
                        console.error(`FBX-glTF-conv existed with unexpected non-zero code ${code}`);
                    }
                    resolve(false);
                }
            });
        });
    }

    function getLogFile(outputDir: string) {
        return ps.join(outputDir, 'log.json');
    }

    function printConverterLogs(logs: IFbxGlTfConvLog, asset: Asset) {
        const getLogger = (level: number) => {
            let logger: (text: string) => void;
            switch (level) {
                case FbxGlTfConvLogLevel.verbose:
                    logger = console.debug;
                    break;
                case FbxGlTfConvLogLevel.info:
                    logger = console.log;
                    break;
                case FbxGlTfConvLogLevel.warning:
                    logger = console.warn;
                    break;
                case FbxGlTfConvLogLevel.error:
                case FbxGlTfConvLogLevel.fatal:
                default:
                    logger = console.error;
                    break;
            }
            return (text: string) => {
                logger.call(console, addAssetMark(text, asset));
            };
        };
        const inheritTypeMessageCode = 'unsupported_inherit_type';
        const mergedInheritTypeMessages: Record<string, string[]> = {};
        for (const { level, message } of logs) {
            const logger = getLogger(level);
            if (typeof message === 'string') {
                logger(message);
            } else {
                const code = message.code;
                if (code === inheritTypeMessageCode) {
                    const type = message.type;
                    const node = message.node;
                    if (!(type in mergedInheritTypeMessages)) {
                        mergedInheritTypeMessages[type] = [];
                    }
                    mergedInheritTypeMessages[type].push(node);
                } else if (typeof code === 'string') {
                    logger(getI18nMessage(code, message));
                } else {
                    logger(JSON.stringify(message, undefined, 2));
                }
            }
        }
        for (const [type, nodes] of Object.entries(mergedInheritTypeMessages)) {
            getLogger(FbxGlTfConvLogLevel.verbose)(
                getI18nMessage(inheritTypeMessageCode, {
                    type,
                    nodes,
                }),
            );
        }
    }

    function getI18nMessage(code: string, message?: any) {
        return i18nTranslate(`engine-extends.importers.fbx.fbxGlTfConv.${code}`, message);
    }

    function addAssetMark(text: string, asset: Asset) {
        return `${text} [${linkToAssetTarget(asset.uuid)}]`;
    }
}

type IFbxGlTfConvLog = Array<{
    level: number;
    message: string | (Record<string, string> & { code?: string });
}>;

enum FbxGlTfConvLogLevel {
    verbose,
    info,
    warning,
    error,
    fatal,
}
