import fs, { pathExists } from 'fs-extra';
import { ModLo, ImportMap } from '@cocos/creator-programming-mod-lo/lib/mod-lo';
import rpModLo from '@cocos/creator-programming-rollup-plugin-mod-lo';
import toNamedRegister from '../../utils/to-named-register';
import { URL, pathToFileURL, fileURLToPath } from 'url';
import * as babel from '@babel/core';
import * as rollup from 'rollup';
// @ts-ignore
import rpSourcemaps from 'rollup-plugin-sourcemaps';
import { terser } from 'rollup-plugin-terser';
import ps, { relative } from 'path';
import { packMods } from '../../utils/pack-mods';
import { CCEnvConstants } from './build-time-constants';
import { isCjsInteropUrl, getCjsInteropTarget } from '@cocos/creator-programming-common';
import { build as buildSystemJs } from '@cocos/module-system';
import buildPolyfills from '@editor/build-polyfills';
import { IBuildSystemJsOption, IPolyFills } from '../../../../@types';
import { IAssetInfo, ModulePreservation, ITransformTarget } from '../../../../@types/protected';
import minimatch from 'minimatch';
import { SharedSettings } from '../../../../../scripting/interface';
import { MacroItem } from '../../../../../engine/@types/config';

interface buildRes {
    scriptPackages: string[];
    importMappings: Record<string, string>;
}

interface Bundle {
    id: string | null;
    scripts: IAssetInfo[];
    outFile: string;
}

function relativeUrl(from: string, to: string) {
    return relative(from, to).replace(/\\/g, '/');
}

let bundleIdToNameChunk: null | string;

function matchPattern(path: string, pattern: string): boolean {
    return minimatch(path.replace(/\\/g, '/'), pattern.replace(/\\/g, '/'));
}

interface DBInfo {
    dbID: string;
    target: string
}

const useEditorFolderFeature = false; // TODO: 之后正式接入编辑器 Editor 目录后移除这个开关

function getExternalEditorModules(cceModuleMap: Record<string, any>) {
    return Object.keys(cceModuleMap).filter(name => name !== 'mapLocation');
}

async function genImportRestrictions(dbInfos: DBInfo[], externalEditorModules: string[]) {
    if (!useEditorFolderFeature) {
        return undefined;
    }
    const restrictions = [];
    restrictions.length = 0;
    const banSourcePatterns = [...externalEditorModules];
    for (const info of dbInfos) {
        const dbPath = info.target;
        if (dbPath) {
            const dbEditorPattern = ps.join(dbPath, '**', 'editor', '**/*');
            banSourcePatterns.push(dbEditorPattern);
        }
    }

    for (let i = 0; i < dbInfos.length; ++i) {
        const info = dbInfos[i];
        const dbPath = info.target;
        if (dbPath) {
            const dbPattern = ps.join(dbPath, '**/*');
            const dbEditorPattern = ps.join(dbPath, '**', 'editor', '**/*');
            restrictions[i] = {
                importerPatterns: [dbPattern, '!' + dbEditorPattern], // TODO: 如果需要兼容就项目，则路径不能这么配置，等编辑器提供查询接口
                banSourcePatterns,
            };
        }
    }
    return restrictions;
}

/**
 * 编译项目脚本，执行环境为标准 node 环境，请不要使用 Editor 或者 Electron 接口，所以需要使用的字段都需要在外部整理好传入
 * @param options 编译引擎参数
 * @returns 
 */
export async function buildScriptCommand(
    options: IBuildScriptFunctionOption & SharedSettings,
): Promise<buildRes> {
    const res: buildRes = {
        scriptPackages: [],
        importMappings: {},
    };
    if (options.bundles.length === 0) {
        return res;
    }

    const sourceMaps = options.sourceMaps;
    const ccEnvMod = Object.entries(options.ccEnvConstants).map(([k, v]) => `export const ${k} = ${v};`).join('\n');

    // https://github.com/rollup/rollup/issues/2952
    // > Currently, the assumption is that a resolved id is the absolute path of a file on the host system (including the correct slashes).

    const { bundles, modulePreservation } = options;
    const bundleCommonChunk = options.bundleCommonChunk = options.bundleCommonChunk ?? false;

    const memoryMods: Record<string, string> = {};
    const uuidMap: Record<string, string> = {}; // script uuid to url
    const fileBundleMap: Record<string, number> = {}; // script file path / prerequisite url to bundle index
    const prerequisiteModuleURLs = new Set<string>();
    const exposedFileModuleURLs = new Set<string>();
    const exposeEachAssetModule = options.modulePreservation === 'preserve';

    const getBundleIndexOfChunk = (chunk: rollup.OutputChunk) => {
        let { facadeModuleId } = chunk;

        if (!facadeModuleId) {
            // This chunk does not corresponds to a module.
            // Maybe happen if it's a virtual module or it correspond to multiple modules.
            return -1;
        }

        // If the module ID is file URL like, we convert it to path.
        // If conversion failed, it's not a file module and can never be bundle file.
        let facadeModulePath = '';

        // NOTE: 转化 CJS interop module id 为原始的 module id
        let facadeModuleURLString = facadeModuleId;
        if (!facadeModuleURLString.startsWith('file:///')) {
            facadeModuleURLString = pathToFileURL(facadeModuleId).href;
        }
        const facadeModuleURL = new URL(facadeModuleURLString);
        if (isCjsInteropUrl(facadeModuleURL)) {
            const cjsInteropTargetURL = getCjsInteropTarget(facadeModuleURL);
            facadeModuleId = fileURLToPath(cjsInteropTargetURL.href);
        }

        if (!facadeModuleId.startsWith('file:///')) {
            facadeModulePath = facadeModuleId;
        } else {
            try {
                facadeModulePath = fileURLToPath(facadeModuleId);
            } catch {
                return -1;
            }
        }

        return fileBundleMap[facadeModulePath] ?? -1;
    };

    /**
     * Identify if the specified chunk corresponds to a module that should be exposed,
     * if so, return the exposed URL of the corresponding module.
     */
    const identifyExposedModule = (chunk: rollup.OutputChunk) => {
        const { facadeModuleId } = chunk;

        if (!facadeModuleId) {
            // This chunk does not corresponds to a module.
            // Maybe happen if it's a virtual module or it correspond to multiple modules.
            return '';
        }

        // All prerequisite import modules should be exposed.
        if (prerequisiteModuleURLs.has(facadeModuleId)) {
            return facadeModuleId;
        }

        // It can be a to-be-exposed file.
        if (exposedFileModuleURLs.has(facadeModuleId)) {
            return facadeModuleId;
        }

        return '';
    };

    // Groups of entries to rollup with multiple pass
    const entryGroups: Array<Array<string>> = [];
    const editorPatters = options.dbInfos.map(info => ps.join(info.target, '**/editor/**/*'));
    for (let iBundle = 0; iBundle < bundles.length; ++iBundle) {
        const bundle = bundles[iBundle];
        const entries = [];
        for (const script of bundle.scripts) {
            const url = pathToFileURL(script.file).href;
            uuidMap[url] = script.uuid;
            if (modulePreservation === 'facade' ||
                modulePreservation === 'preserve') {
                // If facade model is used,
                // we preserve the module structure.
                if (useEditorFolderFeature) {
                    if (!editorPatters.some(pattern => matchPattern(fileURLToPath(url), pattern))) {
                        // 排除 Editor 目录下的脚本
                        entries.push(url);
                    }
                } else {
                    entries.push(url);
                }
            }
            fileBundleMap[script.file] = iBundle;

            if (exposeEachAssetModule) {
                exposedFileModuleURLs.add(url);
            }
        }

        const preImportsModule = `virtual:///prerequisite-imports/${bundle.id}`;
        let bundleScriptFiles = bundle.scripts.map((script) => script.file);
        if (useEditorFolderFeature) {
            bundleScriptFiles = bundleScriptFiles.filter(file => !editorPatters.some(pattern => matchPattern(file, pattern)));
        }
        memoryMods[preImportsModule] = makePrerequisiteImports(bundleScriptFiles);
        fileBundleMap[preImportsModule] = iBundle;
        entries.push(preImportsModule);
        entryGroups.push(entries);
        prerequisiteModuleURLs.add(preImportsModule);
    }

    if (!bundleCommonChunk) {
        // merge into one time rollup
        const mergedEntries: Array<string> = [];
        entryGroups.forEach(entries => {
            mergedEntries.push(...entries);
        });
        entryGroups.length = 0;
        entryGroups.push(mergedEntries);
    }

    const externalEditorModules = getExternalEditorModules(options.cceModuleMap);
    const importRestrictions = await genImportRestrictions(options.dbInfos, externalEditorModules);
    const modLo = new ModLo({
        targets: options.transform.targets,
        loose: options.loose,
        exportsConditions: options.exportsConditions,
        guessCommonJsExports: options.guessCommonJsExports,
        useDefineForClassFields: options.useDefineForClassFields,
        allowDeclareFields: options.allowDeclareFields,
        _internalTransform: {
            excludes: options.transform?.excludes ?? [],
            includes: options.transform?.includes ?? [],
        },
        _compressUUID: (uuid: string) => options.uuidCompressMap[uuid],
        _helperModule: rpModLo.helperModule,
        hot: options.hotModuleReload,
        importRestrictions,
        preserveSymlinks: options.preserveSymlinks,
    });

    const userImportMap = options.importMap;

    const importMap: ImportMap = {};
    const importMapURL = userImportMap ? new URL(userImportMap.url) : new URL('foo:/bar');

    importMap.imports = {
        'cc/env': 'virtual:/cc/env',
        'cc/userland/macro': 'virtual:/cc/userland/macro',
    };

    const assetPrefixes: string[] = [];
    for (const dbInfo of options.dbInfos) {
        const dbURL = `db://${dbInfo.dbID}/`;
        const assetDirURL = pathToFileURL(ps.join(dbInfo.target, ps.join(ps.sep))).href;
        importMap.imports[dbURL] = assetDirURL;
        assetPrefixes.push(assetDirURL);
    }

    if (userImportMap) {
        if (userImportMap.json.imports) {
            importMap.imports = {
                ...importMap.imports,
                ...userImportMap.json.imports,
            };
        }
        if (userImportMap.json.scopes) {
            for (const [scopeRep, specifierMap] of Object.entries(userImportMap.json.scopes)) {
                const scopes = importMap.scopes ??= {};
                scopes[scopeRep] = {
                    ...(scopes[scopeRep] ?? {}),
                    ...specifierMap,
                };
            }
        }
    }

    modLo.setImportMap(importMap, importMapURL);
    modLo.setAssetPrefixes(assetPrefixes);

    modLo.addMemoryModule('virtual:/cc/env', ccEnvMod);

    // 处理自定义宏模块
    modLo.addMemoryModule('virtual:/cc/userland/macro',
        options.customMacroList.map((item: any) => `export const ${item.key} = ${item.value};`).join('\n'));

    for (const [url, code] of Object.entries(memoryMods)) {
        modLo.addMemoryModule(url, code);
    }

    for (const [url, uuid] of Object.entries(uuidMap)) {
        modLo.setUUID(url, uuid);
    }

    const rollupPlugins: rollup.Plugin[] = [
        rpModLo({ modLo }),
    ];
    if (modulePreservation === 'facade' || modulePreservation === 'erase') {
        rollupPlugins.push(rpNamedChunk());
    }
    if (options.sourceMaps) {
        rollupPlugins.push(rpSourcemaps());
    }
    if (!options.debug) {
        rollupPlugins.push(
            terser(),
            // TODO
        );
    }

    if (modulePreservation === 'erase') {
        rollupPlugins.push({
            name: 'cocos-creator/resolve-import-meta',
            resolveImportMeta(property, { moduleId }) {
                switch (property) {
                    default:
                        return undefined;
                    case 'url':
                        try {
                            const url = new URL(moduleId).href;
                            return `'${url}'`;
                        } catch {
                            console.error(`Can not access import.meta.url of module '${moduleId}'. '${moduleId}' is not a valid URL.`);
                            return undefined;
                        }
                }
            },
        });
    }

    const ignoreEmptyBundleWarning = options.modulePreservation !== 'preserve';

    const rollupWarningHandler: rollup.WarningHandlerWithDefault = (warning, defaultHandler) => {
        if (ignoreEmptyBundleWarning && (typeof warning === 'object') && warning.code === 'EMPTY_BUNDLE') {
            return;
        }

        if (typeof warning !== 'string') {
            if (warning.code === 'CIRCULAR_DEPENDENCY') {
                if (warning.importer?.includes('node_modules')) {
                    return;
                }
            }
        }

        // defaultHandler(warning);
        const message = typeof warning === 'object' ? (warning.message || warning) : warning;
        console.warn(`[[BuildGlobalInfo.Script.Rollup]] ${message}`);
    };

    const importMappings: Record<string, string> = {};
    // 如果开启了 bundleCommonChunk，则 iBundle 是 bundleIndex
    for (let iBundle = 0; iBundle < entryGroups.length; ++iBundle) {
        const entries = entryGroups[iBundle];

        if (bundleCommonChunk) {
            bundleIdToNameChunk = bundles[iBundle].id;
        }

        const rollupOptions: rollup.RollupOptions = {
            input: entries,
            plugins: rollupPlugins,
            preserveModules: modulePreservation !== 'erase',
            external: ['cc'],
            onwarn: rollupWarningHandler,
        };

        const rollupBuild = await rollup.rollup(rollupOptions);

        const rollupOutputOptions: rollup.OutputOptions = {
            sourcemap: options.sourceMaps,
            exports: 'named', // Explicitly set this to disable warning
            // about coexistence of default and named exports
        };
        if (options.modulePreservation === 'preserve') {
            rollupOutputOptions.format = options.moduleFormat;
        } else {
            // Facade or erase
            Object.assign(rollupOutputOptions, {
                format: 'system',
                strict: false,
                systemNullSetters: true,
            });
        }

        const rollupOutput = await rollupBuild.generate(rollupOutputOptions);

        if (options.modulePreservation === 'preserve') {
            const chunkHomeDir = options.commonDir;

            for (const chunkOrAsset of rollupOutput.output) {
                if (chunkOrAsset.type !== 'chunk') {
                    continue;
                } else {
                    const relativePath = chunkOrAsset.fileName.match(/\.(js|ts|mjs)$/)
                        ? chunkOrAsset.fileName
                        : `${chunkOrAsset.fileName}.js`;

                    const path = ps.join(chunkHomeDir, relativePath);
                    await fs.outputFile(
                        path,
                        chunkOrAsset.code,
                        'utf8',
                    );

                    const exposedURL = identifyExposedModule(chunkOrAsset);
                    if (exposedURL) {
                        // TODO: better calculation
                        const chunkPathBasedOnImportMap = `./chunks/${relativePath}`.replace(/\\/g, '/');
                        importMappings[exposedURL] = chunkPathBasedOnImportMap;
                    }
                }
            }
        } else if (bundleCommonChunk) {
            const bundle = bundles[iBundle];
            const entryChunkBundler: ChunkBundler = new ChunkBundler(bundle.outFile);
            for (const chunkOrAsset of rollupOutput.output) {
                if (chunkOrAsset.type !== 'chunk') {
                    continue;
                }
                entryChunkBundler.add(chunkOrAsset);
                const exposedURL = identifyExposedModule(chunkOrAsset);
                // 模块映射需要在模块内部做好，不依赖外部的 import-map，否则 bundle 将不能跨项目复用
                if (exposedURL) {
                    entryChunkBundler.addModuleMapping(exposedURL, getChunkUrl(chunkOrAsset));
                }
            }
            await entryChunkBundler.write({
                sourceMaps,
                wrap: false, // 主包把所有 System.register() 包起来，子包不包。
            });
        } else {
            const nonEntryChunksBundleOutFile = ps.join(options.commonDir, 'bundle.js');
            const nonEntryChunkBundler = new ChunkBundler(nonEntryChunksBundleOutFile);
            let nNonEntryChunks = 0;
            const entryChunkBundlers: ChunkBundler[] = bundles.map((bundle) => new ChunkBundler(bundle.outFile));
            for (const chunkOrAsset of rollupOutput.output) {
                if (chunkOrAsset.type !== 'chunk') {
                    continue;
                }
                // NOTE: 一些需要 CJS interop 的模块因为插入了 interop 模块，被 rollup 解析为非入口 chunk
                const isEntry = !!chunkOrAsset.facadeModuleId && entries.includes(chunkOrAsset.facadeModuleId);
                if (!chunkOrAsset.isEntry && !isEntry) {
                    nonEntryChunkBundler.add(chunkOrAsset);
                    ++nNonEntryChunks;
                } else {
                    const bundleIndex = getBundleIndexOfChunk(chunkOrAsset);
                    if (bundleIndex < 0 || entryChunkBundlers[bundleIndex] === undefined) {
                        console.warn(`Unexpected: entry chunk name ${chunkOrAsset.name} is not in list.`);
                        nonEntryChunkBundler.add(chunkOrAsset);
                        ++nNonEntryChunks;
                    } else {
                        entryChunkBundlers[bundleIndex].add(chunkOrAsset);

                        const exposedURL = identifyExposedModule(chunkOrAsset);
                        // 模块映射需要在模块内部做好，不依赖外部的 import-map，否则 bundle 将不能跨项目复用
                        if (exposedURL) {
                            entryChunkBundlers[bundleIndex].addModuleMapping(exposedURL, getChunkUrl(chunkOrAsset));
                        }
                    }
                }
            }

            console.debug(`Number of non-entry chunks: ${entryChunkBundlers.length}`);
            await Promise.all(entryChunkBundlers.map(async (entryChunkBundler, iEntry) => {
                await entryChunkBundler.write({
                    sourceMaps,
                    wrap: false, // 主包把所有 System.register() 包起来，子包不包。
                });
            }));
            if (nNonEntryChunks) {
                await nonEntryChunkBundler.write({
                    sourceMaps,
                    wrap: true,
                });
                const url = nonEntryChunksBundleOutFile;
                res.scriptPackages.push(url);
            }
        }
    }

    bundleIdToNameChunk = null;
    res.importMappings = importMappings;

    function makePrerequisiteImports(modules: string[]) {
        return modules.sort()
            .map((m) => {
                return `import "${pathToFileURL(m).href}";`;
            })
            .join('\n');
    }
    return res;
}

export interface IBuildScriptFunctionOption {
    /**
     * Are we in debug mode?
     */
    debug: boolean;

    /**
     * Whether to generate source maps or not.
     */
    sourceMaps: boolean | 'inline';

    /**
     * Module format.
     */
    moduleFormat: rollup.ModuleFormat;

    /**
     * Module preservation.
     */
    modulePreservation: ModulePreservation;

    /**
     * !!Experimental.
     */
    transform: TransformOptions;

    /**
     * All sub-packages.
     */
    bundles: Array<Bundle>;

    /**
     * Root output directory.
     */
    commonDir: string;

    hotModuleReload: boolean;

    applicationJS: string;

    dbInfos: DBInfo[];

    uuidCompressMap: Record<string, string>;

    customMacroList: MacroItem[];

    ccEnvConstants: CCEnvConstants;

    /**
     * This option will bundle external chunk into each bundle's chunk in order to achieve the purpose of cross-project reuse of the bundle.
     * This will increase the size of the bundle and introduce the issue of chunk doppelganger, so use it with caution.
     * @default false
     */
    bundleCommonChunk?: boolean;

    cceModuleMap: Record<string, any>;
}

export async function buildSystemJsCommand(options: IBuildSystemJsOption) {
    return await buildSystemJs({
        out: options.dest,
        // @ts-ignore TODO buildSystemJs 目前的 sourceMap 接口定义有缺失，需要发版本
        sourceMap: options.sourceMaps,
        minify: !options.debug,
        platform: options.platform,
        hmr: options.hotModuleReload,
    });
}

export async function buildPolyfillsCommand(options: IPolyFills = {}, dest: string) {

    const leastRequiredCoreJsModules: string[] = [
        'es.global-this', // globalThis
    ];
    // 构建 Polyfills
    const buildPolyfillsOptions: buildPolyfills.Options = {
        debug: false,
        sourceMap: false,
        // file: ps.join(result.paths.dir, 'src', 'polyfills.bundle.js'),
        file: dest,
    };
    // Async functions polyfills
    if (options.asyncFunctions) {
        buildPolyfillsOptions.asyncFunctions = true;
    }
    // CoreJs polyfills
    if (options.coreJs) {
        buildPolyfillsOptions.coreJs = {
            modules: ['es'],
            blacklist: [],
            targets: options.targets,
        };
    } else {
        buildPolyfillsOptions.coreJs = {
            modules: leastRequiredCoreJsModules,
            blacklist: [],
            targets: options.targets,
        };
    }
    const hasPolyfill = await buildPolyfills(buildPolyfillsOptions);
    // HACK buildPolyfills 返回值不对
    if (hasPolyfill && await pathExists(buildPolyfillsOptions.file)) {
        return true;
    }
    return false;
}
export interface TransformOptions {
    /**
     * Babel plugins to excluded. Will be passed to as partial `exclude` options of `@babel/preset-env`.
     */
    excludes?: Array<string | RegExp>;

    /**
     * Babel plugins to included. Will be passed to as partial `include` options of `@babel/preset-env`.
     */
    includes?: Array<string | RegExp>;

    targets?: ITransformTarget;
}

class ChunkBundler {
    private _out: string;
    private _parts: Array<[string /* for sort only, to ensure the order */, {
        code: string;
        map?: string;
    }]> = [];
    private _chunkMappings: Record<string, string> = {};

    constructor(out: string) {
        this._out = out;
    }

    add(chunk: rollup.OutputChunk) {
        this._parts.push([chunk.fileName, {
            code: chunk.code,
            map: chunk.map?.toString(),
        }]);
    }

    addModuleMapping(mapping: string, chunk: string) {
        this._chunkMappings[mapping] = chunk;
    }

    async write(options: { sourceMaps: boolean | 'inline', wrap?: boolean }) {
        return await packMods(
            this._parts.sort(
                ([a], [b]) => a.localeCompare(b),
            ).map(([_, p]) => p), this._chunkMappings, this._out, options);
    }
}

function rpNamedChunk(): rollup.Plugin {
    return {
        name: 'named-chunk',
        renderChunk: async function (this, code, chunk, options) {

            const chunkId = getChunkUrl(chunk);
            const transformResult = await babel.transformAsync(code, {
                sourceMaps: true,
                compact: false,
                plugins: [[toNamedRegister, { name: chunkId }]],
            });
            if (!transformResult) {
                this.warn('Failed to render chunk.');
                return null;
            }
            return {
                code: transformResult.code!,
                map: transformResult.map,
            };
        },
    };
}

function getChunkUrl(chunk: rollup.RenderedChunk) {
    if (bundleIdToNameChunk) {
        // 解决 bundle 跨项目时模块命名冲突的问题
        return `bundle://${bundleIdToNameChunk}/${chunk.fileName}`;
    } else {
        return `chunks:///${chunk.fileName}`;
    }
}
