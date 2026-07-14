
import * as path from 'path';
// 用 default 导入而非 `import * as fs`：本脚本工作在 worker(ESM)里跑，ESM 下对 CJS 包做
// 命名空间导入拿不到 fs-extra 挂在 default 上的方法（fs.readJSONSync/outputJSON 会是 undefined）。
// default 导入在主线程(CJS) / worker(ESM) 下都能拿到完整的 fs-extra。
import fs from 'fs-extra';
import {
    Extractor,
    ExtractorConfig,
    ExtractorLogLevel,
} from '@microsoft/api-extractor';
// 纯类型导出必须用 import type：本文件以 ESM 加载（主线程与 worker 皆然），ESM 下把 TS 接口
// （ExtractorResult / IConfigFile 在运行时不存在）当值导入会报 "does not provide an export"。
// import type 会被擦除，不产生运行时绑定。
import type {
    ExtractorResult,
    IConfigFile,
} from '@microsoft/api-extractor';
import { Modularize } from '@cocos/ccbuild';
import { exec } from 'child_process';
import { promisify } from 'util';
// 带 .ts 扩展名：worker 内以 ESM 加载，Node ESM 解析不会自动补 .ts；显式扩展名在
// 主线程(tsx CLI) / worker(tsx ESM) 下都能解析。workflow/ 不在 tsc 编译范围，不影响构建。
import { normalizeDtsRollupContent } from './generate-dts-postprocess.ts';
import { Worker, isMainThread } from 'worker_threads';

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
function buildPlatformTypeUnion(): string {
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
        const platformTypeUnion = buildPlatformTypeUnion();
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
        name: 'project',
        source: 'src/lib/project/project.ts',
        output: 'project.d.ts'
    }, {
        name: 'scripting',
        source: 'src/lib/scripting/scripting.ts',
        output: 'scripting.d.ts'
    }, {
        name: 'builder',
        source: 'src/lib/builder/builder.ts',
        output: 'builder.d.ts'
    }, {
        name: 'service',
        source: 'src/lib/service/index.ts',
        output: 'service.d.ts'
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

// api-extractor + TypeScript 在复杂类型图上会深递归。Windows 主线程的 OS 栈在链接期固定
// （约 1MB），用命令行 --stack-size 放大 V8 栈会超过真实 OS 栈，深递归时冲破 OS guard page →
// 0xC0000409 (STATUS_STACK_BUFFER_OVERRUN) 硬崩溃（不可捕获，且时好时坏）。
// 这里把实际工作放到 worker 线程：worker 的 OS 线程栈按 stackSizeMb 分配、V8 栈限额随之匹配，
// 两者一致，跨平台都不会再栈溢出崩溃（真超限只会抛可捕获的 RangeError）。
// stackSizeMb / maxOldGenerationSizeMb 取代命令行的 --stack-size / --max-old-space-size，
// 成为栈/堆大小的唯一来源，避免两个数不一致又崩。
if (isMainThread) {
    // worker 入口指向 .mjs 引导文件（Node 原生认识的扩展名），由它用 tsx 编程式 API 注册 loader
    // 后再 import 本 .ts。不能把 .ts 直接作为 worker 入口：那依赖 tsx 对 worker_threads 的自动 patch
    // 或 execArgv 挂 tsx，二者在部分环境（如 CI）下都不生效，会报 ERR_UNKNOWN_FILE_EXTENSION ".ts"。
    // 用 cwd 拼路径而非 __filename：ESM 作用域无 __filename，且 npm 以仓库根为 cwd。
    // worker 堆由 resourceLimits 控制，无需继承 --max-old-space-size。
    const workerPath = path.join(projectRoot, 'workflow', 'generate-dts-worker.mjs');

    // 单次运行 worker，resolve 为退出码；worker 内未捕获异常走 reject。
    const runWorkerOnce = (): Promise<number> => new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, {
            resourceLimits: {
                stackSizeMb: 16,
                maxOldGenerationSizeMb: 4096,
            },
        });
        worker.on('error', reject);
        worker.on('exit', (code) => resolve(code ?? 0));
    });

    // 原生崩溃判定：退出码非 0 且非 1。api-extractor + TypeScript 在复杂类型图上会触发 Windows
    // 上不可捕获的原生硬崩（0xC0000374 堆损坏 / 0xC0000409 栈溢出，退出码是 3221226xxx 这类大
    // NTSTATUS 值），且时好时坏、重跑即过。而 generate() 内部抛错后是 process.exit(1) 的确定性
    // 失败，重试只会重复同样的错误、掩盖真正问题，所以只对“原生崩溃码”重试。
    const isNativeCrash = (code: number): boolean => code !== 0 && code !== 1;

    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

    void (async () => {
        const MAX_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            let code: number;
            try {
                code = await runWorkerOnce();
            } catch (err) {
                // worker 内未捕获异常：确定性错误，不重试。
                console.error(err);
                process.exit(1);
            }

            if (code === 0) process.exit(0);
            if (!isNativeCrash(code)) process.exit(code); // 应用层确定性失败：直接失败。

            const hex = (code >>> 0).toString(16).toUpperCase().padStart(8, '0');
            console.error(`[generate-dts] DTS worker 原生崩溃，退出码 ${code} (0x${hex})，第 ${attempt}/${MAX_ATTEMPTS} 次尝试`);
            if (attempt === MAX_ATTEMPTS) {
                console.error(`[generate-dts] 已重试 ${MAX_ATTEMPTS} 次仍崩溃，放弃。`);
                process.exit(code);
            }
            await sleep(1000);
        }
    })();
} else {
    generate().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
