
import ps from 'path';
import { ExecutorSystem, globalEditorSystem } from '../editor-systemjs';
import { URL } from 'url';
import { LoaderContext } from '@cocos/creator-programming-quick-pack/lib/utils/loader-context';
import { QuickPackLoader } from '@cocos/creator-programming-quick-pack/lib/loader';
import { PackModInstantiation, PackModuleEvaluator } from './pack-mod-instantiation';

type ImportEngineMod = (id: string) => Record<string, unknown> | Promise<Record<string, unknown>>;

// `'cc'` 的 URL
const engineIndexURL = `cce:/internal/x/cc`;
// 引擎功能单元模块的 URL 前缀
const engineFeatureUnitsPrefix = `cce:/internal/x/cc-fu/`;
// 引擎公开至编辑器的模块的 URL 前缀
const engineExportToEditorPrefix = `cce:/internal/x/engine-export-to-editor/`;
// 编辑器公开给项目的模块的 URL 前缀
const editorExportToProjectPrefix = `cce:/internal/x/editor-export-to-project/`;
// 项目路径相关 URL 前缀
const projectUrlPrefix = 'cce:/internal/x/project/';

const packResourceBaseURL = new URL('pack:///');

type ImportExceptionHandler = (err: unknown) => void;

const defaultImportExceptionHandler: ImportExceptionHandler = (err: unknown) => {
    console.warn(err);
};

/**
 * 脚本插件更新信息，changes 中包含添加与修改的插件，removals 中包含删除的插件
 */
export interface IPluginChangedInfo {
    /**
     * 所有要修改的（或新增的）插件脚本。
     */
    changes: Record<PluginScriptId, PluginScriptInfo>
    /**
     * 所有要移除的插件脚本。
     */
    removals: PluginScriptId[];
}

export class Executor {
    private static _inst: Executor;
    public static async create(options: Executor.Options) {
        if (Executor._inst) {
            return Executor._inst;
        }
        const executor = Executor._inst = new Executor(
            options.projectPath,
            options.quickPackLoaderContext,
            options.packModuleEvaluator,
            options.importExceptionHandler,
        );
        await executor._initialize(options);
        return executor;
    }

    private constructor(
        projectPath: string,
        quickPackLoaderContext: LoaderContext,
        packModuleEvaluator: PackModuleEvaluator | undefined,
        importExceptionHandler: ImportExceptionHandler | undefined,
    ) {
        this._editorSystem = globalEditorSystem;
        this._logger = {};

        const quickPackLoader = new QuickPackLoader(quickPackLoaderContext);
        this._packLoader = quickPackLoader;
        this._packModInstantiation = new PackModInstantiation(quickPackLoader, this._editorSystem, packModuleEvaluator);

        this._importExceptionHandler = importExceptionHandler ?? defaultImportExceptionHandler;
        this._projectPath = projectPath;
    }

    private async _initialize(options: Executor.Options) {
        if (options.beforeUnregisterClass) {
            this._beforeUnregisterClass = options.beforeUnregisterClass;
        }

        this._addInstantiationHandlers(options.importEngineMod);

        this._cceModuleMap = options.cceModuleMap;
        this._fixedImportMap.imports['cc'] = engineIndexURL;
        this._fixedImportMap.imports['cc/env'] = `${engineExportToEditorPrefix}cc/editor/populate-internal-constants`;
        // TODO: deprecated cce.env is only live in 3.0-preview
        this._fixedImportMap.imports['cce.env'] = this._fixedImportMap.imports['cc/env'];
        const projectCustomMacroURL = new URL('./temp/programming/custom-macro.js', projectUrlPrefix);
        this._fixedImportMap.imports['cc/userland/macro'] = projectCustomMacroURL.href;

        for (const [moduleName, moduleConfig] of Object.entries(this._cceModuleMap)) {
            if (moduleName === 'mapLocation') {
                continue;
            }
            this._fixedImportMap.imports[moduleName] = `${editorExportToProjectPrefix}${moduleName}`;
        }

        const venderOnLoad = System.constructor.prototype.onload;
        const self = this;
        System.constructor.prototype.onload = function (...args: Parameters<Executor['_onModuleLoaded']>) {
            self._onModuleLoaded(...args);
            if (typeof venderOnLoad === 'function') {
                venderOnLoad.apply(this, arguments);
            }
        };

        this._logger = options.logger || {};
    }

    private _addInstantiationHandlers(importer: ImportEngineMod) {
        // 处理项目里的自定义配置模块，比如 custom-macro 模块
        this._editorSystem.addInstantiationHandler((url) => {
            if (url.startsWith(projectUrlPrefix)) {
                let quickCompilerRequest = url.substr(projectUrlPrefix.length);
                quickCompilerRequest = ps.join(this._projectPath, quickCompilerRequest);
                require(quickCompilerRequest);
                return this._editorSystem.getRegister() as ModuleRegister;
            }
        });
        // 处理引擎模块的实例化
        this._editorSystem.addInstantiationHandler(async (url) => {
            let quickCompilerRequest = '';
            if (url.startsWith(engineFeatureUnitsPrefix)) {
                quickCompilerRequest = url;
            } else if (url.startsWith(engineExportToEditorPrefix)) {
                quickCompilerRequest = url.substr(engineExportToEditorPrefix.length);
            }
            if (quickCompilerRequest) {
                return [[], (_export) => {
                    return {
                        execute: async () => {
                            const exports = await importer(quickCompilerRequest);
                            _export(exports);
                        },
                    };
                }];
            }
        });

        // 处理 Packer 里的模块的实例化
        const packResourceBaseURLString = packResourceBaseURL.href;
        this._editorSystem.addInstantiationHandler(async (url) => {
            if (url.startsWith(packResourceBaseURLString)) {
                const link = url.slice(packResourceBaseURLString.length);
                const register = await this._packModInstantiation.instantiate(link);
                this._instantiatedPackMods.push(url);
                return register;
            }
        });

        this._editorSystem.addInstantiationHandler(async (url) => {
            if (url.startsWith(editorExportToProjectPrefix)) {
                const moduleName = url.slice(editorExportToProjectPrefix.length);
                const moduleConfig = this._cceModuleMap[moduleName];
                const mapLocation = this._cceModuleMap.mapLocation;
                if (moduleConfig) {
                    const exportedObj = require(ps.join(ps.dirname(mapLocation), moduleConfig.main));
                    return [[], (_export) => {
                        return {
                            execute: async () => {
                                _export(exportedObj);
                            },
                        };
                    }];
                }
            }
        });
    }

    public addPolyfillFile(file: string) {
        require(file);
    }

    public async prepare() {
        let unlockPromise: (() => Promise<void>) | undefined;
        console.debug('[[Executor]] prepare before lock');
        try {
            // 多进程操作同一个资源。如果不给文件加锁，会导致文件读写冲突
            unlockPromise = await this._packModInstantiation.lock();
        } catch (err: any) {
            console.error(`[[Executor]] prepare lock failed: ${err}, stack: ${err.stack}`);
        }

        await this._reloadPackMods();

        try {
            if (unlockPromise) {
                await unlockPromise();
            }
        } catch (err: any) {
            console.error(`[[Executor]] prepare unlock failed: ${err}, stack: ${err.stack}`);
        }
        console.debug('[[Executor]] prepare after unlock');
    }

    public async import(url: string): Promise<unknown> {
        return await this._editorSystem.import(url);
    }

    /**
     * 重新读取 Packer 的内容并重新执行所有项目脚本和插件脚本。
     */
    public async reload() {
        const onClassRegistered: EditorExtends.Listener<'class-registered'> = (classConstructor, metadata) => {
            this._registeredClasses.push(classConstructor);
            console.debug(`[[Executor]] Register ${classConstructor.name}`);
            if (metadata) {
                (this._classUuidMap[metadata.uuid] ??= []).push(classConstructor);
            }
        };

        let unlockPromise: (() => Promise<void>) | undefined;
        try {
            // 需要从这里开始上锁
            // 之前只在 _reloadPackMods 上锁，可能会导致后面 _importPrerequisiteModules 的逻辑使用到错误的 chunk
            console.debug('[[Executor]] reload before lock');
            try {
                // 多进程操作同一个资源。如果不给文件加锁，会导致文件读写冲突
                unlockPromise = await this._packModInstantiation.lock();
            } catch (err: any) {
                console.error(`[[Executor]] lock failed: ${err}, stack: ${err.stack}`);
            }

            EditorExtends.on('class-registered', onClassRegistered);
            
            await this._reloadPackMods();
    
            console.groupCollapsed(`Invalidate all modules`);
            await this._invalidateAllModules();
            console.groupEnd();
    
            this._invalidateAllPlugins();
    
            this._loadAllPlugins();
    
            console.groupCollapsed(`Imports all modules`);
            await this._importPrerequisiteModules();
            console.groupEnd();
        } catch (e: any) {
            console.error(`[[Executor]] failed to reload.`, e);
            throw e;
        } finally {
            EditorExtends.removeListener('class-registered', onClassRegistered);
            try {
                if (unlockPromise) {
                    await unlockPromise();
                }
            } catch (err: any) {
                console.error(`[[Executor]] unlock failed: ${err}, stack: ${err.stack}`);
            }
            console.debug('[[Executor]] after unlock');
        }
    }

    /**
     * 热更脚本插件
     * @param info 脚本插件更新信息
     */
    public async hotReloadPluginScripts(info?: IPluginChangedInfo) {
        if (info && Object.keys(info.changes).length === 0 && info.removals.length === 0) {
            return;
        }

        this._invalidateAllPlugins();

        if (info) {
            for (let i = 0; i < this._plugins.length; i++) {
                const plugin = this._plugins[i];
                // 应用修改
                if (info.removals.includes(plugin.uuid)) {
                    this._plugins.splice(i, 1);
                    i--;
                }

                if (info.changes[plugin.uuid]) {
                    Object.assign(plugin, info.changes[plugin.uuid]);
                }
            }
        }

        await this._loadAllPlugins();
    }

    public isModule(id: string) {
        return id in this._modules;
    }

    public async clear() {
        this._invalidateAllPlugins();
        this._plugins = [];
        await this._invalidateAllModules();
    }

    public setPluginScripts (plugins: PluginScriptInfo[]) {
        this._invalidateAllPlugins();
        this._plugins = plugins;
    }

    /**
     * 查找指定脚本模块中注册的所有 cc 类。
     * @param uuid 模块的 uuid。
     * @returns 指定脚本模块中注册的所有 cc 类；如果 [uuid] 并不对应一个模块或模块中未注册任何类则返回 `undefined`。
     */
    public queryClassesInModule(uuid: string): undefined | ReadonlyArray<Readonly<Function>> {
        return this._classUuidMap[uuid];
    }

    private async _reloadPackMods() {
        try {
            await this._packModInstantiation.reload();

            this._editorSystem.clearImportMap();

            const quickPackLoaderImportMap = await this._packModInstantiation.getImportMap();
            this._editorSystem.extendImportMap(quickPackLoaderImportMap, new URL(this._packLoader.importMapURL, packResourceBaseURL).href);
            
            this._editorSystem.extendImportMap(this._fixedImportMap, this._engineImportMapURL);

            const resolutionDetailMap = await this._packLoader.loadResolutionDetailMap();
            this._editorSystem.setResolutionDetailMap(resolutionDetailMap, new URL(this._packLoader.resolutionDetailMapURL, packResourceBaseURL).href);
        } catch (err: any) {
            console.error(`_reloadPackMods, reload failed: ${err}, stack: ${err.stack}`);
        }
    }

    private async _invalidateAllModules() {
        const cc = await System.import('cc') as EngineExports;

        for (const registeredClass of this._registeredClasses) {
            if (this._beforeUnregisterClass) {
                this._beforeUnregisterClass(registeredClass);
            }
            cc.js.unregisterClass(registeredClass);
            console.debug(`Unregister ${registeredClass.name}`);
        }
        this._registeredClasses = [];

        this._classUuidMap = {};

        cc.cclegacy._RF.reset();

        this._invalidateAllPackMods();
    }

    private _invalidateAllPackMods() {
        for (const packModId of this._instantiatedPackMods) {
            console.debug(`Invalidating '${packModId}'`);
            const result = System.delete(packModId);
            if (result === false) {
                console.debug(`Note: failed to delete ${packModId}, maybe it's being executing?`);
            }
        }
        this._instantiatedPackMods.length = 0;
    }

    private async _importPrerequisiteModules() {
        const cc = await System.import('cc') as EngineExports;

        try {
            await System.import('cce:/internal/x/prerequisite-imports');
        } catch (err: unknown) {
            this._importExceptionHandler(err);
        } finally {
            this._cachedExceptions.clear();
            // 项目脚本可能在执行的时候会抛出异常，这导致 `cc._RF` 没有正确弹出。
            // 我们在最后清理一下。
            cc.cclegacy._RF.reset();
        }
    }

    private async _loadAllPlugins() {
        const sortedMapped = this._plugins.map((pluginScript) => pluginScript.file);
        for (const file of sortedMapped) {
            try {
                require(file);
            } catch (error) {
                console.error(error);
            }
        }
    }

    private _invalidateAllPlugins() {
        for (const [, pluginScriptInfo] of Object.entries(this._plugins)) {
            delete require.cache[pluginScriptInfo.file];
        }
    }

    private _tryLog<Cat extends keyof Executor.Logger>(cat: Cat, ...args: Parameters<NonNullable<Executor.Logger[Cat]>>) {
        // @ts-ignore
        return (cat in this._logger) ? this._logger[cat]!(...args) : this._defaultLog(...args);
    }

    private _defaultLog(...args: any) {
        console.log(...args);
    }

    private _onModuleLoaded(error: Error, id: string) {
        const cachedExceptions = this._cachedExceptions;
        if (!error) {
            console.debug(`[[Executor]] Module "${id}" loaded.`);
        } else {
            if (!cachedExceptions.has(error)) {
                this._importExceptionHandler(error);
            }
            this._tryLog('loadException', id, error, cachedExceptions.has(error));
            cachedExceptions.set(error, id);
        }
    }

    private declare _packModInstantiation: PackModInstantiation;

    private _beforeUnregisterClass?: Executor.BeforeUnregisterClass;
    private _cachedExceptions: Map<any, string> = new Map();
    private _classUuidMap: Record<string, Function[]> = {};
    private _logger: Partial<Executor.Logger>;
    private _builtinMods: Record<string, string> = {};

    private _importExceptionHandler: ImportExceptionHandler;

    private _editorSystem: ExecutorSystem;
    private _modules: Record<string, ModuleScriptInfo> = Object.create(null);
    private _registeredClasses: Function[] = [];

    private _plugins: PluginScriptInfo[] = [];

    private _fixedImportMap: { imports: Record<string, string> } = { imports: {} };
    private _engineImportMapURL = '';

    private _packLoader: QuickPackLoader;
    private _instantiatedPackMods: string[] = [];
    private _cceModuleMap: Record<string, any> = {};
    private _projectPath = '';
}

export namespace Executor {
    export type BeforeUnregisterClass = (classConstructor: Function) => void;

    export interface ReporterMap {
        ['possible-cr-use']: {
            imported: string;
            moduleRequest: string;
            importMeta: any;
            extras: any;
        };
    }

    export type Logger = Partial<{
        possibleCircularReference: (
            imported: string,
            moduleRequest: string,
            importMeta: any,
            extras: any
        ) => void;

        loadException: (
            moduleUrl: string,
            error?: any,
            hasBeenThrown?: boolean,
        ) => void;
    }>;

    export interface Options {
        projectPath: string;
        importEngineMod: ImportEngineMod;
        quickPackLoaderContext: LoaderContext;
        beforeUnregisterClass?: BeforeUnregisterClass;
        packModuleEvaluator?: PackModuleEvaluator;
        logger?: Logger;
        importExceptionHandler?: (err: unknown) => void;
        cceModuleMap: Record<string, any>;
    }

    export interface ExecuteInfo {
        polyfills: string[];
        modules: string[];
        bareSpecifierResolveMap: Record<string, string>;
        instantiateMap: Record<string, string>;
    }
}

type PluginScriptId = string;

export interface PluginScriptInfo {
    /**
     * 脚本文件。
     */
    file: string;

    uuid: string;
}

interface ModuleScriptInfo {
    /**
     * 模块 URL。
     */
    moduleUrl: string;

    /**
     * 代码文件。
     */
    file: string;
}

interface EngineExports {
    cclegacy: { _RF: { reset(): void; } };
    js: { unregisterClass(f: Function): void; };
}

declare namespace EditorExtends {
    interface EventMap {
        /**
         * Called when a cc-class is registered.
         * @param classConstructor Registering class.
         */
        'class-registered'(classConstructor: Function, metadata?: Readonly<any>): void;
    }

    type EventArgs<EventName extends keyof EventMap> = Parameters<EventMap[EventName]>;

    type Listener<EventName extends keyof EventMap> = (...args: EventArgs<EventName>) => void;

    function emit<EventName extends keyof EventMap>(name: EventName, ...args: EventArgs<EventName>): void;

    function on<EventName extends keyof EventMap>(name: EventName, listener: Listener<EventName>): void;

    function removeListener<EventName extends keyof EventMap>(name: EventName, listener: Listener<EventName>): void;
}
