
import ps from 'path';
import fs from 'fs-extra';
import { fileURLToPath, pathToFileURL, URL } from 'url';
import { performance } from 'perf_hooks';
import { makePrerequisiteImportsMod, makeTentativePrerequisiteImports, prerequisiteImportsModURL } from './prerequisite-imports';
import { editorBrowserslistQuery } from '@editor/lib-programming/dist/utils';
import { StatsQuery } from '@cocos/ccbuild';
import { asserts } from '../utils/asserts';
import { querySharedSettings, SharedSettings } from '../shared/query-shared-settings';
import { Logger } from '@cocos/creator-programming-common/lib/logger';
import { QuickPack } from '@cocos/creator-programming-quick-pack/lib/quick-pack';
import { QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack/lib/loader';
import {
    ModLo,
    MemoryModule,
    ModLoOptions,
    ImportMap,
} from '@cocos/creator-programming-mod-lo/lib/mod-lo';
import { AssetChange, AssetChangeType, AssetDatabaseDomain, AssetDbInterop, ModifiedAssetChange } from './asset-db-interop';
import { PackerDriverLogger } from './logger';
import { LanguageServiceAdapter } from '../language-service';
import { DbURLInfo } from '../intelligence';
import { AsyncDelegate } from '../utils/delegate';
import ts from 'typescript';
import JSON5 from 'json5';
import minimatch from 'minimatch';
import { existsSync } from 'fs';
import { IAssetDBInfo } from '../../assets/@types/protected';
import { assetDBManager } from '../../assets/manager/asset-db';
import { url2path } from '../../assets/utils';
import { compressUuid } from '../../assets/builder/worker/builder/utils';
import { configurationManager } from '../../configuration';
import { TypeScriptConfigBuilder } from '../intelligence';



const VERSION = '20';

const featureUnitModulePrefix = 'cce:/internal/x/cc-fu/';

const useEditorFolderFeature = false; // TODO: 之后正式接入编辑器 Editor 目录后移除这个开关

function matchPattern(path: string, pattern: string): boolean {
    return minimatch(path.replace(/\\/g, '/'), pattern.replace(/\\/g, '/'));
}

async function getEditorPatterns() {
    const dbList: string[] = Object.keys(assetDBManager.assetDBMap);
    const editorPatterns = [];
    for (const dbID of dbList) {
        const dbInfo = assetDBManager.assetDBInfo[dbID] || null;
        const dbEditorPattern = ps.join(dbInfo.target, '**', 'editor', '**/*');
        editorPatterns.push(dbEditorPattern);
    }
    return editorPatterns;
}

function getCCEModuleIDs(cceModuleMap: CCEModuleMap) {
    return Object.keys(cceModuleMap).filter(id => id !== 'mapLocation');
}

async function wrapToSetImmediateQueue<Target, Args extends any[], Result>(thiz: Target, fn: (...args: Args) => Result, ...args: Args): Promise<Result> {
    return new Promise<Result>((resolve, reject) => {
        // 注意：Editor.Message.broadcast 内部会使用 setImmediate 延时广播事件。
        // 如果在 broadcast 之后调用了比较耗时的操作，那么消息会在耗时操作后才被收到。
        // 因此这里使用 setImmediate 来转换同步函数为异步，保证转换的函数在 broadcast 消息被收到后再执行。
        setImmediate(() => {
            try {
                resolve(fn.apply(thiz, args));
            } catch (e: any) {
                reject(e);
            }
        });
    });
}

interface BuildResult {
    depsGraph: Record<string, string[]>;
}

interface CCEModuleConfig {
    description: string;
    main: string;
    types: string;
}

type CCEModuleMap = {
    [moduleName: string]: CCEModuleConfig;
} & {
    mapLocation: string;
};

/**
 * Packer 驱动器。
 * - 底层用 QuickPack 快速打包模块相关的资源。
 * - 监听涉及到的所有模块变动并重进行打包，包括：
 *   - asset-db 代码相关资源的变动。
 *   - 引擎设置变动。
 * - 产出是可以进行加载的模块资源，包括模块、Source map等；需要使用 QuickPackLoader 对这些模块资源进行加载和访问。
 */
export class PackerDriver {
    public languageService: LanguageServiceAdapter;
    private static _instance: PackerDriver | null = null;

    public static getInstance(): PackerDriver {
        asserts(PackerDriver._instance, 'PackerDriver is not created yet. Please call PackerDriver.create first.');
        return PackerDriver._instance;
    }

    /**
     * 创建 Packer 驱动器。
     */
    public static async create(projectPath: string, engineTsPath: string) {
        const tsBuilder = new TypeScriptConfigBuilder(projectPath, engineTsPath);
        PackerDriver._cceModuleMap = PackerDriver.queryCCEModuleMap();
        const baseWorkspace = ps.join(tsBuilder.getTempPath(), 'programming', 'packer-driver');
        const versionFile = ps.join(baseWorkspace, 'VERSION');
        const targetWorkspaceBase = ps.join(baseWorkspace, 'targets');
        const debugLogFile = ps.join(baseWorkspace, 'logs', 'debug.log');

        const targets: PackerDriver['_targets'] = {};

        const verbose = true;
        if (await fs.pathExists(debugLogFile)) {
            try {
                await fs.unlink(debugLogFile);
            } catch (err) {
                console.warn(`Failed to reset log file: ${debugLogFile}`);
            }
        }

        const logger = new PackerDriverLogger(debugLogFile);

        logger.debug(new Date().toLocaleString());
        logger.debug(`Project: ${projectPath}`);
        logger.debug(`Targets: ${Object.keys(predefinedTargets)}`);

        const incrementalRecord = await PackerDriver._createIncrementalRecord(logger);

        await PackerDriver._validateIncrementalRecord(
            incrementalRecord,
            versionFile,
            targetWorkspaceBase,
            logger,
        );

        const loadMappings: Record<string, string> = {
            'cce:/internal/code-quality/': pathToFileURL(
                ps.join(__dirname, '..', '..', 'static', 'builtin-mods', 'code-quality', '/')).href,
        };

        const statsQuery = await StatsQuery.create(engineTsPath);

        const emptyEngineIndexModuleSource = statsQuery.evaluateIndexModuleSource([]);

        const crOptions: ModLoOptions['cr'] = {
            moduleRequestFilter: [/^cc\.?.*$/g],
            reporter: {
                moduleName: 'cce:/internal/code-quality/cr.mjs',
                functionName: 'report',
            },
        };

        for (const [targetId, target] of Object.entries(predefinedTargets)) {
            logger.debug(`Initializing target [${target.name}]`);

            const modLoExternals: string[] = [
                'cc/env',
                'cc/userland/macro',
                ...getCCEModuleIDs(PackerDriver._cceModuleMap), // 设置编辑器导出的模块为外部模块
            ];

            modLoExternals.push(...statsQuery.getFeatureUnits().map(
                (featureUnit) => `${featureUnitModulePrefix}${featureUnit}`));

            let browsersListTargets = target.browsersListTargets;
            if (targetId === 'preview' && incrementalRecord.config.previewTarget) {
                browsersListTargets = incrementalRecord.config.previewTarget;
                logger.debug(`Use specified preview browserslist target: ${browsersListTargets}`);
            }
            const modLo = new ModLo({
                targets: browsersListTargets,
                loose: incrementalRecord.config.loose,
                guessCommonJsExports: incrementalRecord.config.guessCommonJsExports,
                useDefineForClassFields: incrementalRecord.config.useDefineForClassFields,
                allowDeclareFields: incrementalRecord.config.allowDeclareFields,
                cr: crOptions,
                _compressUUID(uuid: string) {
                    return compressUuid(uuid, false);
                },
                logger,
                checkObsolete: true,
                importRestrictions: PackerDriver._importRestrictions,
                preserveSymlinks: incrementalRecord.config.preserveSymlinks,
            });

            modLo.setExtraExportsConditions(incrementalRecord.config.exportsConditions);
            modLo.setExternals(modLoExternals);
            modLo.setLoadMappings(loadMappings);

            const targetWorkspace = ps.join(targetWorkspaceBase, targetId);
            const quickPack = new QuickPack({
                modLo,
                origin: projectPath,
                workspace: targetWorkspace,
                logger,
                verbose,
            });

            logger.debug('Loading cache');
            const t1 = performance.now();
            await quickPack.loadCache();
            const t2 = performance.now();
            logger.debug(`Loading cache costs ${t2 - t1}ms.`);

            let engineIndexModule:
                ConstructorParameters<typeof PackTarget>[0]['engineIndexModule'];
            if (target.isEditor) {
                const features = await PackerDriver._getEngineFeaturesShippedInEditor(statsQuery);
                logger.debug(`Engine features shipped in editor: ${features}`);
                engineIndexModule = {
                    source: PackerDriver._getEngineIndexModuleSource(statsQuery, features),
                    respectToFeatureSetting: false,
                };
            } else {
                engineIndexModule = {
                    source: emptyEngineIndexModuleSource,
                    respectToFeatureSetting: true,
                };
            }

            const quickPackLoaderContext = quickPack.createLoaderContext();
            targets[targetId] = new PackTarget({
                name: targetId,
                modLo,
                sourceMaps: target.sourceMaps,
                quickPack,
                quickPackLoaderContext,
                logger,
                engineIndexModule,
                tentativePrerequisiteImportsMod: target.isEditor ?? false,
                userImportMap: incrementalRecord.config.importMap ? {
                    json: incrementalRecord.config.importMap.json,
                    url: new URL(incrementalRecord.config.importMap.url),
                } : undefined,
            });
        }

        const packer = new PackerDriver(
            tsBuilder,
            targets,
            statsQuery,
            logger,
            await tsBuilder.getCompilerOptions(),
            await tsBuilder.getInternalDbURLInfos()
        );
        PackerDriver._instance = packer;
        return packer;
    }

    public static async updateImportRestrictions() {
        if (!useEditorFolderFeature) {
            return;
        }

        const dbInfos = Object.values(assetDBManager.assetDBInfo);
        const restrictions = PackerDriver._importRestrictions;
        restrictions.length = 0;
        const banSourcePatterns = await getEditorPatterns();
        banSourcePatterns.push(...getCCEModuleIDs(PackerDriver._cceModuleMap)); // 禁止从这些模块里导入

        for (let i = 0; i < dbInfos.length; ++i) {
            const dbInfo = dbInfos[i];
            const dbPattern = ps.join(dbInfo.target, '**/*');
            const dbEditorPattern = ps.join(dbInfo.target, '**', 'editor', '**/*');
            restrictions[i] = {
                importerPatterns: [dbPattern, '!' + dbEditorPattern], // TODO: 如果需要兼容就项目，则路径不能这么配置，等编辑器提供查询接口
                banSourcePatterns,
            };
        }
    }

    public static queryCCEModuleMap(): CCEModuleMap {
        const cceModuleMapLocation = ps.join(__dirname, '../../../../static/scripting/cce-module.jsonc');
        const cceModuleMap = JSON5.parse(fs.readFileSync(cceModuleMapLocation, 'utf8')) as CCEModuleMap;
        cceModuleMap.mapLocation = cceModuleMapLocation;
        return cceModuleMap;
    }

    /**构建任务的委托，在构建之前会把委托里面的所有内容执行 */
    public readonly beforeEditorBuildDelegate: AsyncDelegate<(changes: ModifiedAssetChange[]) => Promise<void>> = new AsyncDelegate();
    public busy() {
        return this._asyncIteration.busy();
    }

    public async mountDatabase(dbInfo: IAssetDBInfo) {
        const assetInfos = await this._assetDbInterop.onMountDatabase(dbInfo);
        assetInfos.forEach((info) => {
            this._assetChangeQueue.push({
                type: AssetChangeType.add,
                filePath: info.filePath,
                uuid: info.uuid,
                isPluginScript: info.isPluginScript,
                url: info.url,
            });
        });
        // TODO 应该新增缓存即可，不需要全部重新查询
        await PackerDriver.updateImportRestrictions();
    }

    public async unmountDatabase(dbInfo: IAssetDBInfo) {
        const assetInfos = await this._assetDbInterop.onUnmountDatabase(dbInfo);
        assetInfos.forEach((info) => {
            this._assetChangeQueue.push({
                type: AssetChangeType.remove,
                filePath: info.filePath,
                uuid: info.uuid,
                isPluginScript: info.isPluginScript,
                url: info.url,
            });
        });

        // TODO 应该删除缓存即可，不需要全部重新查询
        await PackerDriver.updateImportRestrictions();
    }

    public async resetDatabases(build = true) {
        const assetDatabaseDomains = await this._assetDbInterop.queryAssetDomains();
        this._logger.debug(
            'Reset databases. ' +
            `Enumerated domains: ${JSON.stringify(assetDatabaseDomains, undefined, 2)}`);

        const setTargets = () => {
            for (const target of Object.values(this._targets)) {
                target.setAssetDatabaseDomains(assetDatabaseDomains);
            }
        };

        if (build) {
            this._triggerNextBuild(setTargets);
        } else {
            setTargets();
        }
    }

    /**
     * 从 asset-db 获取所有数据并构建。
     */
    public async build() {
        const logger = this._logger;

        logger.debug('Pulling asset-db.');

        const t1 = performance.now();
        await this._fetchAll();
        const t2 = performance.now();

        logger.debug(`Fetch asset-db cost: ${t2 - t1}ms.`);

        await this._waitForBuild();
        return;
    }

    public async clearCache() {
        if (this._clearing) {
            this._logger.debug('Failed to clear cache: previous clearing have not finished yet.');
            return;
        }
        if (this.busy()) {
            this._logger.error('Failed to clear cache: the building is still working in progress.');
            return;
        }
        this._clearing = true;
        for (const [name, target] of Object.entries(this._targets)) {
            this._logger.debug(`Clear cache of target ${name}`);
            await target.clearCache();
        }
        this._logger.debug('Request build after clearing...');
        this._dispatchBuildRequest();
        this._clearing = false;
    }

    public getQuickPackLoaderContext(targetName: TargetName) {
        this._warnMissingTarget(targetName);
        if (targetName in this._targets) {
            return this._targets[targetName].quickPackLoaderContext;
        } else {
            return undefined;
        }
    }

    public isReady(targetName: TargetName) {
        this._warnMissingTarget(targetName);
        if (targetName in this._targets) {
            return this._targets[targetName].ready;
        } else {
            return undefined;
        }
    }

    public queryScriptDeps(scriptPath: string): string[] {
        this._transformDepsGraph();
        if (this._depsGraphCache[scriptPath]) {
            return Array.from(this._depsGraphCache[scriptPath]);
        }
        return [];
    }
    public queryScriptUsers(scriptPath: string): string[] {
        this._transformDepsGraph();
        if (this._usedGraphCache[scriptPath]) {
            return Array.from(this._usedGraphCache[scriptPath]);
        }
        return [];
    }

    public async shutDown() {
        await this.destroyed();
    }

    private _tsBuilder: TypeScriptConfigBuilder;
    private _clearing = false;
    private _targets: Record<TargetName, PackTarget> = {};
    private _logger: PackerDriverLogger;
    private _statsQuery: StatsQuery;
    private _asyncIteration: AsyncIterationConcurrency1;
    private readonly _assetDbInterop: AssetDbInterop;
    private _assetChangeQueue: AssetChange[] = [];
    private _featureChanged = false;
    private _beforeBuildTasks: (() => void)[] = [];
    private _depsGraph: Record<string, string[]> = {};
    private _needUpdateDepsCache = false;
    private _usedGraphCache: Record<string, Set<string>> = {};
    private _depsGraphCache: Record<string, Set<string>> = {};
    private static _cceModuleMap: CCEModuleMap;
    private static _importRestrictions: any[] = [];
    private _init = false;
    private _features: string[] = [];

    private constructor(builder: TypeScriptConfigBuilder, targets: PackerDriver['_targets'], statsQuery: StatsQuery, logger: PackerDriverLogger, compilerOptions: Readonly<ts.CompilerOptions>, dbURLInfos: readonly DbURLInfo[]) {
        this._tsBuilder = builder;
        this._targets = targets;
        this._statsQuery = statsQuery;
        this._logger = logger;
        this.languageService = new LanguageServiceAdapter(builder.getRealTsConfigPath(), builder.getProjectPath(), this.beforeEditorBuildDelegate, compilerOptions, dbURLInfos);
        this._assetDbInterop = new AssetDbInterop(this._onSomeAssetChangesWereMade.bind(this));

        this._asyncIteration = new AsyncIterationConcurrency1(async () => {
            return await this._startBuildIteration();
        });
    }

    public set features(features: string[]) {
        this._features = features;
    }

    public async init(features: string[]) {
        if (this._init) {
            return;
        }
        this._init = true;
        this._features = features;
        await this._assetDbInterop.init();
        await this._syncEngineFeatures(features);
    }

    public async querySharedSettings(): Promise<SharedSettings> {
        return querySharedSettings(this._logger);
    }

    async destroyed() {
        this._init = false;
        await this._assetDbInterop.destroyed();
    }

    private _warnMissingTarget(targetName: TargetName) {
        if (!(targetName in this._targets)) {
            console.warn(`Invalid pack target: ${targetName}. Existing targets are: ${Object.keys(this._targets)}`);
        }
    }

    /**
     * 当资源更改计时器的时间到了之后，我们发起一次构建请求。
     */
    private _onSomeAssetChangesWereMade(changes: ReadonlyArray<AssetChange>) {
        this._logger.debug(
            `Dispatch build request for time accumulated ${changes.length} asset changes.`);
        this._assetChangeQueue.push(...changes);
        this._dispatchBuildRequest();
    }

    /**
     * 开始一次构建。
     */
    private async _startBuildIteration() {
        this._logger.clear();
        this._logger.debug(
            'Build iteration starts.\n' +
            `Number of accumulated asset changes: ${this._assetChangeQueue.length}\n` +
            `Feature changed: ${this._featureChanged}`,
        );
        if (this._featureChanged) {
            this._featureChanged = false;
            await this._syncEngineFeatures(this._features);
        }
        const assetChanges = this._assetChangeQueue;
        this._assetChangeQueue = [];
        const beforeTasks = this._beforeBuildTasks.slice();
        this._beforeBuildTasks.length = 0;
        for (const beforeTask of beforeTasks) {
            beforeTask();
        }
        try {
            await this.beforeEditorBuildDelegate.dispatch(assetChanges.filter(item => item.type === AssetChangeType.modified) as ModifiedAssetChange[]);
        } catch (error) {
            console.debug(error);
        }

        const nonDTSChanges = assetChanges.filter(item => !item.filePath.endsWith('.d.ts'));
        for (const [, target] of Object.entries(this._targets)) {
            if (assetChanges.length !== 0) {
                await target.applyAssetChanges(nonDTSChanges);
            }
            const buildResult = await target.build();
            this._depsGraph = buildResult.depsGraph; // 更新依赖图
            this._needUpdateDepsCache = true;
        }
    }

    /**
     * 请求一次构建，如果正在构建，会和之前的请求合并。
     */
    private async _waitForBuild() {
        return this._asyncIteration.nextIteration();
    }

    /**
     * 请求一次构建，如果正在构建，会和之前的请求合并。
     */
    private _dispatchBuildRequest() {
        void this._asyncIteration.nextIteration();
    }

    private static async _createIncrementalRecord(logger: Logger): Promise<IncrementalRecord> {
        const sharedModLoOptions = await querySharedSettings(logger);

        const incrementalRecord: IncrementalRecord = {
            version: VERSION,
            config: {
                ...sharedModLoOptions,
            },
        };

        const previewBrowsersListConfigFile = await configurationManager.getValue('project.script.previewBrowserslistConfigFile') as string;
        if (previewBrowsersListConfigFile && previewBrowsersListConfigFile !== 'project://') {
            const previewBrowsersListConfigFilePath = url2path(previewBrowsersListConfigFile as string);
            try {
                if (previewBrowsersListConfigFilePath && existsSync(previewBrowsersListConfigFilePath)) {
                    const previewTarget = await readBrowserslistTarget(previewBrowsersListConfigFilePath);
                    if (previewTarget) {
                        incrementalRecord.config.previewTarget = previewTarget;
                    }
                } else {
                    logger.warn(`Preview target config file not found. ${previewBrowsersListConfigFilePath || previewBrowsersListConfigFile}`);
                }
            } catch (error) {
                logger.error(`Failed to load preview target config file at ${previewBrowsersListConfigFilePath || previewBrowsersListConfigFile}: ${error}`);
            }
        }

        return incrementalRecord;
    }

    private static async _validateIncrementalRecord(
        record: IncrementalRecord,
        recordFile: string,
        targetWorkspaceBase: string,
        logger: Logger,
    ): Promise<boolean> {
        let matched = false;
        try {
            const oldRecord: IncrementalRecord = await fs.readJson(recordFile);
            matched = matchObject(record, oldRecord);
            if (matched) {
                logger.debug('Incremental file seems great.');
            } else {
                logger.debug(
                    '[PackerDriver] Options doesn\'t match.\n' +
                    `Last: ${JSON.stringify(record, undefined, 2)}\n` +
                    `Current: ${JSON.stringify(oldRecord, undefined, 2)}`,
                );
            }
        } catch (err) {
            logger.debug(`Packer deriver version file lost or format incorrect: ${err}`);
        }

        if (!matched) {
            logger.debug('Clearing out the targets...');
            await fs.emptyDir(targetWorkspaceBase);
            await fs.outputJson(recordFile, record, { spaces: 2 });
        }

        return matched;
    }

    private async _fetchAll() {
        const assetChanges = await this._assetDbInterop.fetchAll();
        this._assetChangeQueue.push(...assetChanges);

    }

    private static async _getEngineFeaturesShippedInEditor(statsQuery: StatsQuery) {
        // 从 v3.8.5 开始，支持手动加载 WASM 模块，提供了 loadWasmModuleBox2D, loadWasmModuleBullet 等方法，这些方法是在 feature 入口 ( exports 目录下的文件导出的)
        // 之前剔除这些后端 feature 入口，应该是在 https://github.com/cocos/3d-tasks/issues/5747 中的建议。
        // 但实际上，编辑器环境下的引擎打包的时候，已经把所有模块打进 bundled/index.js 中，见：https://github.com/cocos/cocos-editor/blob/3.8.5/app/builtin/engine/static/engine-compiler/source/index.ts#L114 。
        // 启动引擎也执行了每个后端的代码，详见：https://github.com/cocos/cocos-editor/blob/3.8.5/app/builtin/scene/source/script/3d/manager/startup/engine/index.ts#L97 。
        // 项目 import 的 cc 在这里被加载： https://github.com/cocos/cocos-editor/blob/3.8.5/packages/lib-programming/src/executor/index.ts#L355 
        // 其包含的导出 features 是根据 _getEngineFeaturesShippedInEditor 这个当前函数返回的 features 决定的。因此，不会包含 loadWasmModuleBox2D， loadWasmModuleBullet， loadWasmModulePhysX 这几个函数。
        // 这个逻辑跟浏览器预览、构建后的运行时环境都有差异，而且没有必要，排除这些方法只会导致差异，并不能带来包体、性能方面的提升。
        return statsQuery.getFeatures();

        // const editorFeatures: string[] = statsQuery.getFeatures().filter((featureName) => {
        //     return ![
        //         'physics-ammo',
        //         'physics-builtin',
        //         'physics-cannon',
        //         'physics-physx',
        //         'physics-2d-box2d',
        //         'physics-2d-builtin',
        //     ].includes(featureName);
        // });
        // return editorFeatures;
    }

    private async _syncEngineFeatures(features: string[]) {
        this._logger.debug(`Sync engine features: ${features}`);

        const engineIndexModuleSource = PackerDriver._getEngineIndexModuleSource(this._statsQuery, features);
        for (const [, target] of Object.entries(this._targets)) {
            if (target.respectToEngineFeatureSetting) {
                target.setEngineIndexModuleSource(engineIndexModuleSource);
            }
        }
    }

    private static _getEngineIndexModuleSource(statsQuery: StatsQuery, features: string[]) {
        const featureUnits = statsQuery.getUnitsOfFeatures(features);
        const engineIndexModuleSource = statsQuery.evaluateIndexModuleSource(
            featureUnits,
            (featureUnit) => `${featureUnitModulePrefix}${featureUnit}`,
        );
        return engineIndexModuleSource;
    }

    private async _triggerNextBuild(beforeBuildTask: () => void) {
        this._beforeBuildTasks.push(beforeBuildTask);
        this._dispatchBuildRequest();
    }

    /**
     * 将 depsGraph 从 file 协议转成 db 路径协议。
     * 并且过滤掉一些外部模块。
     */
    private _transformDepsGraph() {
        if (!this._needUpdateDepsCache) {
            return;
        }
        this._needUpdateDepsCache = false;
        const _depsGraph: Record<string, Set<string>> = {};
        const _usedGraph: Record<string, Set<string>> = {};
        for (const [scriptFilePath, depFilePaths] of Object.entries(this._depsGraph)) {
            if (!scriptFilePath.startsWith('file://')) {
                continue;
            }
            const scriptPath = fileURLToPath(scriptFilePath);
            if (!_depsGraph[scriptPath]) {
                _depsGraph[scriptPath] = new Set();
            }
            for (const path of depFilePaths) {
                if (!path.startsWith('file://')) {
                    continue;
                }
                const depPath = fileURLToPath(path);
                _depsGraph[scriptPath].add(depPath);
                if (!_usedGraph[depPath]) {
                    _usedGraph[depPath] = new Set();
                }
                _usedGraph[depPath].add(scriptPath);
            }
        }
        this._usedGraphCache = _usedGraph;
        this._depsGraphCache = _depsGraph;
    }
}

const engineIndexModURL = 'cce:/internal/x/cc';

type TargetName = string;

type PredefinedTargetName = 'editor' | 'preview';

const DEFAULT_PREVIEW_BROWSERS_LIST_TARGET = 'supports es6-module';

const predefinedTargets: Record<PredefinedTargetName, PredefinedTarget> = {
    editor: {
        name: 'Editor',
        browsersListTargets: editorBrowserslistQuery,
        sourceMaps: 'inline',
        isEditor: true,
    },
    preview: {
        name: 'Preview',
        sourceMaps: true,
        browsersListTargets: DEFAULT_PREVIEW_BROWSERS_LIST_TARGET,
    },
} as const;

async function readBrowserslistTarget(browserslistrcPath: string) {
    let browserslistrcSource: string;
    try {
        browserslistrcSource = await fs.readFile(browserslistrcPath, 'utf8');
    } catch (err) {
        return;
    }

    const queries = parseBrowserslistQueries(browserslistrcSource);
    if (queries.length === 0) {
        return;
    }

    return queries.join(' or ');

    function parseBrowserslistQueries(source: string) {
        const queries: string[] = [];
        for (const line of source.split('\n')) {
            const iSharp = line.indexOf('#');
            const lineTrimmed = (iSharp < 0 ? line : line.substr(0, iSharp)).trim();
            if (lineTrimmed.length !== 0) {
                queries.push(lineTrimmed);
            }
        }
        return queries;
    }
}

interface PredefinedTarget {
    name: string;
    browsersListTargets?: ModLoOptions['targets'];
    sourceMaps?: boolean | 'inline';
    isEditor?: boolean;
}

interface ImportMapWithURL {
    json: ImportMap;
    url: URL;
}

// 考虑到这是潜在的收费点，默认关闭入口脚本的优化功能
const OPTIMIZE_ENTRY_SOURCE_COMPILATION = false;

class PackTarget {
    constructor(options: {
        name: string;
        modLo: ModLo;
        sourceMaps?: boolean | 'inline';
        quickPack: QuickPack;
        quickPackLoaderContext: QuickPackLoaderContext;
        logger: Logger;
        tentativePrerequisiteImportsMod: boolean;
        engineIndexModule: {
            /**
             * `'cc'` 模块的初始内容。
             */
            source: string;

            /**
             * 这个目标的是否理会用户的引擎功能设置。
             * 如果是，`setEngineIndexModuleSource` 不会被调用。
             * 否则，当编辑器的引擎功能改变时，`setEngineIndexModuleSource` 会被调用以重新设置 `'cc'` 模块的内容。
             */
            respectToFeatureSetting: boolean;
        };
        userImportMap?: ImportMapWithURL;
    }) {
        this._name = options.name;
        this._modLo = options.modLo;
        this._quickPack = options.quickPack;
        this._quickPackLoaderContext = options.quickPackLoaderContext;
        this._sourceMaps = options.sourceMaps;
        this._logger = options.logger;
        this._respectToFeatureSetting = options.engineIndexModule.respectToFeatureSetting;
        this._tentativePrerequisiteImportsMod = options.tentativePrerequisiteImportsMod;
        this._userImportMap = options.userImportMap;

        const modLo = this._modLo;
        this._entryMod = modLo.addMemoryModule(prerequisiteImportsModURL,
            (this._tentativePrerequisiteImportsMod ? makeTentativePrerequisiteImports : makePrerequisiteImportsMod)([]));
        this._entryModSource = this._entryMod.source;

        this._engineIndexMod = modLo.addMemoryModule(engineIndexModURL, options.engineIndexModule.source);

        this.setAssetDatabaseDomains([]);
    }

    get quickPackLoaderContext() {
        return this._quickPackLoaderContext;
    }

    get ready() {
        return this._ready;
    }

    get respectToEngineFeatureSetting() {
        return this._respectToFeatureSetting;
    }

    public async build(): Promise<BuildResult> {
        this._ensureIdle();
        this._buildStarted = true;
        const targetName = this._name;
        this._logger.debug(`Target(${targetName}) build started.`);

        let buildResult: BuildResult | undefined;
        const t1 = performance.now();
        try {
            const prerequisiteAssetMods = await this._getPrerequisiteAssetModsWithFilter();
            const buildEntries = [
                engineIndexModURL,
                prerequisiteImportsModURL,
                ...prerequisiteAssetMods,
            ];
            const cleanResolution = this._cleanResolutionNextTime;
            if (cleanResolution) {
                this._cleanResolutionNextTime = false;
            }
            if (cleanResolution) {
                console.debug('This build will perform a clean module resolution.');
            }

            await wrapToSetImmediateQueue(this, async () => {
                buildResult = await this._quickPack.build(buildEntries, {
                    retryResolutionOnUnchangedModule: this._firstBuild,
                    cleanResolution: cleanResolution,
                });
            });

            this._firstBuild = false;
        } catch (err: any) {
            this._logger.error(`${err}, stack: ${err.stack}`);
        }
        const t2 = performance.now();
        this._logger.debug(`Target(${targetName}) ends with cost ${t2 - t1}ms.`);

        this._ready = true;
        this._buildStarted = false;
        if (buildResult) {
            return buildResult;
        } else {
            console.warn('Cannot get build result from quick pack.');
            return { depsGraph: {} };
        }
    }

    public async clearCache() {
        this._quickPack.clear();
        this._firstBuild = true;
    }

    public async applyAssetChanges(changes: readonly AssetChange[]) {
        this._ensureIdle();
        for (const change of changes) {
            const uuid = change.uuid;
            // Note: "modified" directive is decomposed as "remove" and "add".
            if (change.type === AssetChangeType.modified ||
                change.type === AssetChangeType.remove) {
                const oldURL = this._uuidURLMap.get(uuid);
                if (!oldURL) {
                    // As of now, we receive an asset modifying or changing directive
                    // but the asset was not processed by us before.
                    // This however can only happen when:
                    // - the asset is removed, and it's an plugin script;
                    // - the asset is modified from plugin script to non-plugin-script.
                    // Otherwise, something went wrong.
                    // But we could not distinguish the second reason from
                    // "received an error asset change directive"
                    // since we don't know the asset's previous status. So we choose to skip this check.
                    // this._logger.warn(`Unexpected: ${uuid} is not in registry.`);
                } else {
                    this._uuidURLMap.delete(uuid);
                    this._modLo.unsetUUID(oldURL);
                    const deleted = this._prerequisiteAssetMods.delete(oldURL);
                    if (!deleted) {
                        this._logger.warn(`Unexpected: ${oldURL} is not in registry.`);
                    }
                }
            }
            if (change.type === AssetChangeType.modified ||
                change.type === AssetChangeType.add) {
                if (change.isPluginScript) {
                    continue;
                }
                const { href: url } = change.url;
                this._uuidURLMap.set(uuid, url);
                this._modLo.setUUID(url, uuid);
                this._prerequisiteAssetMods.add(url);
            }
        }

        // Update the import main module
        const prerequisiteImports = await this._getPrerequisiteAssetModsWithFilter();
        const source = (this._tentativePrerequisiteImportsMod ? makeTentativePrerequisiteImports : makePrerequisiteImportsMod)(prerequisiteImports);
        
        console.time('update entry mod');
        if (OPTIMIZE_ENTRY_SOURCE_COMPILATION) {
            // 注意：.source 是一个 setter，其内部会更新 timestamp，导致每次都重新编译入口文件，如果项目比较大，入口文件的编译会非常耗时。
            // 这里优化，只有在有差异的情况下才去更新 source
            if (this._entryModSource.length !== source.length || this._entryModSource !== source) {
                this._entryModSource = this._entryMod.source = source;
            }
        } else {
            // 旧的逻辑是每次任意脚本变化，都重新设置入口 source，对大项目影响比较大
            this._entryModSource = this._entryMod.source = source;
        }
        console.timeEnd('update entry mod');
    }

    public setEngineIndexModuleSource(source: string) {
        this._ensureIdle();
        this._engineIndexMod.source = source;
    }

    public setAssetDatabaseDomains(assetDatabaseDomains: AssetDatabaseDomain[]) {
        this._ensureIdle();

        const { _userImportMap: userImportMap } = this;

        const importMap: ImportMap = {};
        const importMapURL = userImportMap ? userImportMap.url : new URL('foo:/bar');

        // Integrates builtin mappings, since all of builtin mappings are absolute, we do not need parse.
        importMap.imports = {};
        importMap.imports['cc'] = engineIndexModURL;
        const assetPrefixes: string[] = [];
        for (const assetDatabaseDomain of assetDatabaseDomains) {
            const assetDirURL = pathToFileURL(ps.join(assetDatabaseDomain.physical, ps.join(ps.sep))).href;
            importMap.imports[assetDatabaseDomain.root.href] = assetDirURL;
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

        this._logger.debug(
            `Our import map(${importMapURL}): ${JSON.stringify(importMap, undefined, 2)}`,
        );

        this._modLo.setImportMap(importMap, importMapURL);
        this._modLo.setAssetPrefixes(assetPrefixes);

        this._cleanResolutionNextTime = true;
    }

    private _buildStarted = false;
    private _ready = false;
    private _name: string;
    private _engineIndexMod: MemoryModule;
    private _entryMod: MemoryModule;
    private _entryModSource = '';
    private _modLo: ModLo;
    private _sourceMaps?: boolean | 'inline';
    private _quickPack: QuickPack;
    private _quickPackLoaderContext: QuickPackLoaderContext;
    private _prerequisiteAssetMods: Set<string> = new Set();
    private _uuidURLMap: Map<string, string> = new Map();
    private _logger: Logger;
    private _firstBuild = true;
    private _cleanResolutionNextTime = true;
    private _respectToFeatureSetting: boolean;
    private _tentativePrerequisiteImportsMod: boolean;
    private _userImportMap: ImportMapWithURL | undefined;

    private async _getPrerequisiteAssetModsWithFilter() {
        let prerequisiteAssetMods = Array.from(this._prerequisiteAssetMods).sort();
        if (useEditorFolderFeature && this._name !== 'editor') {
            // preview 编译需要剔除 Editor 目录下的脚本
            const editorPatterns = await getEditorPatterns();
            prerequisiteAssetMods = Array.from(prerequisiteAssetMods).filter(mods => {
                const filePath = mods.startsWith('file:') ? fileURLToPath(mods) : mods;
                return !editorPatterns.some(pattern => minimatch(filePath, pattern));
            });
        }
        return prerequisiteAssetMods;
    }

    private _ensureIdle() {
        asserts(!this._buildStarted, 'Build is in progress, but a status change request is filed');
    }
}

class AsyncIterationConcurrency1 {
    private _iterate: () => Promise<void>;

    private _executionPromise: Promise<void> | null = null;

    private _pendingPromise: Promise<void> | null = null;

    constructor(iterate: () => Promise<void>) {
        this._iterate = iterate;
    }

    public busy() {
        return !!this._executionPromise || !!this._pendingPromise;
    }

    public nextIteration(): Promise<any> {
        if (!this._executionPromise) {
            // 如果未在执行，那就去执行
            // assert(!this._pendingPromise)
            return this._executionPromise = Promise.resolve(this._iterate()).finally(() => {
                this._executionPromise = null;
            });
        } else if (!this._pendingPromise) {
            // 如果没有等待队列，创建等待 promise，在 执行 promise 完成后执行
            return this._pendingPromise = this._executionPromise.finally(() => {
                this._pendingPromise = null;
                // 等待 promise 将等待执行 promise，并在完成后重新入队
                return this.nextIteration();
            });
        } else {
            // 如果已经有等待队列，那就等待现有的队列
            return this._pendingPromise;
        }
    }
}

interface IncrementalRecord {
    version: string;
    config: {
        previewTarget?: string;
    } & SharedSettings;
}

function matchObject(lhs: unknown, rhs: unknown) {
    return matchLhs(lhs, rhs);

    function matchLhs(lhs: unknown, rhs: unknown): boolean {
        if (Array.isArray(lhs)) {
            return Array.isArray(rhs) && lhs.length === rhs.length &&
                lhs.every((v, i) => matchLhs(v, rhs[i]));
        } else if (typeof lhs === 'object' && lhs !== null) {
            return typeof rhs === 'object'
                && rhs !== null
                && Object.keys(lhs).every((key) => matchLhs((lhs as any)[key], (rhs as any)[key]));
        } else if (lhs === null) {
            return rhs === null;
        } else {
            return lhs === rhs;
        }
    }
}
