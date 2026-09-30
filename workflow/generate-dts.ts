
import * as path from 'path';
// 用 default 导入而非 `import * as fs`：本脚本工作在 worker(ESM)里跑，ESM 下对 CJS 包做
// 命名空间导入拿不到 fs-extra 挂在 default 上的方法（fs.readJSONSync/outputJSON 会是 undefined）。
// default 导入在主线程(CJS) / worker(ESM) 下都能拿到完整的 fs-extra。
import fs from 'fs-extra';
// 纯类型导出必须用 import type：本文件以 ESM 加载（主线程与 worker 皆然），ESM 下把 TS 接口
// （ExtractorResult / IConfigFile 在运行时不存在）当值导入会报 "does not provide an export"。
// import type 会被擦除，不产生运行时绑定。
import type {
    ExtractorResult,
    IConfigFile,
} from '@microsoft/api-extractor';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
// 带 .ts 扩展名：worker 内以 ESM 加载，Node ESM 解析不会自动补 .ts；显式扩展名在
// 主线程(tsx CLI) / worker(tsx ESM) 下都能解析。workflow/ 不在 tsc 编译范围，不影响构建。
import { normalizeDtsRollupContent } from './generate-dts-postprocess.ts';
import { isMainThread } from 'worker_threads';

const execAsync = promisify(exec);// Dynamically build the real PlatformType union from @cocos/ccbuild enums.
// This is needed because api-extractor incorrectly resolves

// -------------------------------------------------------------------
// Version counter utilities for DTS package publishing
// -------------------------------------------------------------------

async function fetchNextVersionCounter(rootVersion: string): Promise<number> {
    try {
        const { stdout } = await execAsync('npm view @cocos/cocos-cli-types versions --json');
        const versions: string[] = JSON.parse(stdout);
        
        // Find versions that start with the rootVersion 
        // Example: if rootVersion is "0.0.1-alpha.15", we look for "0.0.1-alpha.15.1", "0.0.1-alpha.15.2", etc.
        const prefix = `${rootVersion}.`;
        const matchingVersions = versions.filter(v => v.startsWith(prefix));

        if (matchingVersions.length === 0) {
            return 1;
        }

        // Extract the suffixes and find the maximum numeric value
        const suffixes = matchingVersions.map(v => {
            const suffixStr = v.substring(prefix.length);
            const num = parseInt(suffixStr, 10);
            return isNaN(num) ? 0 : num;
        });

        const maxSuffix = Math.max(...suffixes);
        return maxSuffix + 1;
    } catch (e) {
        // If the package doesn't exist yet or command fails, start from 1
        console.warn(`Could not fetch versions from NPM. Defaulting counter to 1. Error: ${(e as Error).message}`);
        return 1;
    }
}

function composeVersion(root: string, counter: number): string {
  return `${root}.${counter}`;
}

// -------------------------------------------------------------------


// `type PlatformType = _PlatformType` into `type PlatformType = PlatformType`
// (circular self-reference) when bundling the .d.ts files.
async function buildPlatformTypeUnion(): Promise<string> {
    const { Modularize } = await import('@cocos/ccbuild');
    const allKeys = [
        ...Object.keys(Modularize.WebPlatform).filter(k => isNaN(Number(k))),
        ...Object.keys(Modularize.MinigamePlatform).filter(k => isNaN(Number(k))),
        'SUD', 'SUDV2',
        ...Object.keys(Modularize.NativePlatform).filter(k => isNaN(Number(k))),
    ].map(k => k.toUpperCase());
    const extras = ['HTML5', 'NATIVE', 'NODEJS', 'INVALID_PLATFORM'];
    const allTypes = [...new Set([...allKeys, ...extras])];
    return allTypes.map(t => `'${t}'`).join(' | ');
}

async function postProcessDts(filePath: string) {
    let content = await fs.readFile(filePath, 'utf-8');
    let changed = false;
    const fileName = path.basename(filePath);

    // Fix api-extractor circular self-reference for PlatformType
    const selfRef = 'type PlatformType = PlatformType;';
    if (content.includes(selfRef)) {
        const platformTypeUnion = await buildPlatformTypeUnion();
        content = content.replace(
            new RegExp(selfRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            `type PlatformType = ${platformTypeUnion};`
        );
        changed = true;
    }

    // Remove leftover eslint-disable-next-line @typescript-eslint/ban-types comments
    const banTypesComment = /[ \t]*\/\/ eslint-disable-next-line @typescript-eslint\/ban-types\r?\n/g;
    if (content.match(banTypesComment)) {
        content = content.replace(banTypesComment, '');
        console.log(`  Post-processed: removed @typescript-eslint/ban-types comments in ${fileName}`);
        changed = true;
    }

    // api-extractor demotes types not in the entry's export chain to bare
    // `declare interface/type/enum/...` (no `export`). Promote them back so
    // consumers can import any type that was originally exported in source.
    const promoteRe = /^declare (interface|type|enum|class|function|const|abstract class|namespace) /gm;
    if (promoteRe.test(content)) {
        promoteRe.lastIndex = 0;
        content = content.replace(promoteRe, 'export declare $1 ');
        console.log(`  Post-processed: promoted non-exported declarations to export in ${fileName}`);
        changed = true;
    }

    const normalizedContent = normalizeDtsRollupContent(fileName, content);
    if (normalizedContent !== content) {
        content = normalizedContent;
        console.log(`  Post-processed: normalized unstable ${fileName} rollup signatures`);
        changed = true;
    }

    if (changed) {
        await fs.writeFile(filePath, content, 'utf-8');
    }
}

// 用 process.cwd() 而非 __dirname：本脚本会把工作放进 worker 线程执行，worker 里 tsx 以 ESM
// 加载 .ts，ESM 作用域没有 __dirname/require。npm 脚本始终以仓库根为 cwd，等价于原来的
// path.resolve(__dirname, '..')，且在主线程(CJS)/worker(ESM)两种模式下都可用。
const projectRoot = process.cwd();
const dtsExportRoot = path.join(projectRoot, 'packages/cocos-cli-types');
interface IDtsEntry {
    name: string;
    source: string; // Relative to project root, e.g. src/core/builder/@types/protected.ts
    output: string; // Relative to project root or file root, e.g. @types/cocos-cli/builder-plugins
}

// Define your entries here
const entries: IDtsEntry[] = [
    {
        name: 'lib',
        source: 'src/lib/index.ts',
        output: 'index.d.ts'
    }, {
        name: 'assets',
        source: 'src/lib/assets/assets.ts',
        output: 'assets.d.ts'
    }, {
        name: 'base',
        source: 'src/lib/base/base.ts',
        output: 'base.d.ts'
    }, {
        name: 'configuration',
        source: 'src/lib/configuration/configuration.ts',
        output: 'configuration.d.ts'
    }, {
        name: 'engine',
        source: 'src/lib/engine/engine.ts',
        output: 'engine.d.ts'
    }, {
        name: 'mcp',
        source: 'src/lib/mcp/mcp.ts',
        output: 'mcp.d.ts'
    }, {
        name: 'project',
        source: 'src/lib/project/project.ts',
        output: 'project.d.ts'
    }, {
        name: 'scene',
        source: 'src/lib/scene/scene.ts',
        output: 'scene.d.ts'
    }, {
        name: 'scripting',
        source: 'src/lib/scripting/scripting.ts',
        output: 'scripting.d.ts'
    }, {
        name: 'builder',
        source: 'src/lib/builder/builder.ts',
        output: 'builder.d.ts'
    }, {
        name: 'simulator',
        source: 'src/lib/simulator/simulator.ts',
        output: 'simulator.d.ts'
    }, {
        name: 'cli',
        source: 'src/lib/cli.ts',
        output: 'cli.d.ts'
    }
];

const packageJSON = {
    name: '@cocos/cocos-cli-types',
    description: 'types for cocos cli',
    author: 'cocos cli',
    version: '0.0.1-alpha.5',
    main: 'index.d.ts',
    types: 'index.d.ts',
    exports: {
        '.': {
            types: './index.d.ts'
        },
        './*': {
            types: './*.d.ts'
        }
    },
    files: [
        '*.d.ts',
    ]
};

async function generate() {
    const { Extractor, ExtractorConfig, ExtractorLogLevel } = await import('@microsoft/api-extractor');

    console.log(`Starting DTS generation for ${entries.length} entries...`);

    for (const entry of entries) {
        console.log(`\nProcessing ${entry.name}...`);

        // Convert source path to dist path
        // Assuming src/ matches dist/ structure and .ts -> .d.ts
        // We need to handle the fact that 'src' might be mapped to 'dist' in tsconfig
        // For this project, rootDir is ./src and outDir is ./dist

        const relativeSource = path.relative(path.join(projectRoot, 'src'), path.join(projectRoot, entry.source));
        if (relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
            throw new Error(`Source ${entry.source} must be inside src/ directory`);
        }

        const distPath = path.join(projectRoot, 'dist', relativeSource.replace(/\.ts$/, '.d.ts'));

        if (!fs.existsSync(distPath)) {
            console.error(`Entry file not found: ${distPath}`);
            console.error(`Please ensure you have run the build script (e.g. 'npm run build') to generate the dist files.`);
            process.exit(1);
        }

        const output = path.join(dtsExportRoot, entry.output);

        // Create a temporary api-extractor config object
        const configObject: IConfigFile = {
            projectFolder: projectRoot,
            mainEntryPointFilePath: distPath,
            compiler: {
                tsconfigFilePath: path.join(projectRoot, 'tsconfig.json'),
                skipLibCheck: false,
            },
            dtsRollup: {
                enabled: true,
                untrimmedFilePath: output
                // publicTrimmedFilePath: path.join(outputDir, 'public.d.ts') // Optional: if we want a public vs beta split
            },
            bundledPackages: ['@cocos/asset-db', '@cocos/ccbuild', 'rollup', '@babel', '@babel/core', '@babel', 'workflow-extra', '@cocos/lib-programming'],
            docModel: {
                enabled: false
            },
            tsdocMetadata: {
                enabled: false
            },
            messages: {
                compilerMessageReporting: {
                    default: {
                        logLevel: ExtractorLogLevel.Warning
                    }
                },
                extractorMessageReporting: {
                    default: {
                        logLevel: ExtractorLogLevel.Warning,
                        addToApiReportFile: false
                    }
                }
            },
            apiReport: {
                enabled: false // Disable API report for now
            }
        };

        try {
            const extractorConfig = ExtractorConfig.prepare({
                configObject,
                configObjectFullPath: undefined,
                packageJsonFullPath: path.join(projectRoot, 'package.json')
            });

            const extractorResult: ExtractorResult = Extractor.invoke(extractorConfig, {
                localBuild: true,
                showVerboseMessages: true
            });

            if (extractorResult.succeeded) {
                console.log(`Successfully generated dts for ${entry.name} at ${entry.output}`);
                await postProcessDts(output);
            } else {
                console.error(`API Extractor completed with ${extractorResult.errorCount} errors and ${extractorResult.warningCount} warnings`);
                process.exit(1);
            }
        } catch (e) {
            console.error(`Error generating dts for ${entry.name}:`, e);
            process.exit(1);
        }
    }

    const packageJSONPath = path.join(dtsExportRoot, 'package.json');
    // 用 fs.readJSONSync 而非 require：worker 内以 ESM 加载，没有 require。
    const rootVersion = fs.readJSONSync(path.join(projectRoot, 'package.json')).version;
    const counter = await fetchNextVersionCounter(rootVersion);
    packageJSON.version = composeVersion(rootVersion, counter);
    
    console.log(`\nNext published version will be: ${packageJSON.version}`);
    await fs.outputJSON(packageJSONPath, packageJSON, { spaces: 4 });

    console.log('\nAll DTS generation tasks completed.');
}

// Supervise extraction in a separate process: a native worker crash can terminate
// its entire Node process before worker error/exit handlers can report it.
if (isMainThread) {
    const workerPath = path.join(projectRoot, 'workflow', 'generate-dts-worker.mjs');
    const runWorkerOnce = (): Promise<{ code: number; signal: NodeJS.Signals | null }> => new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', workerPath], { stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', (code, signal) => resolve({ code: code ?? 1, signal }));
    });

    void (async () => {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            let result: Awaited<ReturnType<typeof runWorkerOnce>>;
            try {
                result = await runWorkerOnce();
            } catch (error) {
                console.error(error);
                process.exit(1);
            }
            if (result.code === 0 && !result.signal) {
                process.exit(0);
            }
            const nativeCrash = result.signal === 'SIGSEGV' || result.signal === 'SIGABRT'
                || (process.platform === 'win32' && (result.code >>> 0) >= 0x80000000);
            if (!nativeCrash) {
                console.error(`[generate-dts] Extraction process exited with code ${result.code}, signal ${result.signal ?? 'none'}.`);
                process.exit(result.code);
            }
            const hex = (result.code >>> 0).toString(16).toUpperCase().padStart(8, '0');
            console.error(`[generate-dts] Native crash: code ${result.code} (0x${hex}), signal ${result.signal ?? 'none'}, attempt ${attempt}/${maxAttempts}.`);
            if (attempt === maxAttempts) {
                process.exit(1);
            }
        }
    })();
} else {
    generate().catch(error => {
        console.error(error);
        process.exit(1);
    });
}
