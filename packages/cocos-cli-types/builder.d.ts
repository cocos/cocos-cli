/// <reference types="node" />

import EventEmitter from 'events';
import { EventEmitter as EventEmitter_2 } from 'stream';
import type { PluginItem } from '@babel/core';
import { SpriteFrame } from 'cc';

export declare interface AcornNode {
    	end: number;
    	start: number;
    	type: string;
}

export declare type AddonHook = string | AddonHookFunction;

export declare type AddonHookFunction = (this: PluginContext) => string | Promise<string>;

export declare type AddonHooks = 'banner' | 'footer' | 'intro' | 'outro';

export declare interface AllTextureCompressConfig {
    platformConfig: Record<string, ITextureCompressConfig>;
    formatsInfo: Record<string, ITextureFormatInfo>;
    customFormats: Record<string, ITextureFormatInfo>;
    configGroups: IConfigGroups;
    defaultSupport: ISupportFormat;
    textureFormatConfigs: Record<string, ITextureFormatConfig>;
}

export declare type AmdOptions = (
	| {
    			autoId?: false;
    			id: string;
    	  }
	| {
    			autoId: true;
    			basePath?: string;
    			id?: undefined;
    	  }
	| {
    			autoId?: false;
    			id?: undefined;
    	  }
) & {
    	define?: string;
    	forceJsExtensionForImports?: boolean;
};

/** 动画剪辑资源的 userData */
export declare interface AnimationClipAssetUserData {
    /** 动画名称 */
    name: string;
}

export declare interface AnimationImportSetting {
    /**
     * glTf 中原始动画资源的名称。
     */
    name: string;

    /**
     * 原始动画的长度，单位为秒。
     */
    duration: number;

    /**
     * 用户查看、切割原始动画时的 FPS 设定。
     */
    fps: number;

    /**
     * 对原始动画的划分，由用户配置。
     * 若此资源存在，所有划分出的动画成为 glTf 资源下的独立动画并将被导出；
     * 否则，直接导入原始动画资源。
     */
    splits: Array<{
        /**
         * 以前的 ID。如果存在，优先使用这个 ID 来创建子资源，以防止改名后 UUID 变化。
         */
        previousId?: string;

        /**
         * 划分出的动画的名称。
         */
        name: string;

        /**
         * 划分的起始时刻，单位为秒。
         */
        from: number;

        /**
         * 划分的终止时刻，单位为秒。
         */
        to: number;

        /**
         * 用户查看划分出的子动画时的 FPS 设定。
         */
        fps?: number;

        /**
         * 速度。
         */
        speed?: number;

        /**
         * 动画循环模式。
         */
        wrapMode?: number;

        /**
         * 额外的动画辅助曲线信息。
         */
        auxiliaryCurves?: Record<
        string,
            {
            /**
             * 序列化后的曲线。
             */
            curve: unknown;
        }
        >;

        /**
         * 加性动画导入设置。
         */
        additive?: {
            /**
             * 是否将动画导入为加性动画。
             */
            enabled: boolean;

            /**
             * 参考动画。
             * 若设置，将参考该动画第 0 帧的姿势计算加性动画；
             * 否则，则将参考第动画本身第 0 帧的姿势进行计算。
             */
            refClip?: string;
        };
    }>;
}

export declare interface appTemplateData {
    debugMode: boolean;
    renderMode: boolean;
    showFPS: boolean;
    importMapFile?: string;
    resolution: {
        policy: number;
        width: number;
        height: number;
    };
    md5Cache: boolean;
    cocosTemplate?: string;
}

export declare type ArrayItem = {
    label: string;
    value: string;
};

/**
 * 存储到 asset db 内的 asset 实例
 * 创建的时候会读取对应的 .meta 文件
 * 如果 meta 不存在则会创建，并分配一个 uuid
 */
export declare class Asset extends VirtualAsset {
    _source: string;
    get source(): string;
    _url: string;
    get url(): string;
    extname: string;
    basename: string;
    constructor(source: string, meta: Meta, assetDB: AssetDB);
    updateUrl(): void;
    /**
     * 保存当前资源的 meta 信息
     */
    save(): boolean;
    /**
     * 判断是否是文件夹
     */
    isDirectory(): boolean;
}

/** 所有资源处理器类型的常量数组（用于 Zod enum 和 TypeScript type） */
export declare const ASSET_HANDLER_TYPES: string[];

export declare enum AssetActionEnum {
    'add' = 0,
    'change' = 1,
    'delete' = 2,
    'none' = 3
}

export declare class AssetDB extends EventEmitter {
    static readonly version = "1.0.1";
    options: AssetDBOptions;
    flag: {
        starting: boolean;
        started: boolean;
    };
    path2asset: Map<string, Asset>;
    uuid2asset: Map<string, Asset>;
    importerManager: any;
    metaManager: MetaManager;
    console: CustomConsole;
    infoManager: InfoManager;
    dependencyManager: DependencyManager;
    taskManager: ParallelQueue<VirtualAsset, boolean>;
    dataManager: DataManager;
    _lock: boolean;
    _waitLockHandler: Function[];
    cachePath: string;
    get assetProgressInfo(): {
        current: number;
        total: number;
        wait: any;
    };
    /**
     * 锁定资源
     */
    private lock;
    /**
     * 解锁资源
     */
    private unlock;
    /**
     * 实例化过程
     * @param options
     */
    constructor(options: AssetDBOptions);
    preImporterHandler?(file: string): boolean;
    private prepareStart;
    /**
     * 启动资源数据库
     */
    start(options?: AssetDBStartOptions): Promise<unknown>;
    /**
     * 直接从缓存中恢复数据库，可能会失败抛异常
     * @returns
     */
    startWithCache(): Promise<void>;
    updateInfoManager(): Promise<void>;
    private _generateRecordInfo;
    save(): Promise<void>;
    private restoreFromCache;
    /**
     * 停止资源数据库
     */
    stop(): Promise<void>;
    /**
     * 传入 path，返回 asset-db 内对应的 uuid
     * 不存在则返回 null
     * @param path
     */
    pathToUuid(path: string): string | null;
    /**
     * 传入 uuid，返回对应的资源的 path
     * @param uuid
     */
    uuidToPath(uuid: string): string | null;
    /**
     * 查询资源实例
     * @param uuid
     */
    getAsset(uuid: string): VirtualAsset | null;
    /**
     * 重新导入某个指定资源
     * @param fileOrUUID
     */
    reimport(fileOrUUID: string): Promise<VirtualAsset | null>;
    /**
     * 刷新资源
     * 传入某一个文件或者文件夹，进行数据库刷新操作
     * 会优先同步扫描所有资源，然后等待其他 refresh 队列
     * 默认 refresh 是有队列的，多个 refresh 同时执行需要进入队列等待
     * @param path
     * @returns {number} 刷新的资源个数
     */
    refresh(path: string, options?: AssetDBRefreshOptions): Promise<number>;
    private _replaceUUID;
    /**
     * 检查资源状态
     * 识别是新增、修改还是删除了资源
     * @param addFiles
     * @param deleteFiles
     */
    private _checkAssetsStatSync;
    private _checkAssetStat;
}

/**
 * 资源数据库启动参数
 */
export declare interface AssetDBOptions {
    name: string;
    target: string;
    library: string;
    temp: string;
    /**
     * 0: 忽略错误
     * 1: 仅仅打印错误
     * 2: 打印错误、警告
     * 3: 打印错误、警告、日志
     * 4: 打印错误、警告、日志、调试信息
     */
    level: LogLevel;
    ignoreFiles: string[];
    globList?: string[];
    readonly: boolean;
    flags?: {
        reimportCheck?: boolean;
    };
    importConcurrency?: number;
}

export declare interface AssetDBRefreshOptions {
    ignoreSelf?: boolean;
    globList?: string[];
    useCache?: boolean;
    hooks?: {
        afterGenerateMeta?(): void;
        afterScan?(files: string[]): void;
        afterPreImport?(): void;
        afterRefresh?(): void;
    };
}

export declare interface AssetDBStartOptions {
    ignoreSelf?: boolean;
    globList?: string[];
    hooks?: {
        afterGenerateMeta?(): void;
        afterScan?(files: string[]): void;
        afterPreImport?(): void;
        afterStart?(): void;
    };
}

export declare namespace AssetHandlers {
    export type compressTextures = (tasks: ICompressConfig[]) => Promise<void>;
}

/** 资源处理器类型（从常量数组派生） */
export declare type AssetHandlerType = typeof ASSET_HANDLER_TYPES[number] | 'database';

export declare type AssetInfoArr = Array<string | number>;

export declare interface AssetSerializeOptions {
    'cc.EffectAsset': {
        glsl1: boolean;
        glsl3: boolean;
        glsl4: boolean;
    };
}

export declare interface AssetUserDataMap {
    'animation-clip': AnimationClipAssetUserData;
    'auto-atlas': AutoAtlasAssetUserData;
    'label-atlas': LabelAtlasAssetUserData;
    'render-texture': RenderTextureAssetUserData;
    'directory': DirectoryAssetUserData;
    'texture-cube': TextureCubeAssetUserData;
    'erp-texture-cube': TextureCubeAssetUserData;
    'image': ImageAssetUserData;
    'sprite-frame': SpriteFrameAssetUserData;
    'texture': Texture2DAssetUserData;
    'spine-data': SpineAssetUserData;
    'javascript': JavaScriptAssetUserData;
    'gltf-animation': GltfAnimationAssetUserData;
    'particle': ParticleAssetUserData;
    'json': JsonAssetUserData;
    'prefab': PrefabAssetUserData;
    'scene': PrefabAssetUserData;
    'effect': EffectAssetUserData;
    'audio-clip': AudioClipAssetUserData;
    'bitmap-font': BitmapFontAssetUserData;
    'gltf-skeleton': GltfSkeletonAssetUserData;
    'gltf-embeded-image': GltfEmbededImageAssetUserData;
    'gltf-mesh': IVirtualAssetUserData;
    'gltf-material': IVirtualAssetUserData;
    'gltf-scene': IVirtualAssetUserData;
    'gltf': GlTFUserData;
    'fbx': GlTFUserData;
    'sprite-atlas': SpriteAtlasAssetUserData;
    'rt-sprite-frame': RtSpriteFrameAssetUserData;
    'sign-image': ImageAssetUserData;
    'alpha-image': ImageAssetUserData;

    // 无特定 userData 的资源类型（仅保留 unknown）
    'unknown': any;
}

export declare type AsyncPluginHooks = Exclude<keyof FunctionPluginHooks, SyncPluginHooks>;

/** 音频资源的 userData */
export declare interface AudioClipAssetUserData {
    /** 下载模式：0-Web Audio, 1-DOM Audio */
    downloadMode: number;
}

/** 自动图集资源的 userData */
export declare interface AutoAtlasAssetUserData {
    compressed: boolean;
    dest: any;
    /** 打包图像的尺寸 */
    maxWidth: number;
    maxHeight: number;
    /** 图像的边距 */
    padding: number;
    allowRotation: boolean;
    forceSquared: boolean;
    powerOfTwo: boolean;
    algorithm: string;
    format: string;
    quality: number;
    contourBleed: boolean;
    paddingBleed: boolean;
    filterUnused: boolean;
    removeTextureInBundle: boolean;
    removeImageInBundle: boolean;
    removeSpriteAtlasInBundle: boolean;
    platformSettings: any;
    textureSetting: any;
}

export declare type BabelPluginItem = PluginItem;

/** 位图字体资源的 userData */
export declare interface BitmapFontAssetUserData {
    /** 字体配置 */
    _fntConfig: any;
    /** 字体大小 */
    fontSize: number;
    /** 纹理 UUID */
    textureUuid: string;
}

export declare type BreakType = 'cancel' | 'crashed' | 'refreshed' | 'interrupted' | '';

export declare function build<P extends Platform>(platform: P, options?: IBuildCommandOption): Promise<IBuildResultData>;

export declare function buildBundleOnly(bundleOptions: IBundleBuildOptions): Promise<IBuildResultData>;

export declare interface BuildCheckResult {
    error: string;
    newValue: any;
    level: IConsoleType;
}

export declare interface BuildConfiguration {
    common: IBuildCommonOptions;
    platforms: {
        'web-desktop'?: WebDesktopBuildOptions & OverwriteProjectSettings;
        'web-mobile'?: WebMobileBuildOptions & OverwriteProjectSettings;
    };
    useCacheConfig?: IBuildCacheUseConfig;
    bundleConfig: {
        custom: Record<string, IBundleOptions>;
    };
    textureCompressConfig: UserCompressConfig;
}

/**
 * 资源管理器，主要负责资源的缓存查询缓存等
 * 所有 __ 开头的属性方法都不对外公开
 */
export declare class BuilderAssetCache implements BuilderCache {
    readonly scenes: Array<IBuildSceneItem>;
    readonly scriptUuids: Array<string>;
    assetUuids: Array<string>;
    private readonly instanceMap;
    private readonly _task?;
    constructor(task?: IBuilder);
    /**
     * 初始化
     */
    init(): Promise<void>;
    /**
     * 查询某个 uuid 是否存在
     * @param uuid
     * @returns
     */
    hasAsset(uuid: string): Promise<boolean>;
    /**
     * 添加一个资源到缓存
     * @param asset
     */
    addAsset(asset: IAsset, type?: string): void;
    /**
     * 删除一个资源的缓存
     */
    removeAsset(uuid: string, type?: string): void;
    /**
     * 查询指定 uuid 的资源信息
     * @param uuid
     */
    getAssetInfo(uuid: string): IAssetInfo;
    /**
     * 添加或修改一个实例化对象到缓存
     * @param instance
     */
    addInstance(instance: any): void;
    /**
     * 删除一个资源的缓存
     * @param uuid
     */
    clearAsset(uuid: string): void;
    /**
     * 查询一个资源的 meta 数据
     * @param uuid
     */
    getMeta(uuid: string): Promise<any>;
    addMeta(uuid: string, meta: any): Promise<void>;
    /**
     * 获取指定 uuid 资源的依赖资源 uuid 列表
     * @param uuid
     */
    getDependUuids(uuid: string): Promise<readonly string[]>;
    /**
     * 深度获取指定 uuid 资源的依赖资源 uuid 列表
     * @param uuid
     */
    getDependUuidsDeep(uuid: string): Promise<string[]>;
    /**
     *
     * 获取指定 uuid 资源在 library 内的序列化 JSON 内容
     * @param uuid
     */
    getLibraryJSON(uuid: string): Promise<any>;
    /**
     * 获取指定 uuid 资源的重新序列化后的 JSON 内容（最终输出）
     * @param uuid
     * @param options
     */
    getSerializedJSON(uuid: string, options: ISerializedOptions): Promise<any>;
    /**
     * 直接输出某个资源序列化 JSON 到指定包内
     * @param uuid
     * @param destDir
     * @param options
     */
    outputAssetJson(uuid: string, destDir: string, options: IInternalBuildOptions): Promise<void>;
    /**
     * 循环一种数据
     * @param type
     * @param handle
     */
    forEach(type: string, handle: Function): Promise<undefined>;
    /**
     * 查询一个资源反序列化后的实例
     * @param uuid
     */
    getInstance(uuid: string): Promise<any>;
}

export declare interface BuilderCache {
    readonly scenes: Array<IBuildSceneItem>;
    readonly scriptUuids: Array<string>;
    readonly assetUuids: Array<string>;
    init: () => Promise<void>;
    hasAsset: (uuid: string) => Promise<boolean>;
    addAsset: (asset: IAsset) => void;
    addInstance: (instance: any) => void;
    clearAsset: (uuid: string) => void;
    removeAsset: (uuid: string) => void;
    getMeta: (uuid: string) => Promise<any>;
    getAssetInfo: (uuid: string) => IAssetInfo;
    addMeta: (uuid: string, meta: any) => void;
    getDependUuids: (uuid: string) => Promise<readonly string[]>;
    getDependUuidsDeep: (uuid: string) => Promise<readonly string[]>;
    /**
     * 获取序列化文件
     */
    getLibraryJSON: (uuid: string) => Promise<any>;
    getSerializedJSON: (uuid: string, options: IInternalBuildOptions) => Promise<any>;
    forEach: (type: string, handle: Function) => Promise<void>;
    getInstance: (uuid: string) => Promise<any>;
    outputAssetJson: (uuid: string, destDir: string, options: IInternalBuildOptions) => Promise<void>;
}

export declare const enum BuildExitCode {
    PARAM_ERROR = 32,
    BUILD_FAILED = 34,
    BUILD_SUCCESS = 0,
    BUILD_BUSY = 37,
    STATIC_COMPILE_ERROR = 38,
    UNKNOWN_ERROR = 50
}

export declare namespace BuildHook {
    export type throwError = boolean;
    export type title = string;
    export type onError = IBaseHooks;
    export type onBeforeBuild = IBaseHooks;
    export type onBeforeCompressSettings = IBaseHooks;
    export type onAfterCompressSettings = IBaseHooks;
    export type onAfterBuild = IBaseHooks;
    export type onAfterMake = IBuildStageHooks;
    export type onBeforeMake = IBuildStageHooks;
    export type load = () => Promise<void> | void;
    export type unload = () => Promise<void> | void;
}

export declare namespace BuildPlugin {
    export type Configs = Record<string, IBuildPluginConfig>;
    export type AssetHandlers = string;
    export type load = () => Promise<void> | void;
    export type Unload = () => Promise<void> | void;
}

export declare class BuildResult implements IBuildResult {
    private readonly __task;
    settings?: ISettings;
    dest: string;
    get paths(): IBuildPaths;
    constructor(task: IBuilder);
    /**
     * 指定的 uuid 资源是否包含在构建资源中
     */
    containsAsset(uuid: string): boolean;
    /**
     * 获取指定 uuid 原始资源的存放路径（不包括序列化 json）
     * 自动图集的小图 uuid 和自动图集的 uuid 都将会查询到合图大图的生成路径
     * 实际返回多个路径的情况：查询 uuid 为自动图集资源，且对应图集生成多张大图，纹理压缩会有多个图片格式路径
     */
    getRawAssetPaths(uuid: string): IRawAssetPathInfo[];
    /**
     * 获取指定 uuid 资源的路径相关信息
     * @return Array<{raw?: string | string[]; import?: string; groupIndex?: number;}>
     * @return.raw: 该资源源文件的实际存储位置，存在多个为数组，不存在则为空
     * @return.import: 该资源序列化数据的实际存储位置，不存在为空，可能是 .bin 或者 .json 格式
     * @return.groupIndex: 若该资源的序列化数据在某个分组内，这里标识在分组内的 index，不存在为空
     */
    getAssetPathInfo(uuid: string): IAssetPathInfo[];
    /**
     * @deprecated please use getImportAssetPaths instead
     * @param uuid
     */
    getJsonPathInfo(uuid: string): IImportAssetPathInfo[];
    /**
     * 指定 uuid 资源的序列化信息在构建后的信息
     * @param uuid
     */
    getImportAssetPaths(uuid: string): IImportAssetPathInfo[];
}

export declare class BuildStageTask extends BuildTaskBase implements IBuildStageTask {
    options: IBuildOptionBase;
    hooksInfo: IBuildHooksInfo;
    private root;
    hookMap: Record<string, string>;
    constructor(id: string, config: IBuildStageConfig);
    run(): Promise<boolean>;
    break(reason: string): void;
    handleHook(func: Function, internal: boolean): Promise<void>;
    saveOptions(): Promise<void>;
}

export declare class BuildTask extends BuildTaskBase implements IBuilder {
    cache: BuilderAssetCache;
    result: InternalBuildResult_2;
    buildTemplate: BuildTemplate;
    buildResult?: BuildResult;
    options: IInternalBuildOptions;
    hooksInfo: IBuildHooksInfo;
    taskManager: TaskManager;
    private mainTaskWeight;
    static isCommandBuild: boolean;
    private currentStageTask?;
    bundleManager: BundleManager;
    hookMap: Record<IPluginHookName, IPluginHookName>;
    pipeline: (string | Function | IBuildTask[])[];
    /**
     * 构建任务的结果缓存，只允许接口访问
     */
    private taskResMap;
    static utils: IBuildUtils;
    get utils(): IBuildUtils;
    constructor(id: string, options: IBuildOptionBase);
    get stage(): string;
    /**
     * 获取某个任务结果
     * @param name
     */
    getTaskResult(name: keyof ITaskResultMap_2): {
        projectJs: string;
        systemJs: string;
        polyfillsJs: string | null;
    } | IBuildPacResult_2 | undefined;
    /**
     * 开始整理构建需要的参数
     */
    init(): Promise<void>;
    /**
     * 执行具体的构建任务
     */
    run(): Promise<boolean>;
    /**
     * 仅构建 Bundle 流程
     */
    buildBundleOnly(): Promise<void>;
    private postBuild;
    private handleBuildStageTask;
    private initBundleManager;
    break(reason: string): void;
    lockAssetDB(): Promise<void>;
    unLockAssetDB(): void;
    /**
     * 获取预览 settings 信息
     */
    getPreviewSettings(): Promise<ISettings>;
    private initOptions;
    /**
     * 执行某个任务列表
     * @param buildTasks 任务列表数组
     * @param weight 全部任务列表所占权重
     * @param args 需要传递给任务的其他参数
     */
    private runBuildTask;
    handleHook(func: Function, internal: boolean, ...args: any[]): Promise<void>;
    onError(error: Error, throwError?: boolean): void;
    runErrorHook(): Promise<void>;
}

export declare abstract class BuildTaskBase extends EventEmitter {
    breakReason?: string;
    name: string;
    progress: number;
    error?: Error;
    abstract hooksInfo: IBuildHooksInfo;
    abstract options: IBuildOptionBase;
    abstract hookMap: Record<string, string>;
    hookWeight: number;
    id: string;
    buildExitRes: IBuildResultSuccess;
    constructor(id: string, name: string);
    break(reason: string): void;
    onError(error: Error, throwError?: boolean): void;
    /**
     * 更新进度消息 log
     * @param message
     * @param increment
     * @param outputType
     */
    updateProcess(message: string, increment?: number, outputType?: IConsoleType): void;
    abstract handleHook(func: Function, internal: boolean, ...args: any[]): Promise<void>;
    abstract run(): Promise<boolean>;
    runPluginTask(funcName: string, weight?: number): Promise<void>;
}

export declare class BuildTemplate implements IBuildTemplate {
    _buildTemplateDirs: string[];
    map: Record<string, {
        url: string;
        path: string;
    }>;
    _versionUser: string;
    config?: BuildTemplateConfig;
    get isEnable(): boolean;
    constructor(platform: Platform | string, taskName: string, config?: BuildTemplateConfig);
    query(name: string): string;
    private _initVersion;
    findFile(relativeUrl: string): string;
    initUrl(relativeUrl: string, name?: string): string | undefined;
    copyTo(dest: string): Promise<void>;
}

export declare interface BuildTemplateConfig {
    templates: {
        path: string;
        destUrl: string;
    }[];
    displayName?: string;
    version: string;
    dirname?: string;
}

export declare const enum BuiltinBundleName {
    RESOURCES = "resources",
    MAIN = "main",
    START_SCENE = "start-scene",
    INTERNAL = "internal"
}

export declare enum BuiltinBundleName_2 {
    RESOURCES = "resources",
    MAIN = "main",
    START_SCENE = "start-scene",
    INTERNAL = "internal"
}

export declare type BundleCompressionType = 'none' | 'merge_dep' | 'merge_all_json' | 'subpackage' | 'zip';

export declare const enum BundleCompressionTypes {
    NONE = "none",
    MERGE_DEP = "merge_dep",
    MERGE_ALL_JSON = "merge_all_json",
    SUBPACKAGE = "subpackage",
    ZIP = "zip"
}

export declare enum BundleCompressionTypes_2 {
    NONE = "none",
    MERGE_DEP = "merge_dep",
    MERGE_ALL_JSON = "merge_all_json",
    SUBPACKAGE = "subpackage",
    ZIP = "zip"
}

export declare interface BundleConfigItem {
    isRemote?: boolean;
    compressionType: BundleCompressionType;
}

export declare type BundleConfigProperty = 'compressionType' | 'isRemote';

export declare interface BundleFilterConfig {
    range: 'include' | 'exclude';
    type: 'asset' | 'url';
    patchOption?: {
        patchType: 'glob' | 'beginWith' | 'endWith' | 'contain';
        value: string;
    };
    assets?: string[];
}

export declare class BundleManager extends BuildTaskBase implements IBundleManager {
    static BuiltinBundleName: typeof BuiltinBundleName_2;
    static BundleConfigs: Record<string, Record<string, {
        isRemote: boolean;
        compressionType: BundleCompressionTypes_2;
    }>>;
    private _task?;
    options: IInternalBundleBuildOptions;
    destDir: string;
    hooksInfo: IBuildHooksInfo;
    bundleMap: Record<string, IBundle>;
    bundles: IBundle[];
    _pacAssets: string[];
    _bundleGroupInPriority?: Array<IBundle[]>;
    imageCompressManager?: TextureCompress_2;
    scriptBuilder: ScriptBuilder_2;
    packResults: PacInfo[];
    cache: BuilderAssetCache;
    hookMap: {
        onBeforeBundleInit: string;
        onAfterBundleInit: string;
        onBeforeBundleDataTask: string;
        onAfterBundleDataTask: string;
        onBeforeBundleBuildTask: string;
        onAfterBundleBuildTask: string;
    };
    pipeline: (string | Function)[];
    get bundleGroupInPriority(): IBundle[][];
    static internalBundlePriority: Record<string, number>;
    private constructor();
    static create(options: IBuildOptionBase, task?: IBuilder): Promise<BundleManager>;
    loadScript(scriptUuids: string[], pluginScripts: IPluginScriptInfo[]): Promise<void>;
    /**
     * 初始化项目设置的一些 bundle 配置信息
     */
    static initStaticBundleConfig(): Promise<void>;
    getUserConfig(ID?: string): {
        isRemote: boolean;
        compressionType: BundleCompressionTypes_2;
    } | null;
    /**
     * 对 options 上的数据做补全处理
     */
    initOptions(): Promise<void>;
    clearBundleDest(): void;
    /**
     * 初始化整理资源列表
     */
    initAsset(): Promise<void>;
    initBundleConfig(): Promise<void>;
    buildAsset(): Promise<void>;
    /**
     * 独立构建 Bundle 时调用
     * @returns
     */
    run(): Promise<boolean>;
    outputBundle(): Promise<void>;
    private addBundle;
    private getDefaultBundleConfig;
    /**
     * 根据参数初始化一些信息配置，整理所有的 bundle 分组信息
     */
    initBundle(): Promise<void>;
    /**
     * 初始化内置 Bundle（由于一些历史的 bundle 行为配置，内置 Bundle 的配置需要单独处理）
     */
    private initInternalBundleConfigs;
    /**
     * 填充成完整可用的项目 Bundle 配置（传入自定义配置 > Bundle 文件夹配置 > 默认配置）
     * @param customConfig
     * @returns IBundleInitOptions | null
     */
    private patchProjectBundleConfig;
    /**
     * 初始化 bundle 分组内的根资源信息
     * 初始化 bundle 内的各项不同的处理任务
     */
    private initBundleRootAssets;
    /**
     * 按照 Bundle 优先级整理 Bundle 的资源列表
     */
    private initBundleShareAssets;
    /**
     * 根据不同的选项做不同的 bundle 任务注册
     */
    bundleDataTask(): Promise<void>;
    /**
     * 纹理压缩处理
     * @returns
     */
    private compressImage;
    /**
     * 执行自动图集任务
     */
    private packImage;
    /**
     * 编译项目脚本
     */
    buildScript(): Promise<any>;
    /**
     * 输出所有的 bundle 资源，包含脚本、json、普通资源、纹理压缩、图集等
     */
    private outputAssets;
    handleHook(func: Function, internal: boolean, ...args: any[]): Promise<void>;
    runAllTask(): Promise<void>;
    runBuildTask(handle: Function, increment: number): Promise<void>;
}

export declare type BundlePlatformType = 'native' | 'miniGame' | 'web';

export declare interface BundleRenderConfig {
    platformTypeInfo: PlatformTypeInfo;
    platformConfigs: Record<string, PlatformBundleConfig>;
    maxOptionList: Record<string, any[]>;
    minOptionList?: Record<string, any[]>;
}

export declare type CCEnvConstants = ConstantManager.CCEnvConstants;

export declare type ChangeEvent = 'create' | 'update' | 'delete';

export declare interface ChokidarOptions {
    	alwaysStat?: boolean;
    	atomic?: boolean | number;
    	awaitWriteFinish?:
    		| {
        				pollInterval?: number;
        				stabilityThreshold?: number;
        		  }
    		| boolean;
    	binaryInterval?: number;
    	cwd?: string;
    	depth?: number;
    	disableGlobbing?: boolean;
    	followSymlinks?: boolean;
    	ignoreInitial?: boolean;
    	ignorePermissionErrors?: boolean;
    	ignored?: any;
    	interval?: number;
    	persistent?: boolean;
    	useFsEvents?: boolean;
    	usePolling?: boolean;
}

export declare class CocosParams<T> {
    platformParams: T;
    debug: boolean;
    projectName: string;
    cmakePath: string;
    platform: InternalNativePlatform;
    platformName: string;
    executableName: string;
    /**
     * engine root
     */
    enginePath: string;
    /**
     * native engine root
     */
    nativeEnginePath: string;
    /**
     * project path
     */
    projDir: string;
    /**
     * build/[platform]
     */
    buildDir: string;
    /**
     * @zh 构建资源路径
     * @en /build/[platform]/data
     */
    buildAssetsDir: string;
    /**
     * @zh 是否加密脚本
     * @en is encrypted
     */
    encrypted?: boolean;
    /**
     * @zh 是否压缩脚本
     * @en is compress script
     */
    compressZip?: boolean;
    /**
     * @zh 加密密钥
     * @en encrypt Key
     */
    xxteaKey?: string;
    /**
     * @zh 是否为模拟器
     * @en is simulator
     */
    simulator?: boolean;
    cMakeConfig: ICMakeConfig;
    constructor(params: CocosParams<T>);
}

export declare interface CompressCacheInfo {
    option: {
        mtime: number | string;
        src: string;
        compressOptions: Record<string, Record<string, string | number>>;
    };
    mipmapFiles: string[] | undefined;
    customConfigs: Record<string, ICustomConfig>;
    dest?: string[];
}

export declare interface CompressedInfo {
    suffixs: string[];
    imagePathNoExt: string;
}

export declare interface CompressExecuteInfo {
    busyFormatType: Partial<Record<ITextureCompressFormatType | string, number>>;
    busyAsset: Set<string>;
    resolve: Function;
    reject: Function;
    state: 'progress' | 'success' | 'failed';
    complete: number;
    total: number;
    childProcess: number;
}

export declare interface Config {
    /**
     * Engine features. Keys are feature IDs.
     */
    features: Record<string, Feature>;
    /**
     * Describe how to generate the index module `'cc'`.
     * Currently not used.
     */
    index?: IndexConfig;
    moduleOverrides?: Array<{
        test: Test;
        overrides: Record<string, string>;
        isVirtualModule: boolean;
    }>;
    /**
     * Included files for quick-compiler.
     */
    includes: Array<string>;
    /**
     * The constants config for engine and user.
     */
    constants: IConstantConfig;
    /**
     * The decorators to be optimize when build engine.
     */
    optimizeDecorators: IOptimizeDecorators;
    /**
     * The TreeShake config
     */
    treeShake?: ITreeShakeConfig;
}

declare namespace ConfigInterface {
    export {
        Config,
        IndexConfig,
        Test,
        Feature,
        Context,
        ConstantTypeName,
        IConstantInfo,
        IConstantConfig,
        IOptimizeDecorators,
        ITreeShakeConfig
    }
}

export declare type ConfigType = 'options' | 'overwrite';

export declare type ConstantTypeName = 'boolean' | 'number';

export declare interface Context {
    mode?: string;
    platform?: string;
    buildTimeConstants?: object;
}

export declare function createBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions): Promise<BuildStageTask>;

export declare function createBuildTask<P extends Platform>(platform: P, options?: IBuildCommandOption): Promise<BuildTask>;

export declare function createBundleBuildTask(bundleOptions: IBundleBuildOptions): Promise<BundleManager>;

export declare interface CustomBundleConfig {
    displayName: string;
    configs: Record<BundlePlatformType, CustomBundleConfigItem>;
}

export declare interface CustomBundleConfigItem {
    preferredOptions?: {
        isRemote: boolean;
        compressionType: BundleCompressionType;
    };
    fallbackOptions?: {
        compressionType: BundleCompressionType;
        isRemote?: boolean;
    };
    overwriteSettings?: Record<string, BundleConfigItem>;
    configMode?: 'auto' | 'fallback' | 'overwrite';
}

export declare class CustomConsole {
    constructor(level?: LogLevel);
    debug: (...args: any[]) => void;
    log: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
}

export declare interface CustomPluginOptions {
    	[plugin: string]: any;
}

/**
 * 资源关联以及依赖关系列表
 * 部分数据需要固化到硬盘上
 */
export declare class DataManager {
    file: string | undefined;
    dataMap: {
        [uuid: string]: IData;
    };
    _saveTimer: any;
    private console;
    constructor(customConsole: CustomConsole);
    /**
     * 设置用于记录的 json 文件
     * @param json
     */
    setRecordJSON(json: string): Promise<void>;
    save(): void;
    saveImmediate(): void;
    /**
     * 检查资源是否有初始化过 data 数据
     * @param asset
     * @returns
     */
    has(asset: VirtualAsset): boolean;
    /**
     *
     * @param asset
     */
    empty(asset: VirtualAsset): void;
    /**
     * 根据 asset 信息更新数据
     * @param asset
     */
    update(asset: VirtualAsset): void;
    /**
     * 设置 value 内存储数据
     * @param asset
     */
    setValue(asset: VirtualAsset, key: string, value: any): void;
    /**
     * 获取 value 内存储的某个数据
     * @param asset
     */
    getValue(asset: VirtualAsset, key: string): any;
    /**
     * 获取一个 data 信息
     * @param uuid
     * @param source
     * @returns
     */
    get(asset: VirtualAsset, key?: keyof IData): null | any;
}

export declare type DecodedSourceMapOrMissing =
	| {
    			mappings?: never;
    			missing: true;
    			plugin: string;
    	  }
	| ExistingDecodedSourceMap;

export declare function defineConfig(options: RollupOptions): RollupOptions;

export declare function defineConfig(options: RollupOptions[]): RollupOptions[];

/**
 * 资源关联以及依赖关系列表，主要影响导入队列以及是否需要重新导入
 * 部分数据需要固化到硬盘上
 */
export declare class DependencyManager {
    static version: string;
    file?: string;
    pathRoot: string;
    dependMap: DependMap;
    _saveTimer: any;
    private console;
    constructor(customConsole: CustomConsole, pathRoot: string);
    /**
     * 设置用于记录的 json 文件
     * @param json
     */
    setRecordJSON(path: string): Promise<void>;
    private _restoreCache;
    private readRecordJSON;
    save(): void;
    saveImmediate(): void;
    /**
     * 记录一个资源依赖的所有资源列表
     * 允许传入 url、uuid、path 三种依赖的格式
     * @param path
     * @param dependNames
     */
    add(type: string, key: string, depends: string | string[]): void;
    /**
     * 清空一个资源的依赖记录
     * @param name
     */
    remove(type: string, key: string): void;
    /**
     * 销毁一个依赖管理器实例
     * @param manager
     */
    destroy(): void;
}

export declare interface DependMap {
    path: {
        [path: string]: string[];
    };
    uuid: {
        [uuid: string]: string[];
    };
}

/** 文件夹资源的 userData */
export declare interface DirectoryAssetUserData {
    /** 是否是资源包 */
    isBundle?: boolean;
    /** 资源包配置 ID */
    bundleConfigID?: string;
    /** 资源包名称 */
    bundleName?: string;
    /** 优先级 */
    priority?: number;
}

/** Effect 着色器资源的 userData */
export declare interface EffectAssetUserData {
    /** 预编译组合 */
    combinations?: any;
    /** 编辑器相关数据 */
    editor?: any;
}

export declare type EmitAsset = (name: string, source?: string | Uint8Array) => string;

export declare type EmitChunk = (id: string, options?: { name?: string }) => string;

export declare type EmitFile = (emittedFile: EmittedFile) => string;

export declare interface EmittedAsset {
    	fileName?: string;
    	name?: string;
    	source?: string | Uint8Array;
    	type: 'asset';
}

export declare interface EmittedChunk {
    	fileName?: string;
    	id: string;
    	implicitlyLoadedAfterOneOf?: string[];
    	importer?: string;
    	name?: string;
    	preserveSignature?: PreserveEntrySignaturesOption;
    	type: 'chunk';
}

export declare type EmittedFile = EmittedAsset | EmittedChunk;

export declare interface EngineInfo {
    typescript: {
        type: 'builtin' | 'custom'; // 当前使用的引擎类型（内置或自定义)
        builtin: string, // 内置引擎地址
        path: string; // 当前使用的 ts 引擎路径
    },
    native: {
        type: 'builtin' | 'custom'; // 当前使用的引擎类型（内置或自定义)
        builtin: string, // 内置引擎地址
        path: string; // 当前使用的原生引擎路径
    },
    tmpDir: string;
    version: string;
}

/**
 * 枚举选项，可以是字符串值或带标签的值
 */
export declare type EnumItem = string | {
    /** 选项显示的标签，支持 i18n:xxx */
    label: string;
    /** 选项的值 */
    value: string | number;
};

export declare function executeBuildStageTask(taskId: string, stageName: string, options: IBuildStageOptions): Promise<IBuildResultData>;

export declare interface ExecuteHookTaskOption {
    pkgName: string;
    hook: string;
    options: IBuildOptionBase;
    [x: string]: any;
}

export declare interface ExistingDecodedSourceMap {
    	file?: string;
    	mappings: SourceMapSegment[][];
    	names: string[];
    	sourceRoot?: string;
    	sources: string[];
    	sourcesContent?: string[];
    	version: number;
}

export declare interface ExistingRawSourceMap {
    	file?: string;
    	mappings: string;
    	names: string[];
    	sourceRoot?: string;
    	sources: string[];
    	sourcesContent?: string[];
    	version: number;
}

export declare type ExternalOption =
	| (string | RegExp)[]
	| string
	| RegExp
	| ((source: string, importer: string | undefined, isResolved: boolean) => boolean | null | void);

/**
 * An engine feature.
 */
export declare interface Feature {
    /**
     * Modules to be included in this feature in their IDs.
     * The ID of a module is its relative path(no extension) under /exports/.
     */
    modules: string[];
    /**
     * Flags to set when this feature is enabled.
     */
    intrinsicFlags?: Record<string, unknown>;
    /**
     * Constants to override when this feature is enabled.
     * The overridden constants should be defined in cc.config.json.
     */
    overrideConstants?: Record<string, number | boolean>;
    /**
     * List of uuid that the feature depends on.
     */
    dependentAssets?: string[];
    /**
     * List of script uuid that the feature depends on.
     */
    dependentScripts?: string[];
    /**
     * List of module that the feature depends on.
     */
    dependentModules?: string[];
    /**
     * Whether it is a native only feature, default is false.
     * @default false
     */
    isNativeOnly?: boolean;
}

export declare interface fileMap {
    src: string;
    dest: string;
}

export declare type Filter = 'none' | 'nearest' | 'linear';

export declare type FirstPluginHooks =
	| 'load'
	| 'renderDynamicImport'
	| 'resolveAssetUrl'
	| 'resolveDynamicImport'
	| 'resolveFileUrl'
	| 'resolveId'
	| 'resolveImportMeta'
	| 'shouldTransformCachedModule';

export declare interface FntData {
    commonHeight?: number;
    fontSize?: number;
    atlasName?: string;
    fontDefDictionary?: FontDefDictionary;
    kerningDict?: KerningDict;
}

export declare interface FontDef {
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    xOffset: number;
    yOffset: number;
    xAdvance: number;
}

export declare interface FontDefDictionary {
    [charId: number]: FontDef;
}

export declare interface FunctionPluginHooks {
    	augmentChunkHash: (this: PluginContext, chunk: PreRenderedChunk) => string | void;
    	buildEnd: (this: PluginContext, err?: Error) => void;
    	buildStart: (this: PluginContext, options: NormalizedInputOptions) => void;
    	closeBundle: (this: PluginContext) => void;
    	closeWatcher: (this: PluginContext) => void;
    	generateBundle: (
    		this: PluginContext,
    		options: NormalizedOutputOptions,
    		bundle: OutputBundle,
    		isWrite: boolean
    	) => void;
    	load: LoadHook;
    	moduleParsed: ModuleParsedHook;
    	options: (this: MinimalPluginContext, options: InputOptions) => InputOptions | null | void;
    	outputOptions: (this: PluginContext, options: OutputOptions) => OutputOptions | null | void;
    	renderChunk: RenderChunkHook;
    	renderDynamicImport: (
    		this: PluginContext,
    		options: {
        			customResolution: string | null;
        			format: InternalModuleFormat;
        			moduleId: string;
        			targetModuleId: string | null;
        		}
    	) => { left: string; right: string } | null | void;
    	renderError: (this: PluginContext, err?: Error) => void;
    	renderStart: (
    		this: PluginContext,
    		outputOptions: NormalizedOutputOptions,
    		inputOptions: NormalizedInputOptions
    	) => void;
    	/** @deprecated Use `resolveFileUrl` instead */
    	resolveAssetUrl: ResolveAssetUrlHook;
    	resolveDynamicImport: ResolveDynamicImportHook;
    	resolveFileUrl: ResolveFileUrlHook;
    	resolveId: ResolveIdHook;
    	resolveImportMeta: ResolveImportMetaHook;
    	shouldTransformCachedModule: ShouldTransformCachedModuleHook;
    	transform: TransformHook;
    	watchChange: WatchChangeHook;
    	writeBundle: (
    		this: PluginContext,
    		options: NormalizedOutputOptions,
    		bundle: OutputBundle
    	) => void;
}

export declare interface GeneratedCodeOptions extends Partial<NormalizedGeneratedCodeOptions> {
    	preset?: GeneratedCodePreset;
}

export declare type GeneratedCodePreset = 'es5' | 'es2015';

export declare type GetInterop = (id: string | null) => InteropType;

export declare type GetManualChunk = (id: string, api: GetManualChunkApi) => string | null | void;

export declare interface GetManualChunkApi {
    	getModuleIds: () => IterableIterator<string>;
    	getModuleInfo: GetModuleInfo;
}

export declare type GetModuleInfo = (moduleId: string) => ModuleInfo | null;

export declare function getPreviewSettings<P extends Platform>(options?: IBuildTaskOption<P>): Promise<IPreviewSettingsResult>;

export declare type GlobalsOption = { [name: string]: string } | ((name: string) => string);

/** glTF 动画资源的 userData */
export declare interface GltfAnimationAssetUserData {
    gltfIndex: number;
    events: Array<{
        frame: number;
        func: string;
        params: string[];
    }>;
    editorExtras?: unknown;
    embeddedPlayers?: Array<{
        editorExtras?: unknown;
        begin: number;
        end: number;
        reconciledSpeed: boolean;
        playable:
        | {
            type: 'animation-clip';
            path: string;
            clip: string;
        }
        | {
            type: 'particle-system';
            path: string;
        };
    }>;
    auxiliaryCurves?: Record<string, { curve: any }>;
    wrapMode: number;
    speed?: number;
    sample?: number;
    span?: {
        from: number;
        to: number;
    };
    additive?: any;
}

/** glTF 嵌入图片子资源的 userData */
export declare interface GltfEmbededImageAssetUserData extends IVirtualAssetUserData {
    /** 是否修复 Alpha 透明度瑕疵 */
    fixAlphaTransparencyArtifacts?: boolean;
}

export declare type GltfpackOptions = Record<string, any>;

/** glTF Skeleton 子资源的 userData */
export declare interface GltfSkeletonAssetUserData extends IVirtualAssetUserData {
    /** 骨骼数量 */
    jointsLength?: number;
}

export declare interface GlTFUserData {
    assetFinder?: SerializedAssetFinder;

    imageMetas: ImageMeta[];

    // Normal import settings
    // @default required
    normals?: NormalImportSetting;

    // Tangent import settings;
    // @default required
    tangents?: TangentImportSetting;

    /**
     * Controls how to import morph normals.
     * @default Exclude.
     */
    morphNormals?: NormalImportSetting.exclude | NormalImportSetting.optional;

    // Whether to extract material assets out of embedded (sub)assets,
    // so that the assets become editable.
    // @default false
    dumpMaterials?: boolean;

    // only for chat avatar
    redirectMaterialMap?: Record<string, string>;

    // The directory to dump the materials.
    // Default to a direct sub-folder prefixed with 'Materials_' under current path.
    materialDumpDir?: string;

    /**
     * Whether to use vertex colors(if valid) in material.
     * @default false
     */
    useVertexColors?: boolean;

    /**
     * Whether to enable depth-write if the material specify the `BLEND` mode.
     * See https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#alpha-coverage
     * @default false
     */
    depthWriteInAlphaModeBlend?: boolean;

    // @default true
    skipValidation?: boolean;

    /**
     * 整个数组由导入器创建。`name` 和 `duration` 也都由导入器写入修改，外部不允许修改。
     * `splits` 是允许用户配置的。
     */
    animationImportSettings?: AnimationImportSetting[];

    /**
     * 是否将所有动画挂载到生成的预制体上。
     * @default false
     */
    mountAllAnimationsOnPrefab?: boolean;

    /**
     * 使用旧的 FBX 导入器。（在非 FBX 导入器上是 `undefined`）
     */
    legacyFbxImporter?: boolean;

    /**
     * 禁用 Mesh 分割，默认勾选
     */
    disableMeshSplit?: boolean;

    /**
     * 允许数据访问。
     */
    allowMeshDataAccess?: boolean;

    /**
     * 是否添加填充顶点色
     * @default false
     */
    addVertexColor?: boolean;

    /**
     * 若开启并且模型场景顶部仅有一个节点，那么以该节点作为根节点转换为 Prefab。
     * 否则，以场景为根节点转换为 Prefab。见 cocos/cocos-engine#11858 。
     */
    promoteSingleRootNode?: boolean;
    /*
    * 若开启则自动生成 Lightmap UV，并将 UV 写入第二个通道（若第二个通道有 UV ， 则该 UV 会被覆盖）
    * 否则，使用默认 UV 。
    */
    generateLightmapUVNode?: boolean;

    /**
     * 关于 FBX 的配置。仅当 `legacyFbxImporter === false` 时有效。
     */
    fbx?: IFbxSetting;

    /**
     * 减面配置
     */
    meshOptimizer?: MeshOptimizerOption;

    /**
     * mesh 优化配置
     */
    meshOptimize?: MeshOptimizeOptions;

    /**
     * 是否开启 mesh 减面
     */
    meshSimplify?: MeshSimplifyOptions;

    /**
     * MeshCluster Options
     */
    meshCluster?: MeshClusterOptions;

    /**
     * Mesh compression options
     */
    meshCompress?: MeshCompressOptions;

    lods?: {
        // 是否开启 LODS
        enable: boolean;
        // fbx 是否自带 LOD
        hasBuiltinLOD: boolean;
        // fbx 各层级 lod 的配置
        options: LODsOption[];
    };
}

export declare type HasModuleSideEffects = (id: string, external: boolean) => boolean;

export declare type IAsset = VirtualAsset | Asset;

export declare interface IAssetGroupItem {
    baseUrls: string[];
    scriptDest: string;
    scriptUuids: UUID[];
    assetUuids: UUID[];
}

export declare type IAssetGroupMap = Record<UUID, IAssetGroupItem>;

export declare interface IAssetGroupOptions {
    scriptUrl: string;
    baseUrl: string;
}

export declare interface IAssetInfo extends IAssetInfo_2 {
    temp?: string;
    dirty?: boolean;
    meta: IAssetMeta;
    subAssets: Record<string, IAssetInfo>;
    mtime: number;
}

export declare interface IAssetInfo_2 {
    name: string; // 资源名字
    source: string; // url 地址
    loadUrl: string; // loader 加载的层级地址
    url: string; // loader 加载地址会去掉扩展名，这个参数不去掉
    file: string; // 绝对路径
    uuid: string; // 资源的唯一 ID
    importer: AssetHandlerType; // 使用的导入器名字
    imported: boolean; // 是否结束导入过程
    invalid: boolean; // 是否导入成功
    type: IAssetType; // 类型
    isDirectory: boolean; // 是否是文件夹
    library: { [key: string]: string }; // 导入资源的 map

    // dataKeys 作用范围
    isBundle?: boolean; // 是否是文件夹
    displayName?: string; // 资源用于显示的名字
    readonly?: boolean; // 是否只读
    visible?: boolean; // 是否显示
    subAssets?: { [key: string]: IAssetInfo_2 }; // 子资源 map
    // 虚拟资源可以实例化成实体的话，会带上这个扩展名
    instantiation?: string;
    redirect?: IRedirectInfo; // 跳转指向资源
    meta?: IAssetMeta,
    parent?: {
        source: string;
        library: { [key: string]: string };
        uuid: string;
    };
    extends?: string[]; // 资源的继承链信息
    mtime?: number; // 资源文件的 mtime
    depends?: string[]; // 依赖的资源 uuid 信息
    dependeds?: string[]; // 被依赖的资源 uuid 信息
    temp?: string; // 资源临时文件目录
}

export declare type IAssetInfoMap = Record<UUID, IAssetInfo>;

export declare interface IAssetMeta<T extends ISupportCreateType | 'unknown' = 'unknown'> {
    ver: string;
    importer: AssetHandlerType;
    imported: boolean;
    uuid: string;
    files: string[];
    subMetas: {
        [index: string]: IAssetMeta<'unknown'>;
    };
    userData: AssetUserDataMap[T extends keyof AssetUserDataMap ? T : 'unknown'];
    displayName?: string;
    id?: string;
    name?: string;
}

export declare interface IAssetPathBase {
    bundleName?: string;
    redirect?: string;
}

export declare interface IAssetPathInfo extends IAssetPathBase {
    raw?: string[];
    import?: string;
    /**
     * @deprecated please use `import` instead
     */
    json?: string;
    /**
     * @deprecated please use `import` instead
     */
    bin?: string;
    groupIndex?: number;
}

export declare type IAssetType =
| ISupportCreateCCType
| 'cc.Asset'               // 基础资源类型（instantiation-asset）
| 'cce.Database'           // 数据库资源
| 'cce.EffectHeader'       // 着色器头文件
| 'cc.VideoClip'           // 视频剪辑
| 'cc.TiledMapAsset'       // 瓦片地图
| 'cc.TTFFont'             // TTF 字体
| 'cc.Texture2D'           // 2D 纹理
| 'cc.SpriteFrame'         // 精灵帧（sprite-frame、rt-sprite-frame）
| 'cc.ImageAsset'          // 图片资源（image、gltf/image、image/alpha、image/sign、texture-cube-face）
| 'cc.TextAsset'           // 文本资源
| 'cc.JsonAsset'           // JSON 资源
| 'cc.AudioClip'           // 音频剪辑
| 'cc.BitmapFont'          // 位图字体
| 'cc.BufferAsset'         // 缓冲区资源
| 'cc.ParticleAsset'       // 粒子资源
| 'cc.RenderPipeline'     // 渲染管线
| 'cc.Skeleton'            // 骨骼（gltf/skeleton、instantiation-asset/skeleton）
| 'cc.Mesh'                // 网格（gltf/mesh、instantiation-asset/mesh）
| 'sp.SkeletonData'        // Spine 骨骼数据
| 'dragonBones.DragonBonesAsset'      // DragonBones 资源
| 'dragonBones.DragonBonesAtlasAsset' // DragonBones 图集资源
| 'RenderStage'            // 渲染阶段
| 'RenderFlow';

export declare type IASTCQuality = 'veryfast' | 'fast' | 'medium' | 'thorough' | 'exhaustive';

export declare interface IAtlasInfo {
    spriteFrameInfos: ISpriteFrameInfo[];
    width: number;
    height: number;
    name: string;
    imagePath: string;
    imageUuid: string;
    textureUuid: string;
    compressed: CompressedInfo;
}

export declare interface IAtlasResult {
    assetsToImage: Record<string, string>;
    imageToAtlas: Record<string, string>;
    atlasToImages: Record<string, string[]>;
}

export declare interface IAutoAtlasUserData {
    name: string;
    bleed: number | boolean;
    width: number;
    height: number;
    removeTextureInBundle: boolean;
    removeImageInBundle: boolean;
    removeSpriteAtlasInBundle: boolean;
    filterUnused: boolean;
}

export declare type IBaseHooks = (options: IBuildOptionBase, result: IBuildResult) => Promise<void> | void;

export declare interface IBinGroupConfig {
    enable: boolean;
    threshold: number;
}

export declare interface IBuildAssetHandlerInfo {
    pkgNameOrder: string[];
    handles: {
        [pkgName: string]: Function;
    };
}

export declare interface IBuildCacheUseConfig {
    serializeData?: boolean;
    engine?: boolean;
    textureCompress?: boolean;
    autoAtlas?: boolean;
}

export declare interface IBuildCommandOption extends Partial<IBuildOptionBase> {
    configPath?: string;
    migrate?: boolean;
    skipCheck?: boolean;
}

export declare interface IBuildCommonOptions {
    /**
     * 构建任务 id
     */
    taskId?: string;
    /**
     * 构建任务名称，用于日志表示提示，默认为 outputName 字段值
     */
    taskName?: string;
    /**
     * 指定的构建日志输出地址
     */
    logDest?: string;
    /**
     * 游戏名称, 默认为项目名称
     */
    name: string;
    /**
     * 构建输出名称，默认为平台名称
     */
    outputName: string;
    /**
     * 构建后的游戏生成文件夹
     */
    buildPath: string;
    /**
     * 构建平台
     * @default 'web-mobile'
     */
    platform: Platform | string;
    /**
     * 构建场景列表，默认为全部场景
     */
    scenes?: IBuildSceneItem[];
    /**
     * 是否跳过纹理压缩
     * @default false
     */
    skipCompressTexture: boolean;
    /**
     * 是否自动合图
     * @default true
     */
    packAutoAtlas: boolean;
    /**
     * 是否生成 sourceMap
     * @default false
     * @description 将已转换的代码映射到源码，以便可以直接查看和调试源码，定位问题。<br><b>【关闭】</b>: 关闭 source map 的生成。这在生产环境中用于减少开发时的资源消耗和提高性能，但会牺牲代码可维护性和调试能力。<br><b>【启用(内联)】</b>: 选择此选项时，source map 信息将作为数据 URI 内联在生成的代码中，通常作为注释。这可以减少 HTTP 请求，但可能会增加生成文件的大小。<br><b>【启用 (独立文件)】</b>: 当用户选择此选项时，将会为转换后的代码生成一个源代码与转换代码之间的映射文件，该文件是独立的，并与主文件分开存储。这有助于在开发工具中跟踪源代码。
     */
    sourceMaps: boolean | 'inline';
    /**
     * 是否使用实验性 eraseModules
     * @default false
     */
    experimentalEraseModules: boolean;
    /**
     * 在 Bundle 中嵌入公共脚本
     * @description 在 Bundle 中包含所有依赖的公共脚本，确保 Bundle 可以被跨项目单独加载。此选项仅在只构建 Bundle 时生效，正常构建时将默认禁用。
     * 【未勾选时】在构建 Bundle 时，会将不同 Bundle 之间公用的一些 helper 之类的内容生成在 src/chunk 内的 bundle.js 内，减少整体脚本的体积。但这样构建出来的 Bundle 是和项目相耦合的，无法跨项目复用。
     * 【勾选时】不再提取 Bundle 依赖的公共 JS 库内而是直接构建在 Bundle 的内部。这样的 Bundle 可以跨项目使用（因为所需的脚本都在 Bundle 的内部，而引用相同代码的 Bundle 可能会有重复的部分），缺陷是由于脚本资源都在 Bundle 内部，因此最终的 Bundle 体积会增大。
     */
    bundleCommonChunk: boolean;
    /**
     * 设置打开游戏后进入的第一个场景，db url 格式
     * @default 默认为场景列表的第一个场景
     */
    startScene: string;
    /**
     * 是否是调试模式
     * @default false
     */
    debug: boolean;
    mangleProperties: boolean;
    inlineEnum: boolean;
    /**
     * MD5 缓存
     * @default false
     * @description 给构建后的所有资源文件名将加上 MD5 信息，解决 CDN 资源缓存问题
     */
    md5Cache: boolean;
    /**
     * JavaScript Polyfills
     * @description 实现运行环境并不支持的 JavaScript 标准库
     */
    polyfills?: IPolyFills;
    buildScriptTargets?: string;
    mainBundleCompressionType: BundleCompressionType;
    mainBundleIsRemote: boolean;
    server?: string;
    startSceneAssetBundle: boolean;
    bundleCommonJs?: string;
    binGroupConfig?: IBinGroupConfig;
    moveRemoteBundleScript: boolean;
    useSplashScreen?: boolean;
    /**
     * 是否是预览进程发送的构建请求。
     * @default false
     */
    preview?: boolean;
    stage?: string;
    buildMode?: 'normal' | 'bundle' | 'script';
    nextStages?: string[];
    packages: Record<string, any>;
    nativeCodeBundleMode: 'wasm' | 'asmjs' | 'both';
    wasmCompressionMode?: 'brotli';
    buildBundleOnly?: boolean;
    bundleConfigs?: IBundleOptions[];
    /**
     * @deprecated please use engineModulesConfigKey
     */
    overwriteProjectSettings?: {
        macroConfig?: {
            cleanupImageCache: string;
        };
        includeModules?: {
            physics?: 'inherit-project-setting' | string;
            'physics-2d'?: 'inherit-project-setting' | string;
            'gfx-webgl2'?: 'inherit-project-setting' | 'on' | 'off';
            [key: string]: string | undefined;
        };
    };
}

export declare interface IBuildEngineParam {
    entry: string;
    debug: boolean;
    mangleProperties: boolean;
    sourceMaps: boolean | 'inline';
    /**
     * @deprecated please use `platformType` instead
     */
    platform?: PlatformType_2;
    platformType: PlatformType_2;
    includeModules: string[];
    engineVersion: string;
    md5Map: string[];
    engineName: string;
    useCache: boolean;
    split?: boolean;
    separateEngineOptions?: Pick<IBuildSeparateEngineOptions, 'useCacheForce' | 'pluginFeatures' | 'outputLocalPlugin' | 'pluginName' | 'signatureProvider'> & {
        checkVersionValid?: boolean;
    };
    targets?: ITransformTarget;
    skip?: boolean;
    nativeCodeBundleMode: 'wasm' | 'asmjs' | 'both';
    assetURLFormat?: 'relative-from-out' | 'relative-from-chunk' | 'runtime-resolved';
    baseUrl?: string;
    flags?: Record<string, IBuildTimeConstantValue>;
    output: string;
    preserveType?: boolean;
    wasmCompressionMode?: 'brotli';
    enableNamedRegisterForSystemJSModuleFormat?: boolean;
    inlineEnum?: boolean;
    loose?: boolean;
}

export declare interface IBuilder {
    cache: BuilderCache;
    result: InternalBuildResult;
    options: IInternalBuildOptions;
    bundleManager: IBundleManager;
    hooksInfo: IBuildHooksInfo;
    buildTemplate: IBuildTemplate;
    buildExitRes: IBuildResultSuccess;
    id: string;
    utils: IBuildUtils;
    updateProcess(message: string, increment?: number): void;
    break(reason: string): void;
}

export declare type IBuilderConfigItem = IConfigItem & {
    experiment?: boolean;
    hidden?: boolean;
    verifyRules?: string[];
    verifyLevel?: IConsoleType;
};

export declare type IBuilderRegisterInfo = IPlatformRegisterInfo | IPluginRegisterInfo;

export declare interface IBuildHooksInfo {
    pkgNameOrder: string[];
    infos: Record<string, {
        path: string;
        internal: boolean;
    }>;
}

export declare type IBuildIconItem = IconConfigWithHook;

export declare interface IBuildManager {
    taskManager: any;
    currentCompileTask: any;
    currentBuildTask: any;
    __taskId: string;
}

export declare interface IBuildOptionBase extends IBuildCommonOptions, OverwriteProjectSettings {
    engineModulesConfigKey?: string;
    useCacheConfig?: IBuildCacheUseConfig;
    taskName: string;
}

export declare interface IBuildPacResult {
    spriteToImage: Record<string, string>;
    textureToImage: Record<string, string>;
    imageToPac: Record<string, string>;
}

export declare interface IBuildPacResult_2 {
    spriteToImage: Record<string, string>;
    textureToImage: Record<string, string>;
    imageToPac: Record<string, string>;
}

export declare interface IBuildPanel {
    Vue: any;
    validator: {
        has: (ruleName: string) => boolean;
        checkRuleWithMessage: (ruleName: ICheckRule, val: any, ...arg: any[]) => Promise<string>;
        check: (ruleName: ICheckRule, val: any, ...arg: any[]) => Promise<boolean>;
        checkWithInternalRule: (ruleName: ICheckRule, val: any, ...arg: any[]) => boolean;
        queryRuleMessage: (ruleName: ICheckRule) => string;
    };
}

export declare interface IBuildPaths {
    dir: string;
    readonly output: string;
    effectBin?: string;
    settings: string;
    systemJs?: string;
    engineDir?: string;
    polyfillsJs?: string;
    assets: string;
    subpackages: string;
    remote: string;
    bundleScripts: string;
    applicationJS: string;
    compileConfig: string;
    importMap: string;
    engineMeta: string;
    tempDir: string;
    plugins: Record<string, string>;
    hashedMap: Record<string, string>;
    projectRoot: string;
}

export declare interface IBuildPlugin {
    configs?: BuildPlugin.Configs;
    assetHandlers?: BuildPlugin.AssetHandlers;
    load?: BuildPlugin.load;
    unload?: BuildPlugin.Unload;
}

export declare interface IBuildPluginConfig {
    doc?: string;
    hooks?: string;
    panel?: string;
    options?: IDisplayOptions;
    verifyRuleMap?: IVerificationRuleMap;
}

export declare interface IBuildPluginProfile {
    builder?: {
        common?: Record<string, any>;
        options?: Record<string, Record<string, any>>;
        taskOptionsMap?: Record<string, any>;
    };
    __version__: string;
    common?: Record<string, any>;
    options?: Record<string, Record<string, any>>;
}

export declare interface IBuildProcessInfo {
    state: ITaskState;
    progress: number;
    message: string;
    id: string;
    options: any;
}

export declare class IBuildResult {
    dest: string;
    paths: IBuildPaths;
    settings?: ISettings;
    /**
     * 指定的 uuid 资源是否包含在构建资源中
     */
    containsAsset: (uuid: string) => boolean;
    /**
     * 获取指定 uuid 原始资源的存放路径（不包括序列化 json）
     * 自动图集的小图 uuid 和自动图集的 uuid 都将会查询到合图大图的生成路径
     * 实际返回多个路径的情况：查询 uuid 为自动图集资源，且对应图集生成多张大图，纹理压缩会有多个图片格式路径
     */
    getRawAssetPaths: (uuid: string) => IRawAssetPathInfo[];
    /**
     * @deprecated please use getImportAssetPaths instead
     * 获取指定 uuid 资源的序列化 json 路径信息
     */
    getJsonPathInfo: (uuid: string) => IImportAssetPathInfo[];
    getImportAssetPaths: (uuid: string) => IImportAssetPathInfo[];
    /**
     * 获取指定 uuid 资源的路径相关信息
     * @return Array<{raw?: string | string[]; import?: string; groupIndex?: number;}>
     * @return.raw: 该资源源文件的实际存储位置，存在多个为数组，不存在则为空
     * @return.import: 该资源序列化数据的实际存储位置，不存在为空，可能是 .bin 或者 .json 格式
     * @return.groupIndex: 若该资源的序列化数据在某个分组内，这里标识在分组内的 index，不存在为空
     */
    getAssetPathInfo: (uuid: string) => IAssetPathInfo[];
}

export declare type IBuildResultData = IBuildResultSuccess | IBuildResultFailed;

export declare interface IBuildResultFailed {
    code: Exclude<BuildExitCode, BuildExitCode.BUILD_SUCCESS>;
    reason?: string;
}

export declare interface IBuildResultSuccess {
    code: BuildExitCode.BUILD_SUCCESS;
    dest: string;
    custom: Record<string, any>;
}

/**
 * 构建使用的场景的数据
 */
export declare interface IBuildSceneItem {
    url: string;
    uuid: string;
}

export declare interface IBuildScriptParam {
    /**
     * 若存在，表示将 import map 转换为指定的模块格式。
     */
    importMapFormat?: 'commonjs' | 'esm';
    polyfills?: IPolyFills;
    /**
     * 擦除模块结构。当选择后会获得更快的脚本导入速度，但无法再使用模块特性，如 `import.meta`、`import()` 等。
     * @experimental
     */
    experimentalEraseModules?: boolean;
    outputName: string;
    targets?: ITransformTarget;
    system?: {
        preset?: 'web' | 'commonjs-like';
    };
    flags: Record<string, IBuildTimeConstantValue>;
    platform: PlatformType_2;
    /**
     * 是否开启模块热重载
     * @default false
     */
    hotModuleReload?: boolean;
    commonDir: string;
    bundleCommonChunk: boolean;
}

export declare type IBuildSeparateEngineCacheOptions = Pick<IBuildSeparateEngineOptions, 'pluginName' | 'engine' | 'platform' | 'platformType' | 'pluginFeatures' | 'nativeCodeBundleMode' | 'signatureProvider' | 'useCacheForce'> & {
    engineFeatureQuery?: IEngineFeatureQuery;
};

/**
 * 引擎分离编译后，默认会生成一份包含全部引擎散文件的目录结构，默认名称为 cocos-js-all
 */
export declare type IBuildSeparateEngineOptions = Pick<IBuildEngineParam, 'platformType' | 'includeModules' | 'output' | 'nativeCodeBundleMode'> & {
    pluginFeatures?: string[] | 'default' | 'all';
    engine: string;
    platform: string;
    importMapOutFile: string;
    outputLocalPlugin?: boolean;
    pluginName: string;
    useCacheForce?: boolean;
    signatureProvider?: string;
};

export declare interface IBuildSeparateEngineResult {
    paths: IEngineCachePaths;
    importMap: Record<string, string>;
}

export declare type IBuildStage = 'build' | 'bundle' | 'make' | 'run' | string;

export declare interface IBuildStageConfig extends IBuildStageItem {
    root: string;
    hooksInfo: IBuildHooksInfo;
    buildTaskOptions: IBuildOptionBase;
}

export declare type IBuildStageHooks = (root: string, options: IBuildOptionBase) => Promise<void> | void;

export declare interface IBuildStageItem {
    name: string;
    displayName?: string;
    description?: string;
    hidden?: boolean;
    parallelism?: 'none' | 'all' | 'other';
    hook: string;
    requiredBuildOptions?: boolean;
}

export declare interface IBuildStageOptions {
    dest: string;
    platform: Platform | string;
    taskName?: string;
}

export declare interface IBuildStagesInfo {
    pkgNameOrder: string[];
    infos: Record<string, IBuildStageItem>;
}

export declare interface IBuildStageTask {
    buildExitRes: IBuildResultSuccess;
    options: IBuildOptionBase;
    buildTaskOptions?: IBuildOptionBase;
    run(): Promise<boolean>;
    saveOptions(): Promise<void>;
}

export declare interface IBuildSystemJsOption {
    dest: string;
    platform: string;
    debug: boolean;
    sourceMaps: boolean | 'inline';
    hotModuleReload?: boolean;
}

export declare interface IBuildTask {
    handle: (options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderCache, settings?: ISettings) => {};
    title: string;
    name: string;
}

export declare interface IBuildTaskItemJSON extends ITaskItemJSON {
    stage: 'build' | string;
    options: IBuildOptionBase;
    dirty: boolean;
    rawOptions?: IBuildOptionBase;
    type: 'build';
}

/**
 * 构建所需的完整参数
 */
export declare interface IBuildTaskOption<P extends Platform = Platform> extends IBuildOptionBase {
    platform: P;
    packages: Record<P, PlatformPackageOptionMap[P]>;
}

export declare interface IBuildTemplate {
    query(name: string): string | null;
    initUrl(relativeUrl: string, name?: string): string | undefined;
    copyTo(dest: string): Promise<void>;
    findFile(dest: string): string | undefined;
    isEnable: boolean;
}

export declare type IBuildTimeConstantValue = StatsQuery.ConstantManager.ValueType;

export declare interface IBuildUtils {
    /**
     * 检查是否全局安装了 nodejs
     */
    isInstallNodeJs: () => Promise<boolean>;
    /**
     * 获取相对路径接口
     * 返回 / 拼接的相对路径
     */
    relativeUrl: (from: string, to: string) => string;
    transformCode: (code: string, options: ITransformOptions) => Promise<string>;
    resolveToRaw: (path: string) => string;
}

export declare type IBuildVerificationFunc = (value: any, options: IBuildOptionBase) => boolean | Promise<boolean>;

export declare interface IBuildWorker {
    Ipc: {
        send: (message: string, ...args: any[]) => void;
        on: (message: string, callbask: (event: any, ...arg: any[]) => Promise<void>) => void;
    };
}

export declare interface IBuildWorkerPluginInfo {
    assetHandlers?: string;
    hooks?: Record<string, string>;
    pkgName: string;
    internal: boolean;
    priority: number;
    customBuildStages?: {
        [platform: string]: IBuildStageItem[];
    };
    buildTemplate?: BuildTemplateConfig;
    customIconConfigs?: {
        [platform: string]: IBuildIconItem[];
    };
}

export declare interface IBundle {
    readonly scenes: IBuildSceneItem[];
    readonly assets: UUID[];
    readonly assetsWithoutRedirect: UUID[];
    readonly scripts: UUID[];
    readonly rootAssets: UUID[];
    readonly isSubpackage: boolean;
    root: string;
    dest: string;
    importBase: string;
    nativeBase: string;
    scriptDest: string;
    name: string;
    priority: number;
    compressionType: BundleCompressionType;
    assetVer: IVersionMap;
    version: string;
    readonly isRemote: boolean;
    redirect: Record<UUID, string>;
    deps: Set<string>;
    groups: IGroup[];
    configOutPutName: string;
    config: IBundleConfig;
    readonly isZip: boolean;
    zipVer: string;
    compressRes: Record<string, string[]>;
    atlasRes: IAtlasResult;
    compressTask: Record<UUID, IImageTaskInfo>;
    _rootAssets: Set<UUID>;
    _scenes: Record<string, IBuildSceneItem>;
    _scripts: Set<UUID>;
    _assets: Set<UUID>;
    output: boolean;
    md5Cache: boolean;
    debug: boolean;
    paths: Record<string, string[]>;
    build(): void;
    initConfig(): void;
    initAssetPaths(): Promise<void>;
    /**
     * 添加根资源，此方法会递归添加子资源的数据支持普通资源与脚本资源
     * @param asset
     * @returns
     */
    addRootAsset(asset: IAsset): void;
    addAsset(asset: IAsset): void;
    /**
     * 添加参与 Bundle 打包的脚本资源，最终输出到 index.js 内
     * 需要提前判断脚本资源类型
     * @param asset
     * @returns
     */
    addScript(asset: IAsset): void;
    removeAsset(asset: UUID): void;
    addRedirect(asset: UUID, redirect: string): void;
    addAssetWithUuid(asset: UUID): void;
    getRedirect(uuid: UUID): string | undefined;
    addGroup(type: IJSONGroupType, uuids: UUID[], name?: string): void;
    addToGroup(type: IJSONGroupType, uuid: UUID): void;
    removeFromGroups(uuid: UUID): void;
    containsAsset(uuid: string, deep?: boolean): boolean;
}

export declare interface IBundleBuildOptions {
    buildTaskIds?: string[];
    taskName: string;
    dest: string;
    buildTaskOptions: IBuildOptionBase;
    logDest?: string;
}

export declare interface IBundleConfig {
    importBase: string;
    nativeBase: string;
    name: string;
    deps: string[];
    uuids: UUID[];
    paths: Record<string, any[]>;
    scenes: Record<string, UUID | number>;
    packs: Record<UUID, Array<UUID | number>>;
    versions: {
        import: Array<UUID | number>;
        native: Array<UUID | number>;
    };
    redirect: Array<string | number>;
    debug: boolean;
    types?: string[];
    encrypted?: boolean;
    isZip?: boolean;
    zipVersion?: string;
    extensionMap: Record<string, Array<UUID | number>>;
    /**
     * 是否有需要预加载的脚本，默认为 `true`。
     */
    hasPreloadScript: boolean;
    dependencyRelationships: Record<string, Array<UUID | number>>;
}

export declare interface IBundleInitOptions extends IBundleOptions {
    root: string;
    name: BuiltinBundleName | string;
    priority: number;
    compressionType: BundleCompressionType;
    isRemote: boolean;
    md5Cache: boolean;
    debug: boolean;
    output?: boolean;
    dest: string;
    scriptDest: string;
}

export declare interface IBundleInternalOptions extends IBundleOptions {
    dest: string;
    scriptDest: string;
    priority: number;
    compressionType: BundleCompressionType;
    isRemote: boolean;
    bundleFilterConfig?: BundleFilterConfig[];
}

export declare interface IBundleListItem {
    name: string;
    root: string;
    output: boolean;
    uuid: string;
    missing?: boolean;
}

export declare interface IBundleManager {
    bundleMap: Record<string, IBundle>;
    bundles: IBundle[];
    destDir: string;
    scriptBuilder: ScriptBuilder;
    packResults: IPacInfo[];
    cache: BuilderCache;
    hookMap: Record<string, string>;
    buildAsset(): Promise<void>;
    initBundle(): Promise<void>;
    initAsset(): Promise<void>;
    buildScript(): Promise<any>;
    outputBundle(): Promise<void>;
    bundleDataTask(): Promise<void>;
    runPluginTask(hookName: string): Promise<void>;
    break(reason: string): void;
}

export declare interface IBundleOptions {
    root: string;
    priority?: number;
    compressionType?: BundleCompressionType;
    isRemote?: boolean;
    output?: boolean;
    name: string;
    dest?: string;
    scriptDest?: string;
    bundleFilterConfig?: BundleFilterConfig[];
}

export declare interface IBundleTaskItemJSON extends ITaskItemJSON {
    options: IBundleBuildOptions;
    type: 'bundle';
}

export declare interface IBundleTaskOption extends IBuildOptionBase {
    dest: string;
}

export declare type ICheckRule = 'pathExist' | 'valid' | 'required' | 'normalName' | 'noChinese' | 'array' | 'string' | 'number' | 'http';

export declare interface IChunkContent {
    skeleton: null | string;
    clips: string[];
}

export declare interface ICMakeConfig {
    USE_AUDIO?: boolean;
    USE_VIDEO?: boolean;
    USE_WEBVIEW?: boolean;
    USE_JOB_SYSTEM_TBB?: boolean;
    USE_JOB_SYSTEM_TASKFLOW?: boolean;
    USE_PORTRAIT?: boolean;
    CC_USE_METAL?: boolean;
    CC_USE_VUKAN?: boolean;
    CC_USE_GLES3: boolean;
    CC_USE_GLES2: boolean;
    COCOS_X_PATH?: string;
    APP_NAME?: string;
    XXTEAKEY: string;
    [propName: string]: any;
    USE_SERVER_MODE: string;
}

export declare interface ICollisionMatrix {
    [x: string]: number;
}

export declare interface ICollisionMatrix_2 {
    [x: string]: number;
}

export declare interface ICommandInfo {
    command: string;
    params?: string[];
    path: string;
}

export declare interface ICompressConfig {
    src: string;
    mipmapFiles?: string[];
    dest: string;
    compressOptions: Record<string, any>;
    format: ITextureCompressType;
    customConfig?: ICustomConfig;
    uuid: string;
    suffix: string;
    formatType: ITextureCompressFormatType;
}

export declare type ICompressImageResult = Record<UUID, {
    formats: string[];
    files: string[];
}>;

export declare type ICompressOptions = Record<string, number>;

export declare interface ICompressPresetConfig {
    name: string;
    options: Record<ITextureCompressPlatform, Record<ITextureCompressType, {
        quality: number | string;
    }>>;
}

export declare interface IconConfig {
    type: 'icon' | 'image';
    value: string;
}

export declare interface IconConfigWithHook extends ICustomBuildIconItem {
    executeType: 'hook';
    hook: string;
}

export declare type IConfigGroups = Record<ITextureCompressPlatform, IConfigGroupsInfo>;

export declare interface IConfigGroupsInfo {
    defaultSupport?: ISupportFormat;
    support: ISupportFormat;
    displayName: string;
    icon: string;
    supportOverwrite?: boolean;
}

/**
 * 用户数据配置项
 * 根据 type 字段的不同，需要提供相应的必需字段：
 * - enum: 必须提供 items
 * - array: 必须提供 items
 * - object: 必须提供 properties
 * - boolean/string/number: 只需基本字段
 */
export declare type IConfigItem = IConfigItemString | IConfigItemNumber | IConfigItemBoolean | IConfigItemEnum | IConfigItemArray | IConfigItemObject;

/**
 * 数组类型配置项
 */
export declare interface IConfigItemArray extends IConfigItemBase {
    type: 'array';
    /** 数组项配置，定义数组中每个元素的类型和结构 */
    items: IConfigItem | IConfigItem[];
    /** 最小数组长度 */
    minItems?: number;
    /** 最大数组长度 */
    maxItems?: number;
    /** 默认值必须是数组 */
    default?: any[];
}

/**
 * 用户数据配置项的基础接口
 */
export declare interface IConfigItemBase {
    /** 唯一标识符 */
    key?: string;
    /** 配置显示的名字，如果需要翻译，则传入 i18n:${key} */
    label?: string;
    /** 设置的简单说明，支持 i18n:xxx */
    description?: string;
    /** 默认值 */
    default?: any;
}

/**
 * 布尔类型配置项
 */
export declare interface IConfigItemBoolean extends IConfigItemBase {
    type: 'boolean';
    default?: boolean;
}

/**
 * 枚举类型配置项
 */
export declare interface IConfigItemEnum extends IConfigItemBase {
    type: 'enum';
    /** 枚举选项列表，可以是字符串数组或对象数组 */
    items: EnumItem[];
    /** 默认值必须是 items 中的值 */
    default?: string | number;
}

/**
 * 数字类型配置项
 */
export declare interface IConfigItemNumber extends IConfigItemBase {
    type: 'number';
    /** 最小值 */
    minimum?: number;
    /** 最大值 */
    maximum?: number;
    /** 步长 */
    step?: number;
    default?: number;
}

/**
 * 对象类型配置项
 */
export declare interface IConfigItemObject extends IConfigItemBase {
    type: 'object';
    /** 对象属性配置，定义对象中每个属性的类型和结构 */
    properties: Record<string, IConfigItem>;
    /** 必需属性列表 */
    required?: string[];
    /** 默认值必须是对象 */
    default?: Record<string, any>;
}

/**
 * 字符串类型配置项
 */
export declare interface IConfigItemString extends IConfigItemBase {
    type: 'string';
    /** 最小长度 */
    minLength?: number;
    /** 最大长度 */
    maxLength?: number;
    /** 正则表达式验证 */
    pattern?: string;
    default?: string;
}

export declare interface IConsoleMessage {
    type: ICustomConsoleType;
    value: string;
    num: number;
    time: string;
}

export declare type IConsoleType = 'log' | 'warn' | 'error' | 'debug' | 'info' | 'success' | 'ready' | 'start';

export declare interface IConstantConfig {
    [ConstantName: string]: IConstantInfo;
}

export declare interface IConstantInfo {
    /**
     * The comment of the constant.
     * Which is used to generate the consts.d.ts file.
     */
    readonly comment: string;
    /**
     * The type of the constant for generating consts.d.ts file.
     */
    readonly type: ConstantTypeName;
    /**
     * The default value of the constant.
     * It can be a boolean, number or string.
     * When it's a string type, the value is the result of eval().
     */
    value: boolean | string | number;
    /**
     * Whether exported to global as a `CC_XXXX` constant.
     * eg. WECHAT is exported to global.CC_WECHAT
     * NOTE: this is a feature of compatibility with Cocos 2.x engine.
     * Default is false.
     *
     * @default false
     */
    ccGlobal?: boolean;
    /**
     * Whether exported to developer.
     * If true, it's only exported to engine.
     */
    readonly internal: boolean;
    /**
     * Some constant can't specify the value in the Editor, Preview or Test environment,
     * so we need to dynamically judge them in runtime.
     * These values are specified in a helper called `helper-dynamic-constants.ts`.
     * Default is false.
     *
     * @default false
     */
    dynamic?: boolean;
}

export declare type ICustomAssetHandlerType = 'compressTextures';

export declare type ICustomBuildIconInfo = IBuildIconItem & {
    pkgName: string;
};

export declare interface ICustomBuildIconItem extends IconConfig {
    description?: string;
    disabled?: (taskInfo: IBuildTaskItemJSON) => boolean | Promise<boolean>;
}

export declare interface ICustomBuildScriptParam extends IBuildScriptParam {
    experimentalHotReload: boolean;
}

export declare type ICustomBuildStageDisplayItem = IBuildStageItem & {
    groupItems: IBuildStageItem[];
    inGroup: boolean;
    lock?: boolean;
};

export declare interface ICustomConfig {
    id: string;
    name: string;
    path: string;
    command: string;
    format: string;
    overwrite?: boolean;
    num?: number;
}

export declare type ICustomConsoleType = IConsoleType | 'group' | 'groupEnd' | 'groupCollapsed';

export declare interface ICustomJointTextureLayout {
    textureLength: number;
    contents: IChunkContent[];
}

export declare interface IData {
    url: string;
    value: {
        [key: string]: any;
    };
    versionCode: number;
}

export declare interface IDefaultGroup {
    assetUuids: UUID[];
    scriptUuids: UUID[];
    jsonUuids: UUID[];
}

/**
 * 构建使用的设计分辨率数据
 */
export declare interface IDesignResolution {
    height: number;
    width: number;
    fitWidth?: boolean;
    fitHeight?: boolean;
    policy?: number;
}

export declare type IDisplayOptions = Record<string, IBuilderConfigItem>;

export declare interface IEngineCachePaths {
    dir: string;
    all: string;
    plugin: string;
    meta: string;
    signatureJSON: string;
    pluginJSON: string;
}

export declare interface IEngineConfig extends IEngineModuleConfig {
    physicsConfig: IPhysicsConfig_2;
    macroConfig?: Record<string, string | number | boolean>;
    sortingLayers: { id: number, name: string, value: number }[];
    customLayers: { name: string, value: number }[];
    renderPipeline?: string;
    // 是否使用自定义管线，如与其他模块配置不匹配将会以当前选项为准
    customPipeline?: boolean;
    highQuality: boolean;

    macroCustom: MacroItem[];

    customJointTextureLayouts: ICustomJointTextureLayout[];
    designResolution: IDesignResolution;
    splashScreen: ISplashSetting;
    downloadMaxConcurrency: number;
}

export declare interface IEngineFeatureQuery {
    all: string[];
    allUnit: string[];
    plugin: string[];
    pluginUnit: string[];
    engineStatsQuery: StatsQuery;
    envLimitModule: IEnvLimitModule;
    _defaultPlugins: string[];
    env: StatsQuery.ConstantManager.ConstantOptions;
    getUnitsOfFeatures(features: string[]): string[];
    filterEngineModules(features: string[]): string[];
}

export declare interface IEngineModuleConfig {
    // ---- 模块配置相关 ----
    includeModules: string[];
    flags?: IFlags;
    noDeprecatedFeatures?: { value: boolean, version: string };
}

export declare type IEnvLimitModule = Record<string, {
    envList: string[];
    fallback?: string;
}>;

export declare type IETCQuality = 'slow' | 'fast';

export declare interface IExportBuildOptions extends IBuildTaskOption {
    __version__: string;
}

export declare interface IFbxSetting {
    /**
     * https://github.com/cocos-creator/FBX-glTF-conv/pull/26
     */
    unitConversion?: 'geometry-level' | 'hierarchy-level' | 'disabled';

    /**
     * 动画烘焙速率。单位为 FPS。
     * 一般来说有以下几种 FPS 选项。
     * - NTSC video 30/60
     * - PAL video 25
     * - Film 24
     * 见 https://knowledge.autodesk.com/support/3ds-max/learn-explore/caas/CloudHelp/cloudhelp/2020/ENU/3DSMax-Reference/files/GUID-92B75FD6-C112-44D6-AB89-DB50D11AE0DE-htm.html 。
     * 为了以后的拓展性，我们目前仅支持用户从这几种选项中选择。
     * @default 24
     */
    animationBakeRate?: 0 | 24 | 25 | 30 | 60;

    /**
     * 在导出动画时，是否优先使用 FBX 内记录的时间范围。
     * @default true
     */
    preferLocalTimeSpan?: boolean;

    /**
     * 是否为导入的材质匹配DCC的光照模型.
     * 在导入时,若此字段为 `undefined` 时,该字段将被初始化为当前配置的"是否开启智能材质转换".
     */
    smartMaterialEnabled?: boolean;

    /**
     * 匹配 DCC 原始模型名称。
     */
    matchMeshNames?: boolean;
}

export declare type IFlags = Record<string, boolean | number>;

export declare interface IGroup {
    name: string;
    type: IJSONGroupType;
    uuids: UUID[];
}

export declare type IGroupType = 'json' | 'script' | 'asset';

export declare interface IHandlerInfo {
    type: 'program' | 'npm' | 'function';
    info: ICommandInfo | Function;
    func?: Function;
}

export declare interface IImageTaskInfo {
    src: string;
    presetId: string;
    hasAlpha: boolean;
    mtime: string | number;
    hasMipmaps: boolean;
    compressOptions: Record<string, any>;
    dest: string[];
    suffix: string[];
    dirty?: boolean;
}

export declare interface IImportAssetPathInfo extends IAssetPathBase {
    import?: string;
    /**
     * @deprecated please use `import` instead
     */
    json?: string;
    /**
     * @deprecated please use `import` instead
     */
    bin?: string;
    groupIndex?: number;
}

export declare interface IImportMapOptions {
    debug: boolean;
    dest: string;
    importMapFormat?: 'commonjs' | 'esm';
}

export declare type IInstanceMap = Record<UUID, any>;

export declare type IInterBuildTaskOption<P extends Platform = Platform> = IInternalBuildOptions & {
    platform: P;
    packages: Record<P, PlatformPackageOptionMap[P]>;
};

export declare type IInternalBaseHooks = (options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderCache, ...args: any[]) => void;

export declare interface IInternalBuildOptions extends IInternalBundleBuildOptions {
    dest: string;
    appTemplateData: appTemplateData;
    buildEngineParam: IBuildEngineParam;
    updateOnly: boolean;
    generateCompileConfig?: boolean;
    recompileConfig?: IRecompileConfig;
    resolution: {
        width: number;
        height: number;
        policy: number;
    };
    useCache?: boolean;
    bundleConfigs?: IBundleInternalOptions[];
}

export declare interface IInternalBuildPluginConfig extends IBuildPluginConfig {
    doc?: string;
    displayName?: string;
    hooks?: string;
    priority?: number;
    options?: IDisplayOptions;
    verifyRuleMap?: IVerificationRuleMap;
    commonOptions?: Record<string, Partial<IBuilderConfigItem>>;
    internal?: boolean;
    customBuildStages?: Array<IBuildStageItem>;
}

export declare interface IInternalBuildSceneItem extends IBuildSceneItem {
    bundle: string;
    missing?: boolean;
}

export declare interface IInternalBuildUtils extends IBuildUtils {
    /**
     * 获取构建出的所有模块或者模块包文件。
     */
    getModuleFiles(result: InternalBuildResult): Promise<string[]>;
    /**
     * 快速开启子进程
     * @param command
     * @param cmdParams
     * @param options
     */
    quickSpawn(command: string, cmdParams: string[], options?: IQuickSpawnOption): Promise<number | boolean>;
    /**
     * 将某个 hash 值添加到某个路径上
     * @param targetPath
     * @param hash
     * @returns
     */
    patchMd5ToPath(targetPath: string, hash: string): string;
    /**
     * 编译脚本，遇到错误将会抛出异常
     * @param contents
     * @param path
     */
    compileJS(contents: Buffer, path: string): string;
}

export declare type IInternalBundleBaseHooks = (this: IBundleManager, options: IInternalBundleBuildOptions, bundles: IBundle[], cache: BuilderCache) => void;

export declare interface IInternalBundleBuildOptions extends MakeRequired<IBuildOptionBase, 'includeModules' | 'macroConfig' | 'engineModulesConfigKey' | 'customPipeline' | 'renderPipeline' | 'designResolution' | 'physicsConfig' | 'flags' | 'taskId'> {
    dest: string;
    buildScriptParam: IBuildScriptParam;
    assetSerializeOptions: AssetSerializeOptions;
    md5CacheOptions: IMD5Options;
    logDest: string;
    platformType: StatsQuery.ConstantManager.PlatformType;
}

export declare namespace IInternalHook {
    export type throwError = boolean;
    export type title = string;
    export type onBeforeBuild = IInternalBaseHooks;
    export type onBeforeInit = IInternalBaseHooks;
    export type onAfterInit = IInternalBaseHooks;
    export type onBeforeBuildAssets = IInternalBaseHooks;
    export type onAfterBuildAssets = IInternalBaseHooks;
    export type onBeforeCompressSettings = IInternalBaseHooks;
    export type onAfterCompressSettings = IInternalBaseHooks;
    export type onAfterBuild = IInternalBaseHooks;
    export type onBeforeCopyBuildTemplate = IInternalBaseHooks;
    export type onAfterCopyBuildTemplate = IInternalBaseHooks;
    export type onBeforeBundleInit = IInternalBundleBaseHooks;
    export type onAfterBundleInit = IInternalBundleBaseHooks;
    export type onBeforeBundleDataTask = IInternalBundleBaseHooks;
    export type onAfterBundleDataTask = IInternalBundleBaseHooks;
    export type onBeforeBundleBuildTask = IInternalBundleBaseHooks;
    export type onAfterBundleBuildTask = IInternalBundleBaseHooks;
    export type onBeforeRun = IInternalStageTaskHooks;
    export type run = IInternalStageTaskHooks;
    export type onAfterRun = IInternalStageTaskHooks;
    export type onBeforeMake = IInternalStageTaskHooks;
    export type make = IInternalStageTaskHooks;
    export type onAfterMake = IInternalStageTaskHooks;
}

export declare interface IInternalPackOptions {
    maxWidth: number;
    maxHeight: number;
    padding: number;
    allowRotation: boolean;
    forceSquared: boolean;
    powerOfTwo: boolean;
    algorithm: 'MaxRects' | 'ipacker';
    format: string;
    quality: number;
    contourBleed: boolean;
    paddingBleed: boolean;
    filterUnused: boolean;
    removeTextureInBundle: boolean;
    removeImageInBundle: boolean;
    removeSpriteAtlasInBundle: boolean;
    compressSettings: Record<string, any>;
    bleed: number;
    mode: 'preview' | 'build';
    name: string;
    destDir: string;
}

export declare type IInternalStageTaskHooks = {
    this: IBuildStageTask;
    root: string;
    options: IInternalBuildOptions;
};

export declare type IInternalVerificationFunc = (val: any, ...arg: any[]) => boolean;

export declare interface IInternalVerificationRule {
    func: IInternalVerificationFunc;
    message: string;
}

export declare interface IJSONGroupItem {
    name?: string;
    type: string;
    uuids: UUID[];
}

export declare type IJsonGroupMap = Record<UUID, IJSONGroupItem>;

export declare type IJSONGroupType = 'NORMAL' | 'TEXTURE' | 'IMAGE' | 'BIN';

export declare type IJsonMap = Record<UUID, any>;

/**
 * @deprecated please use `IImportAssetPathInfo` instead
 */
export declare type IJsonPathInfo = IImportAssetPathInfo;

/** 图片资源的 userData  */
export declare interface ImageAssetUserData {
    /** 图片类型 */
    type: ImageImportType;
    /** 垂直翻转 */
    flipVertical?: boolean;
    /** 消除透明伪影 */
    fixAlphaTransparencyArtifacts?: boolean;
    /** 是否为 RGBE */
    isRGBE?: boolean;
    /** 这个图片是不是拥有 alpha 通道 */
    hasAlpha?: boolean;
    /** 重定向的 uuid */
    redirect?: string;
    visible?: boolean;
    /** 是否翻转绿通道 */
    flipGreenChannel?: boolean;

    /**
     * 部分资源导入后可能产生多张图像资源
     */
    sign?: string;
    alpha?: string;
}

export declare interface ImageCompressTask {
    src: string;
    mipmapFiles?: string[];
    presetId: string;
    compressOptions: Record<string, any>;
    dest?: string[];
    suffix?: string[];
    mtime?: any;
}

export declare type ImageImportType = 'raw' | 'texture' | 'normal map' | 'sprite-frame' | 'texture cube';

export declare interface ImageMeta {
    /**
     * 图片名字。
     */
    name?: string;

    /**
     * 模型文件中该图片的 URI，可能是以下形式：
     *   - Database URL，这种路径的图片存在项目目录中；
     *   - uuid URI，这种路径的图片已经作为子资源导入，路径代表子资源的 uuid。
     * 如果未定义，表示此图片未指定源或指定的源无法解析。
     */
    uri?: string;

    /**
     * 用户设置的图片对象。
     * 3.8.0 以前使用路径，3.8.0 之后使用 UUID。
     */
    remap?: string;
}

export declare interface IMD5Map {
    'raw-assets': Record<UUID, string>;
    import: Record<UUID, string>;
    plugin?: Record<UUID, string>;
}

export declare interface IMD5Options {
    excludes: string[];
    includes: string[];
    replaceOnly: string[];
    handleTemplateMd5Link: boolean;
}

export declare type IMetaMap = Record<UUID, any>;

export declare type IModules = 'esm' | 'commonjs' | 'systemjs';

export declare interface ImportMap {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
}

export declare interface ImportMapOptions {
    data: ImportMapWithImports;
    format?: 'commonjs' | 'esm';
    output: string;
}

export declare type ImportMapWithImports = ImportMap & {
    imports: NonNullable<ImportMap['imports']>;
};

export declare interface IndexConfig {
    modules?: Record<string, {
        /**
         * If specified, export contents of the module into a namespace specified by `ns`
         * and then export that namespace into `'cc'`.
         * If not specified, contents of the module will be directly exported into `'cc'`.
         */
        ns?: string;
        /**
         * If `true`, accesses the exports of this module from `'cc'` will be marked as deprecated.
         */
        deprecated?: boolean;
    }>;
}

/**
 * 缓存所有文件的 mtimeMs 时间，用于比对是否修改
 * 这部分数据需要落地到文件系统
 */
export declare class InfoManager {
    static version: string;
    private file;
    pathRoot: string;
    private recordInfo;
    private console;
    constructor(customConsole: CustomConsole, pathRoot: string);
    _saveTimer: null | NodeJS.Timeout;
    /**
     * 设置记录数据的 json 文件
     * @param path
     */
    setRecordJSON(path: string): Promise<void>;
    private _restoreCache;
    private _readRecordInfo;
    /**
     * 销毁一个管理器实例
     * @param manager
     */
    destroy(): void;
    save(): void;
    saveImmediate(): void;
    /**
     * 更新一个缓存数据
     * @param path
     * @param mtimeMs
     * @param uuid
     */
    add(path: string, mtimeMs: number, uuid?: string): void;
    /**
     * 删除缓存的一个 mtime 数据
     * @param path
     */
    remove(path: string): void;
    /**
     * 获取缓存的 stats 对象
     * @param path
     */
    get(path: string): SimpleInfo;
    /**
     * 添加一个丢失的资源信息
     * @param path
     * @param info
     */
    private addMissing;
    /**
     * 根据 uuid 获取丢失的资源信息
     * @param uuid
     * @returns
     */
    getMissingInfo(uuid: string): MissingAssetInfo;
    /**
     * 对比现在文件和内存里缓存的 stats 是否有修改
     * 返回是否相等
     * @param path
     * @param stats
     */
    compare(path: string, mtimeMs: number): boolean;
    forEach(handler: Function): Promise<void>;
}

export declare function init(platform?: string): Promise<void>;

export declare type InputOption = string | string[] | { [entryAlias: string]: string };

export declare interface InputOptions {
    	acorn?: Record<string, unknown>;
    	acornInjectPlugins?: (() => unknown)[] | (() => unknown);
    	cache?: false | RollupCache;
    	context?: string;
    	experimentalCacheExpiry?: number;
    	external?: ExternalOption;
    	/** @deprecated Use the "inlineDynamicImports" output option instead. */
    	inlineDynamicImports?: boolean;
    	input?: InputOption;
    	makeAbsoluteExternalsRelative?: boolean | 'ifRelativeSource';
    	/** @deprecated Use the "manualChunks" output option instead. */
    	manualChunks?: ManualChunksOption;
    	maxParallelFileOps?: number;
    	/** @deprecated Use the "maxParallelFileOps" option instead. */
    	maxParallelFileReads?: number;
    	moduleContext?: ((id: string) => string | null | void) | { [id: string]: string };
    	onwarn?: WarningHandlerWithDefault;
    	perf?: boolean;
    	plugins?: (Plugin_2 | null | false | undefined)[];
    	preserveEntrySignatures?: PreserveEntrySignaturesOption;
    	/** @deprecated Use the "preserveModules" output option instead. */
    	preserveModules?: boolean;
    	preserveSymlinks?: boolean;
    	shimMissingExports?: boolean;
    	strictDeprecations?: boolean;
    	treeshake?: boolean | TreeshakingPreset | TreeshakingOptions;
    	watch?: WatcherOptions | false;
}

export declare type InputPluginHooks = Exclude<keyof FunctionPluginHooks, OutputPluginHooks>;

export declare interface InternalBuildResult {
    settings: ISettings;
    scriptPackages: string[];
    pluginVers: Record<UUID, string>;
    pluginScripts: Array<{
        uuid: string;
        url: string;
        file: string;
    }>;
    compressImageResult: ICompressImageResult;
    importMap: ImportMapWithImports;
    rawOptions: IBuildOptionBase;
    paths: IBuildPaths;
    compileOptions?: any;
    separateEngineResult?: IBuildSeparateEngineResult;
}

export declare class InternalBuildResult_2 extends EventEmitter implements InternalBuildResult {
    settings: ISettings;
    scriptPackages: string[];
    pluginVers: Record<string, string>;
    compressImageResult: ICompressImageResult;
    /**
     * @param name
     * @param options
     * 导入映射
     */
    importMap: ImportMapWithImports;
    rawOptions: IBuildOptionBase;
    paths: IBuildPaths;
    compileOptions: any;
    private __task;
    pluginScripts: Array<{
        uuid: string;
        url: string;
        file: string;
    }>;
    separateEngineResult?: IBuildSeparateEngineResult;
    get dest(): string;
    constructor(task: IBuilder, preview: boolean);
}

export declare type InternalModuleFormat = 'amd' | 'cjs' | 'es' | 'iife' | 'system' | 'umd';

export declare type InternalNativePlatform = 'mac' | 'android' | 'google-play' | 'windows' | 'ios' | 'ohos' | 'harmonyos-next';

export declare interface InternalPackageInfo {
    name: string;
    path: string;
    buildPath: string;
    doc?: string;
    displayName?: string;
    version: string;
}

export declare type InternalPlatform = 'web-desktop' | 'web-mobile' | 'mac' | 'ios' | 'android' | 'google-play' | 'windows' | 'ohos' | 'harmonyos-next';

export declare type InteropType = boolean | 'auto' | 'esModule' | 'default' | 'defaultOnly';

export declare interface IOptimizeDecorators {
    /**
     * The decorators which should be optimized when they only decorate class fields.
     */
    fieldDecorators: string[];
    /**
     * The decorators which should be removed directly when they only work in Cocos Creator editor.
     */
    editorDecorators: string[];
}

export declare type IOrientation = 'auto' | 'landscape' | 'portrait';

export declare type IOrientation_2 = 'auto' | 'landscape' | 'portrait';

export declare interface IPacInfo {
    spriteFrames: any[];
    relativePath: string;
    relativeDir: string;
    uuid: string;
    path: string;
    packOptions: IPackOptions;
}

export declare interface IPackageInfo {
    name: string;
    path: string;
    uuids: UUID[];
}

export declare interface IPackageRegisterInfo {
    config: string;
    platform: string;
    hooks?: string;
    register?: boolean;
}

export declare interface IPackOptions {
    maxWidth: number;
    maxHeight: number;
    padding: number;
    allowRotation: boolean;
    forceSquared: boolean;
    powerOfTwo: boolean;
    algorithm: 'MaxRects' | 'ipacker';
    format: string;
    quality: number;
    contourBleed: boolean;
    paddingBleed: boolean;
    filterUnused: boolean;
    removeTextureInBundle: boolean;
    removeImageInBundle: boolean;
    removeSpriteAtlasInBundle: boolean;
    compressSettings: Record<string, any>;
    bleed: number;
    mode: 'preview' | 'build';
}

export declare interface IPackResult {
    atlases: IAtlasInfo[];
    unpackedImages: {
        imageUuid: string;
        libraryPath: string;
    }[];
    pacUuid: string;
}

export declare interface IPhysicsConfig {
    gravity: IVec3Like;
    allowSleep: boolean;
    sleepThreshold: number;
    autoSimulation: boolean;
    fixedTimeStep: number;
    maxSubSteps: number;
    defaultMaterial?: string;
    useNodeChains: boolean;
    collisionMatrix: ICollisionMatrix;
    physicsEngine: string;
    physX?: {
        notPackPhysXLibs: boolean;
        multiThread: boolean;
        subThreadCount: number;
        epsilon: number;
    };
}

export declare interface IPhysicsConfig_2 {
    gravity: IVec3Like_2; // （0，-10， 0）
    allowSleep: boolean; // true
    sleepThreshold: number; // 0.1，最小 0
    autoSimulation: boolean; // true
    fixedTimeStep: number; // 1 / 60 ，最小 0
    maxSubSteps: number; // 1，最小 0
    defaultMaterial?: string; // 物理材质 uuid
    useNodeChains: boolean; // true
    collisionMatrix: ICollisionMatrix_2;
    physicsEngine: string;
    physX?: {
        notPackPhysXLibs: boolean;
        multiThread: boolean;
        subThreadCount: number;
        epsilon: number;
    };
}

export declare interface IPhysicsMaterial {
    friction: number;
    rollingFriction: number;
    spinningFriction: number;
    restitution: number;
}

export declare interface IPlatformBuildPluginConfig extends MakeRequired<IInternalBuildPluginConfig, 'displayName'> {
    platformType: StatsQuery.ConstantManager.PlatformType;
    icon?: IconConfig;
    textureCompressConfig?: PlatformCompressConfig;
    buildTemplateConfig?: BuildTemplateConfig;
    assetBundleConfig?: {
        supportedCompressionTypes: BundleCompressionType[];
        platformType: IPlatformType;
    };
    customIconConfigs?: Array<IBuildIconItem>;
}

export declare interface IPlatformConfig {
    texture: PlatformCompressConfig;
    type: IPlatformType;
    platformType: StatsQuery.ConstantManager.PlatformType;
    name: string;
    createTemplateLabel: string;
}

export declare interface IPlatformInfo {
    label: string;
    icon?: IconConfig;
}

export declare interface IPlatformRegisterInfo {
    config: IPlatformBuildPluginConfig;
    platform: string;
    path: string;
    hooks?: string;
    pkgName?: string;
    type: 'register';
}

export declare type IPlatformType = 'native' | 'miniGame' | 'web';

export declare type IPluginHook = Record<IPluginHookName, IInternalBaseHooks>;

export declare type IPluginHookName = 'onBeforeBuild' | 'onAfterInit' | 'onBeforeInit' | 'onAfterInit' | 'onBeforeBuildAssets' | 'onAfterBuildAssets' | 'onBeforeCompressSettings' | 'onAfterCompressSettings' | 'onAfterBuild' | 'onBeforeCopyBuildTemplate' | 'onAfterCopyBuildTemplate' | 'onError';

export declare interface IPluginRegisterInfo {
    config: IInternalBuildPluginConfig;
    platform: string;
    pkgName?: string;
    path: string;
    hooks?: string;
    type: 'plugin';
}

export declare interface IPluginScriptInfo extends PluginScriptInfo {
    url: string;
}

export declare interface IPolyFills {
    /**
     * True if async functions polyfills(i.e. regeneratorRuntime) needs to be included.
     * You need to turn on this field if you want to use async functions in language.
     */
    asyncFunctions?: boolean;
    /**
     * If true, [core-js](https://github.com/zloirock/core-js) polyfills are included.
     * The default options of [core-js-builder](https://github.com/zloirock/core-js/tree/master/packages/core-js-builder)
     * will be used to build the core-js.
     */
    coreJs?: boolean;
    targets?: string;
}

export declare interface IPreviewSettingsResult {
    settings: ISettings;
    script2library: Record<string, string>;
    bundleConfigs: IBundleConfig[];
}

export declare type IProcessingFunc = (process: number, message: string, state?: ITaskState) => void;

export declare type IPVRQuality = 'fastest' | 'fast' | 'normal' | 'high' | 'best';

export declare interface IQuickSpawnOption {
    cwd?: string;
    env?: any;
    downGradeWaring?: boolean;
    downGradeLog?: boolean;
    downGradeError?: boolean;
    ignoreLog?: boolean;
    ignoreError?: boolean;
    prefix?: string;
    shell?: boolean;
}

export declare interface IRawAssetPathInfo extends IAssetPathBase {
    raw: string[];
}

export declare interface IRecompileConfig {
    enable: boolean;
    generateAssets: boolean;
    generateScripts: boolean;
    generateEngine: boolean;
    generateEngineByCache: boolean;
}

export declare interface IRedirectInfo {
    // 跳转资源的类型
    type: string;
    // 跳转资源的 uuid
    uuid: string;
}

export declare interface IScriptInfo {
    file: string;
    uuid: string;
}

export declare interface IScriptOptions {
    transform: TransformOptions;
    debug: boolean;
    sourceMaps: boolean | 'inline';
    hotModuleReload: boolean;
    moduleFormat: rollup.ModuleFormat;
    modulePreservation: ModulePreservation;
    commonDir: string;
    bundleCommonChunk: boolean;
}

export declare interface IScriptProjectOption extends SharedSettings {
    ccEnvConstants: CCEnvConstants;
    dbInfos: {
        dbID: string;
        target: string;
    }[];
    customMacroList: MacroItem[];
}

export declare interface ISerializedOptions {
    debug: boolean;
    useCCONB?: boolean;
    useCCON?: boolean;
    _exporting?: boolean;
    dontStripDefault?: boolean;
    'cc.EffectAsset'?: {
        glsl1: boolean;
        glsl3: boolean;
        glsl4: boolean;
    };
}

export declare interface ISettings {
    CocosEngine: string;
    engine: {
        debug: boolean;
        macros: Record<string, any>;
        customLayers: {
            name: string;
            bit: number;
        }[];
        sortingLayers: {
            id: number;
            name: string;
            value: number;
        }[];
        platform: string;
        engineModules?: string[];
        builtinAssets: string[];
    };
    physics?: IPhysicsConfig;
    rendering: {
        renderPipeline: string;
        renderMode?: number;
        effectSettingsPath?: string;
        customPipeline?: boolean;
    };
    assets: {
        server: string;
        remoteBundles: string[];
        bundleVers: Record<string, string>;
        preloadBundles: {
            bundle: string;
            version?: string;
        }[];
        importBase?: string;
        nativeBase?: string;
        subpackages: string[];
        preloadAssets: string[];
        jsbDownloaderMaxTasks?: number;
        jsbDownloaderTimeout?: number;
        projectBundles: string[];
        downloadMaxConcurrency?: number;
    };
    plugins: {
        jsList: string[];
    };
    scripting: {
        scriptPackages?: string[];
    };
    launch: {
        launchScene: string;
    };
    screen: {
        frameRate?: number;
        exactFitScreen: boolean;
        orientation?: IOrientation;
        designResolution: ISettingsDesignResolution;
    };
    splashScreen?: ISplashSetting;
    animation: {
        customJointTextureLayouts?: ICustomJointTextureLayout[];
    };
    profiling?: {
        showFPS: boolean;
    };
}

export declare interface ISettingsDesignResolution {
    width: number;
    height: number;
    policy: number;
}

export declare type IsExternal = (
	source: string,
	importer: string | undefined,
	isResolved: boolean
) => boolean;

export declare interface ISignatureConfig {
    md5: string;
    path: string;
}

export declare type ISortType = 'taskName' | 'createTime' | 'platform' | 'buildTime';

export declare interface ISplashBackgroundColor {
    x: number;
    y: number;
    z: number;
    w: number;
}

export declare interface ISplashSetting {
    displayRatio: number;
    totalTime: number;
    watermarkLocation: 'default' | 'topLeft' | 'topRight' | 'topCenter' | 'bottomLeft' | 'bottomCenter' | 'bottomRight';
    autoFit: boolean;

    logo?: {
        type: 'default' | 'none' | 'custom';
        image?: string;
        base64?: string;
    }
    background?: {
        type: 'default' | 'color' | 'custom';
        color?: ISplashBackgroundColor;
        image?: string;
        base64?: string;
    }
}

export declare interface ISpriteFrameInfo {
    name: string;
    uuid: string;
    imageUuid: string;
    textureUuid: string;
    file: string;
    trim: any;
    rawWidth: number;
    rawHeight: number;
    width: number;
    height: number;
    originalPath: string;
    rotated: boolean;
    spriteFrame: any;
}

export declare type IsPureModule = (id: string) => boolean | null | void;

export declare interface IStageTaskItemJSON extends ITaskItemJSON {
    stage: string;
    options: IBuildStageOptions;
    type: 'build-stage';
}

export declare interface IStorePackInfo {
    sharpMd5: string;
    md5: string;
    versionDev: string;
    result?: IPackResult;
}

export declare interface ISuffixMap {
    native: Record<string, string[]>;
    import: Record<string, string[]>;
}

export declare type ISupportCreateCCType =
| 'cc.AnimationClip'        // 动画剪辑
| 'cc.Script'               // 脚本（TypeScript/JavaScript）
| 'cc.SpriteAtlas'          // 精灵图集（自动图集）
| 'cc.EffectAsset'          // 着色器效果
| 'cc.SceneAsset'           // 场景
| 'cc.Prefab'               // 预制体
| 'cc.Material'             // 材质
| 'cc.TextureCube'          // 立方体贴图
| 'cc.TerrainAsset'         // 地形
| 'cc.PhysicsMaterial'      // 物理材质
| 'cc.LabelAtlas'           // 标签图集
| 'cc.RenderTexture'        // 渲染纹理
| 'cc.AnimationGraph'       // 动画图
| 'cc.AnimationMask'        // 动画遮罩
| 'cc.AnimationGraphVariant';

/** 支持创建的资源类型（从常量数组派生） */
export declare type ISupportCreateType = typeof SUPPORT_CREATE_TYPES[number];

export declare interface ISupportFormat {
    rgb: ITextureCompressType[];
    rgba: ITextureCompressType[];
}

export declare interface ITaskItemJSON {
    id: string;
    progress: number;
    state: ITaskState;
    message: string;
    detailMessage?: string;
    time: string;
}

export declare interface ITaskResultMap {
    'build-task/script'?: {
        projectJs: string;
        systemJs: string;
        polyfillsJs: string | null;
    };
    'build-task/pac'?: IBuildPacResult;
}

export declare interface ITaskResultMap_2 {
    'build-task/script'?: {
        projectJs: string;
        systemJs: string;
        polyfillsJs: string | null;
    };
    'build-task/pac'?: IBuildPacResult_2;
}

export declare type ITaskState = 'waiting' | 'success' | 'failure' | 'cancel' | 'processing' | 'none';

export declare interface ITextureCompressConfig {
    name: string;
    textureCompressConfig: PlatformCompressConfig;
}

export declare interface ITextureCompressConfigs {
    userPreset: Record<string, ICompressPresetConfig>;
    genMipmaps: boolean;
    customConfigs: Record<string, ICompressPresetConfig>;
}

export declare type ITextureCompressFormatType = 'pvr' | 'jpg' | 'png' | 'etc' | 'astc' | 'webp';

export declare type ITextureCompressPlatform = 'miniGame' | 'web' | 'ios' | 'android' | 'harmonyos-next';

export declare type ITextureCompressType = 'jpg' | 'png' | 'webp' | 'pvrtc_4bits_rgb' | 'pvrtc_4bits_rgba' | 'pvrtc_4bits_rgb_a' | 'pvrtc_2bits_rgb' | 'pvrtc_2bits_rgba' | 'pvrtc_2bits_rgb_a' | 'etc1_rgb' | 'etc1_rgb_a' | 'etc2_rgb' | 'etc2_rgba' | 'astc_4x4' | 'astc_5x5' | 'astc_6x6' | 'astc_8x8' | 'astc_10x5' | 'astc_10x10' | 'astc_12x12' | string;

export declare interface ITextureFormatConfig {
    displayName: string;
    options: IDisplayOptions;
    formats: ITextureFormatInfo[];
    suffix: string;
    parallelism: boolean;
    childProcess?: boolean;
}

export declare interface ITextureFormatInfo {
    displayName: string;
    value: ITextureCompressType | string;
    formatSuffix?: string;
    alpha?: boolean;
    formatType?: ITextureCompressFormatType;
    handler?: IHandlerInfo;
    custom?: boolean;
    params?: string[];
}

export declare interface ITransformOptions {
    importMapFormat: IModules;
    plugins?: BabelPluginItem[];
    loose?: boolean;
}

export declare type ITransformTarget = string | string[] | Record<string, string>;

export declare interface ITreeShakeConfig {
    noSideEffectFiles: string[];
}

export declare interface ITrimInfo {
    width: number;
    height: number;
}

export declare interface IUpdateInfo {
    type: IUpdateType;
    uuid: string;
}

export declare type IUpdateType = 'asset-change' | 'asset-add' | 'asset-delete';

export declare type IUrl = string;

export declare type IUuidDependMap = Record<UUID, UUID[]>;

export declare interface IVec3Like {
    x: number;
    y: number;
    z: number;
}

export declare interface IVec3Like_2 {
    x: number;
    y: number;
    z: number;
}

export declare type IVerificationFunc = (val: any, ...arg: any[]) => boolean | Promise<boolean>;

export declare interface IVerificationRule {
    func: IVerificationFunc;
    message: string;
}

export declare type IVerificationRuleMap = Record<string, IVerificationRule>;

export declare interface IVersionMap {
    import: Record<UUID, string>;
    native: Record<UUID, string>;
}

/** glTF 虚拟子资源的通用 userData */
export declare interface IVirtualAssetUserData {
    /** 在 glTF 文件中的索引 */
    gltfIndex?: number;
    /** mesh 资源的面数 */
    triangleCount?: number;
    /** mesh 所在 lod 层级 */
    lodLevel?: number;
    /** 根据 lod 配置自动生成 */
    lodOptions?: {
        /** 自动生成的 mesh 占原 mesh 的百分比 */
        faceCount: number;
    };
    [key: string]: any;
}

/** JavaScript 资源的 userData */
export declare type JavaScriptAssetUserData = ScriptModuleUserData | PluginScriptUserData;

/** JSON 资源的 userData */
export declare interface JsonAssetUserData {
    /** 是否启用 JSON5 解析 */
    json5?: boolean;
}

export declare interface KerningDict {
    [key: number]: number;
}

/** 标签图集资源的 userData */
export declare interface LabelAtlasAssetUserData {
    itemWidth: number;
    itemHeight: number;
    startChar: string;
    fontSize: number;
    spriteFrameUuid: string;
    _fntConfig: FntData;
}

export declare type LoadHook = (this: PluginContext, id: string) => LoadResult;

export declare type LoadResult = SourceDescription | string | null | void;

export declare interface LODsOption {
    // 屏占比
    screenRatio: number;
    // 和 lod0 的减面比
    faceCount: number;
}

export declare const enum LogLevel {
    NONE = 0,
    Error = 1,
    WARN = 2,
    LOG = 3,
    DEBUG = 4
}

export declare type MacroItem = {
    key: string;
    value: boolean;
}

export declare function make(platform: Platform, dest: string): Promise<IBuildResultData>;

export declare type MakeAsync<Fn> = Fn extends (this: infer This, ...args: infer Args) => infer Return
	? (this: This, ...args: Args) => Return | Promise<Return>
	: never;

export declare type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export declare type ManualChunksOption = { [chunkAlias: string]: string[] } | GetManualChunk;

export declare interface Md5GlobbyPathInfo {
    base: string;
    pattern: string;
}

export declare interface MergedRollupOptions extends InputOptions {
    	output: OutputOptions[];
}

export declare interface MeshClusterOptions {
    enable: boolean;
    coneCluster?: boolean;
}

export declare interface MeshCompressOptions {
    enable: boolean;
    encode?: boolean;
    compress?: boolean;
    quantize?: boolean;
}

export declare interface MeshOptimizeOptions {
    enable: boolean;
    vertexCache?: boolean;
    vertexFetch?: boolean;
    overdraw?: boolean;
}

export declare interface MeshOptimizerOption {
    // 是否启用此功能
    enable: boolean;
    // 减面算法，默认 simplify
    algorithm?: 'gltfpack' | 'simplify';
    simplifyOptions?: SimplifyOptions;
    // 已废弃，仅做简单记录
    gltfpackOptions?: GltfpackOptions;
}

export declare interface MeshSimplifyOptions {
    enable: boolean;
    targetRatio?: number;
    autoErrorRate?: boolean;
    errorRate?: number;
    lockBoundary?: boolean;
}

export declare interface Meta {
    ver: string;
    importer: string;
    imported: boolean;
    uuid: string;
    files: string[];
    subMetas: {
        [index: string]: Meta;
    };
    userData: {
        [index: string]: any;
    };
    displayName: string;
    id: string;
    name: string;
}

export declare interface MetaInfo {
    json: Meta;
    backup: string;
    EOL: '\n' | '\r\n';
}

export declare class MetaManager {
    path2meta: {
        [index: string]: MetaInfo;
    };
    private console;
    constructor(customConsole: CustomConsole);
    /**
     * 销毁一个管理器实例
     * @param manager
     */
    destroy(): void;
    /**
     * 从硬盘读取更新一个 meta 文件数据到内存里
     * @param path
     */
    read(path: string): boolean | undefined;
    write(path: any): false | undefined;
    /**
     * 删除内存中的一个 MetaInfo 数据
     * 并放入 backup 文件夹
     * @param path
     */
    remove(path: string): void;
    /**
     * 从缓存里取一个 MetaInfo
     * 如果不存在，则取备份数据
     * 如果还不存在，则生成新的空 MetaInfo 和 meta 文件
     * @param path
     */
    get(path: string): MetaInfo;
    move(pathA: string, pathB: string): void;
}

export declare enum MinigamePlatform {
    WECHAT = 0,
    WECHAT_MINI_PROGRAM = 1,
    BYTEDANCE = 3,
    ALIPAY = 5,
    TAOBAO = 6,
    TAOBAO_MINIGAME = 7,
    OPPO = 8,
    VIVO = 9,
    HUAWEI = 10,
    HONOR = 15,
    COCOS_RUNTIME = 16,
    SUD = 17,
    SUDV2 = 18,
}

export declare interface MinimalPluginContext {
    	meta: PluginContextMeta;
}

export declare interface MissingAssetInfo {
    path: string;
    time: number;
    removeTime: number;
}

export declare type ModuleFormat = InternalModuleFormat | 'commonjs' | 'esm' | 'module' | 'systemjs';

export declare interface ModuleInfo extends ModuleOptions {
    	ast: AcornNode | null;
    	code: string | null;
    	dynamicImporters: readonly string[];
    	dynamicallyImportedIdResolutions: readonly ResolvedId[];
    	dynamicallyImportedIds: readonly string[];
    	hasDefaultExport: boolean | null;
    	/** @deprecated Use `moduleSideEffects` instead */
    	hasModuleSideEffects: boolean | 'no-treeshake';
    	id: string;
    	implicitlyLoadedAfterOneOf: readonly string[];
    	implicitlyLoadedBefore: readonly string[];
    	importedIdResolutions: readonly ResolvedId[];
    	importedIds: readonly string[];
    	importers: readonly string[];
    	isEntry: boolean;
    	isExternal: boolean;
    	isIncluded: boolean | null;
}

export declare interface ModuleJSON extends TransformModuleJSON, ModuleOptions {
    	ast: AcornNode;
    	dependencies: string[];
    	id: string;
    	resolvedIds: ResolvedIdMap;
    	transformFiles: EmittedFile[] | undefined;
}

export declare interface ModuleOptions {
    	meta: CustomPluginOptions;
    	moduleSideEffects: boolean | 'no-treeshake';
    	syntheticNamedExports: boolean | string;
}

export declare type ModuleParsedHook = (this: PluginContext, info: ModuleInfo) => void;

/**
 * 模块保留选项。
 * - 'erase' 擦除模块信息。生成的代码中将不会保留模块信息。
 * - 'preserve' 保留原始模块信息。生成的文件将和原始模块文件结构一致。
 * - 'facade' 保留原始模块信息，将所有模块转化为一个 SystemJS 模块，但这些模块都打包在一个单独的 IIFE bundle 模块中。
 *   当这个 bundle 模块执行时，所有模块都会被注册。
 *   当你希望代码中仍旧使用模块化的特性（如动态导入、import.meta.url），但又不希望模块零散在多个文件时可以使用这个选项。
 */
export declare type ModulePreservation = 'erase' | 'preserve' | 'facade';

export declare type ModuleSideEffectsOption = boolean | 'no-external' | string[] | HasModuleSideEffects;

export declare interface nativeOptions {
    template: string;
    engine?: string;
    runAfterMake: boolean;
    encrypted: boolean;
    compressZip: boolean;
    xxteaKey?: string;
    params?: CocosParams<Object>;
    JobSystem: 'none' | 'tbb' | 'taskFlow';
    serverMode: boolean;
    netMode: NetMode;
    hotModuleReload: boolean;
    projectDistPath: string;
    cocosParams: CocosParams<any>;
    buildScriptParam: ICustomBuildScriptParam;
}

export declare enum NativePlatform {
    NATIVE_EDITOR = 0,
    ANDROID = 1,
    WINDOWS = 2,
    IOS = 3,
    MAC = 4,
    OHOS = 5,
    OPEN_HARMONY = 6,
    LINUX = 7,
}

export declare enum NetMode {
    client = 0,
    hostServer = 1,
    listenServer = 2
}

export declare enum NormalImportSetting {
    /**
     * 如果模型文件中包含法线信息则导出法线，否则不导出法线。
     */
    optional = 0,
    /**
     * 不在导出的网格中包含法线信息。
     */
    exclude = 1,
    /**
     * 如果模型文件中包含法线信息则导出法线，否则重新计算并导出法线。
     */
    require = 2,
    /**
     * 不管模型文件中是否包含法线信息，直接重新计算并导出法线。
     */
    recalculate = 3
}

export declare type NormalizedAmdOptions = (
	| {
    			autoId: false;
    			id?: string;
    	  }
	| {
    			autoId: true;
    			basePath: string;
    	  }
) & {
    	define: string;
    	forceJsExtensionForImports: boolean;
};

export declare interface NormalizedGeneratedCodeOptions {
    	arrowFunctions: boolean;
    	constBindings: boolean;
    	objectShorthand: boolean;
    	reservedNamesAsProps: boolean;
    	symbols: boolean;
}

export declare interface NormalizedInputOptions {
    	acorn: Record<string, unknown>;
    	acornInjectPlugins: (() => unknown)[];
    	cache: false | undefined | RollupCache;
    	context: string;
    	experimentalCacheExpiry: number;
    	external: IsExternal;
    	/** @deprecated Use the "inlineDynamicImports" output option instead. */
    	inlineDynamicImports: boolean | undefined;
    	input: string[] | { [entryAlias: string]: string };
    	makeAbsoluteExternalsRelative: boolean | 'ifRelativeSource';
    	/** @deprecated Use the "manualChunks" output option instead. */
    	manualChunks: ManualChunksOption | undefined;
    	maxParallelFileOps: number;
    	/** @deprecated Use the "maxParallelFileOps" option instead. */
    	maxParallelFileReads: number;
    	moduleContext: (id: string) => string;
    	onwarn: WarningHandler;
    	perf: boolean;
    	plugins: Plugin_2[];
    	preserveEntrySignatures: PreserveEntrySignaturesOption;
    	/** @deprecated Use the "preserveModules" output option instead. */
    	preserveModules: boolean | undefined;
    	preserveSymlinks: boolean;
    	shimMissingExports: boolean;
    	strictDeprecations: boolean;
    	treeshake: false | NormalizedTreeshakingOptions;
}

export declare interface NormalizedOutputOptions {
    	amd: NormalizedAmdOptions;
    	assetFileNames: string | ((chunkInfo: PreRenderedAsset) => string);
    	banner: () => string | Promise<string>;
    	chunkFileNames: string | ((chunkInfo: PreRenderedChunk) => string);
    	compact: boolean;
    	dir: string | undefined;
    	/** @deprecated Use the "renderDynamicImport" plugin hook instead. */
    	dynamicImportFunction: string | undefined;
    	entryFileNames: string | ((chunkInfo: PreRenderedChunk) => string);
    	esModule: boolean;
    	exports: 'default' | 'named' | 'none' | 'auto';
    	extend: boolean;
    	externalLiveBindings: boolean;
    	file: string | undefined;
    	footer: () => string | Promise<string>;
    	format: InternalModuleFormat;
    	freeze: boolean;
    	generatedCode: NormalizedGeneratedCodeOptions;
    	globals: GlobalsOption;
    	hoistTransitiveImports: boolean;
    	indent: true | string;
    	inlineDynamicImports: boolean;
    	interop: GetInterop;
    	intro: () => string | Promise<string>;
    	manualChunks: ManualChunksOption;
    	minifyInternalExports: boolean;
    	name: string | undefined;
    	namespaceToStringTag: boolean;
    	noConflict: boolean;
    	outro: () => string | Promise<string>;
    	paths: OptionsPaths;
    	plugins: OutputPlugin[];
    	/** @deprecated Use the "renderDynamicImport" plugin hook instead. */
    	preferConst: boolean;
    	preserveModules: boolean;
    	preserveModulesRoot: string | undefined;
    	sanitizeFileName: (fileName: string) => string;
    	sourcemap: boolean | 'inline' | 'hidden';
    	sourcemapBaseUrl: string | undefined;
    	sourcemapExcludeSources: boolean;
    	sourcemapFile: string | undefined;
    	sourcemapPathTransform: SourcemapPathTransformOption | undefined;
    	strict: boolean;
    	systemNullSetters: boolean;
    	validate: boolean;
}

export declare interface NormalizedTreeshakingOptions {
    	annotations: boolean;
    	correctVarValueBeforeDeclaration: boolean;
    	moduleSideEffects: HasModuleSideEffects;
    	propertyReadSideEffects: boolean | 'always';
    	tryCatchDeoptimization: boolean;
    	unknownGlobalSideEffects: boolean;
}

export declare type ObjectHook<T, O = {}> = T | ({ handler: T; order?: 'pre' | 'post' | null } & O);

export declare type OptionsPaths = Record<string, string> | ((id: string) => string);

export declare interface OutputAsset extends PreRenderedAsset {
    	fileName: string;
    	/** @deprecated Accessing "isAsset" on files in the bundle is deprecated, please use "type === \'asset\'" instead */
    	isAsset: true;
}

export declare interface OutputBundle {
    	[fileName: string]: OutputAsset | OutputChunk;
}

export declare interface OutputChunk extends RenderedChunk {
    	code: string;
}

export declare interface OutputOptions {
    	amd?: AmdOptions;
    	assetFileNames?: string | ((chunkInfo: PreRenderedAsset) => string);
    	banner?: string | (() => string | Promise<string>);
    	chunkFileNames?: string | ((chunkInfo: PreRenderedChunk) => string);
    	compact?: boolean;
    	// only required for bundle.write
    	dir?: string;
    	/** @deprecated Use the "renderDynamicImport" plugin hook instead. */
    	dynamicImportFunction?: string;
    	entryFileNames?: string | ((chunkInfo: PreRenderedChunk) => string);
    	esModule?: boolean;
    	exports?: 'default' | 'named' | 'none' | 'auto';
    	extend?: boolean;
    	externalLiveBindings?: boolean;
    	// only required for bundle.write
    	file?: string;
    	footer?: string | (() => string | Promise<string>);
    	format?: ModuleFormat;
    	freeze?: boolean;
    	generatedCode?: GeneratedCodePreset | GeneratedCodeOptions;
    	globals?: GlobalsOption;
    	hoistTransitiveImports?: boolean;
    	indent?: string | boolean;
    	inlineDynamicImports?: boolean;
    	interop?: InteropType | GetInterop;
    	intro?: string | (() => string | Promise<string>);
    	manualChunks?: ManualChunksOption;
    	minifyInternalExports?: boolean;
    	name?: string;
    	/** @deprecated Use "generatedCode.symbols" instead. */
    	namespaceToStringTag?: boolean;
    	noConflict?: boolean;
    	outro?: string | (() => string | Promise<string>);
    	paths?: OptionsPaths;
    	plugins?: (OutputPlugin | null | false | undefined)[];
    	/** @deprecated Use "generatedCode.constBindings" instead. */
    	preferConst?: boolean;
    	preserveModules?: boolean;
    	preserveModulesRoot?: string;
    	sanitizeFileName?: boolean | ((fileName: string) => string);
    	sourcemap?: boolean | 'inline' | 'hidden';
    	sourcemapBaseUrl?: string;
    	sourcemapExcludeSources?: boolean;
    	sourcemapFile?: string;
    	sourcemapPathTransform?: SourcemapPathTransformOption;
    	strict?: boolean;
    	systemNullSetters?: boolean;
    	validate?: boolean;
}

export declare interface OutputPlugin
	extends Partial<{ [K in OutputPluginHooks]: PluginHooks[K] }>,
		Partial<{ [K in AddonHooks]: ObjectHook<AddonHook> }> {
    	cacheKey?: string;
    	name: string;
}

export declare type OutputPluginHooks =
	| 'augmentChunkHash'
	| 'generateBundle'
	| 'outputOptions'
	| 'renderChunk'
	| 'renderDynamicImport'
	| 'renderError'
	| 'renderStart'
	| 'resolveAssetUrl'
	| 'resolveFileUrl'
	| 'resolveImportMeta'
	| 'writeBundle';

export declare type OverwriteCommonOption = 'buildPath' | 'server' | 'polyfills' | 'mainBundleIsRemote' | 'name' | 'sourceMaps' | 'experimentalEraseModules' | 'buildStageGroup';

export declare interface OverwriteProjectSettings extends IEngineConfig {
    engineInfo: EngineInfo;
}

/**
 * 一个图集信息
 */
export declare class PacInfo implements IPacInfo {
    spriteFrameInfos: SpriteFrameInfo[];
    spriteFrames: SpriteFrame[];
    relativePath: string;
    relativeDir: string;
    path: string;
    uuid: string;
    imagePath: string;
    imageUuid: string;
    textureUuid: string;
    name: string;
    width: number;
    height: number;
    dirty: boolean;
    packOptions: IPackOptions;
    storeInfo: PacStoreInfo;
    result?: IPackResult;
    constructor(pacAsset: IAsset, options?: Partial<IPackOptions>);
    initSpriteFramesWithRange(includeAssets?: string[]): Promise<this>;
    /**
     * @param {Object} pacAssetInfo 从 db 中获取出来的 pac 信息
     */
    initSpriteFrames(spriteFrameAssets: (IAsset)[]): Promise<this>;
    private queryInvalidSpriteAssets;
    toJSON(): void;
}

export declare interface PacStoreInfo {
    pac: StoreInfo;
    sprites: ISpriteFrameInfo[];
    atlas?: {
        sprits: string[];
        imagePath: string[];
    }[];
    options: IPackOptions;
}

export declare type ParallelPluginHooks = Exclude<
	keyof FunctionPluginHooks | AddonHooks,
	FirstPluginHooks | SequentialPluginHooks
>;

/**
 * 瀑布流任务队列
 */
export declare class ParallelQueue<TaskObject, ReturnValue> {
    private _thread;
    private _waitQueue;
    private _execQueue;
    private _incrementalID;
    private _generate;
    private _staging;
    private _execID;
    private _execThread;
    _waitPromise?: Promise<any>;
    _waitResolve?: Function;
    constructor(generate: (param: TaskObject) => Promise<ReturnValue>, thread: number);
    private _startLock;
    private _stopFlag;
    start(): void;
    stop(): void;
    private _step;
    /**
     * 添加一个任务数据
     * @param taskObj
     */
    addTask(taskObj: TaskObject): number;
    /**
     * 删除一个任务数据
     * @param id
     */
    removeTask(id: number): boolean;
    /**
     * 等待执行完毕
     */
    waitQueue(): Promise<any>;
    /**
     * 当前队列的导入资源总数
     */
    total(): number;
    size(): number;
    /**
     * 是否正在导入
     */
    busy(): boolean;
    /**
     * 清空队列，还原为初始状态
     */
    clear(): boolean;
    /**
     * 暂停一个导入任务，释放 thread，直接开始其他导入任务
     * @param id
     */
    pause(id: number): void;
    /**
     * 恢复一个导入任务，会重新占用一个 thread
     * @param id
     */
    resume(id: number): void;
}

export declare type PartialNull<T> = {
    	[P in keyof T]: T[P] | null;
};

export declare interface PartialResolvedId extends Partial<PartialNull<ModuleOptions>> {
    	external?: boolean | 'absolute' | 'relative';
    	id: string;
}

/** 粒子资源的 userData */
export declare interface ParticleAssetUserData {
    totalParticles: number;
    life: number;
    lifeVar: number;
    emissionRate: number;
    duration: number;
    srcBlendFactor: number;
    dstBlendFactor: number;
    startColor: any;
    startColorVar: any;
    endColor: any;
    endColorVar: any;
    startSize: number;
    startSizeVar: number;
    endSize: number;
    endSizeVar: number;
    positionType: number;
    sourcePos: any;
    posVar: any;
    angle: number;
    angleVar: number;
    startSpin: number;
    startSpinVar: number;
    endSpin: number;
    endSpinVar: number;
    emitterMode: number;
    gravity: any;
    speed: number;
    speedVar: number;
    radialAccel: number;
    radialAccelVar: number;
    tangentialAccel: number;
    tangentialAccelVar: number;
    rotationIsDir: boolean;
    startRadius: number;
    startRadiusVar: number;
    endRadius: number;
    endRadiusVar: number;
    rotatePerS: number;
    rotatePerSVar: number;
    spriteFrameUuid: string;
}

export declare type Physics = 'cannon' | 'ammo' | 'builtin';

export declare type Platform = InternalPlatform | string;

export declare interface PlatformBundleConfig {
    platformName: string;
    platformType: BundlePlatformType;
    supportOptions: Record<string, any[]>;
}

export declare interface PlatformCompressConfig {
    platformType: ITextureCompressPlatform;
    support: ISupportFormat;
}

export declare interface PlatformPackageOptionMap {
    'web-desktop': webDesktopOptions;
    'web-mobile': webMobileOptions;
    'windows': windowsOptions;
    'mac': nativeOptions;
    'ios': nativeOptions;
    'android': nativeOptions;
    [platform: string]: any;
}

export declare interface PlatformPackageOptions {
    [packageName: string]: Record<string, any>;
}

export declare type PlatformType = Uppercase<keyof typeof WebPlatform | keyof typeof MinigamePlatform | keyof typeof NativePlatform> | 'HTML5' | 'NATIVE' | 'NODEJS' | 'INVALID_PLATFORM';

export declare type PlatformType_2 = StatsQuery.ConstantManager.PlatformType;

export declare interface PlatformTypeInfo {
    icon: string;
    displayName: string;
}

export declare interface Plugin_2 extends OutputPlugin, Partial<PluginHooks> {
    	// for inter-plugin communication
    	api?: any;
}

export declare interface PluginCache {
    	delete(id: string): boolean;
    	get<T = any>(id: string): T;
    	has(id: string): boolean;
    	set<T = any>(id: string, value: T): void;
}

export declare interface PluginContext extends MinimalPluginContext {
    	addWatchFile: (id: string) => void;
    	cache: PluginCache;
    	/** @deprecated Use `this.emitFile` instead */
    	emitAsset: EmitAsset;
    	/** @deprecated Use `this.emitFile` instead */
    	emitChunk: EmitChunk;
    	emitFile: EmitFile;
    	error: (err: RollupError | string, pos?: number | { column: number; line: number }) => never;
    	/** @deprecated Use `this.getFileName` instead */
    	getAssetFileName: (assetReferenceId: string) => string;
    	/** @deprecated Use `this.getFileName` instead */
    	getChunkFileName: (chunkReferenceId: string) => string;
    	getFileName: (fileReferenceId: string) => string;
    	getModuleIds: () => IterableIterator<string>;
    	getModuleInfo: GetModuleInfo;
    	getWatchFiles: () => string[];
    	/** @deprecated Use `this.resolve` instead */
    	isExternal: IsExternal;
    	load: (
    		options: { id: string; resolveDependencies?: boolean } & Partial<PartialNull<ModuleOptions>>
    	) => Promise<ModuleInfo>;
    	/** @deprecated Use `this.getModuleIds` instead */
    	moduleIds: IterableIterator<string>;
    	parse: (input: string, options?: any) => AcornNode;
    	resolve: (
    		source: string,
    		importer?: string,
    		options?: { custom?: CustomPluginOptions; isEntry?: boolean; skipSelf?: boolean }
    	) => Promise<ResolvedId | null>;
    	/** @deprecated Use `this.resolve` instead */
    	resolveId: (source: string, importer?: string) => Promise<string | null>;
    	setAssetSource: (assetReferenceId: string, source: string | Uint8Array) => void;
    	warn: (warning: RollupWarning | string, pos?: number | { column: number; line: number }) => void;
}

export declare interface PluginContextMeta {
    	rollupVersion: string;
    	watchMode: boolean;
}

export declare type PluginHooks = {
    	[K in keyof FunctionPluginHooks]: ObjectHook<
    		K extends AsyncPluginHooks ? MakeAsync<FunctionPluginHooks[K]> : FunctionPluginHooks[K],
    		K extends ParallelPluginHooks ? { sequential?: boolean } : {}
    	>;
};

/**
 * use this type for plugin annotation
 * @example
 * ```ts
 * interface Options {
 * ...
 * }
 * const myPlugin: PluginImpl<Options> = (options = {}) => { ... }
 * ```
 */
export declare type PluginImpl<O extends object = object> = (options?: O) => Plugin_2;

export declare class PluginManager extends EventEmitter {
    bundleConfigs: Record<string, PlatformBundleConfig>;
    commonOptionConfig: Record<string, Record<string, IBuilderConfigItem & {
        verifyKey: string;
    }>>;
    pkgOptionConfigs: Record<string, Record<string, IDisplayOptions>>;
    platformConfig: Record<string, IPlatformConfig>;
    buildTemplateConfigMap: Record<string, BuildTemplateConfig>;
    configMap: Record<string, Record<string, IInternalBuildPluginConfig>>;
    private builderPathsMap;
    private customBuildStagesMap;
    protected customBuildStages: Record<string, {
        [pkgName: string]: IBuildStageItem[];
    }>;
    private assetHandlers;
    protected readonly pkgPriorities: Record<string, number>;
    packageRegisterInfo: Map<string, InternalPackageInfo>;
    private platformRegisterInfoPool;
    constructor();
    init(): Promise<void>;
    registerAllPlatform(): Promise<void>;
    register(platform: string): Promise<void>;
    checkPlatform(platform: string): boolean;
    private registerPlatform;
    private internalRegister;
    _registerI18n(registerInfo: IBuilderRegisterInfo): void;
    getCommonOptionConfigs(platform: Platform): Record<string, IBuilderConfigItem>;
    getCommonOptionConfigByKey(key: keyof IBuildTaskOption, options: IBuildTaskOption): IBuilderConfigItem | null;
    getPackageOptionConfigByKey(key: string, pkgName: string, options: IBuildTaskOption): IBuilderConfigItem | null;
    getOptionConfigByKey(key: keyof IBuildTaskOption, options: IBuildTaskOption): IBuilderConfigItem | null;
    /**
     * 完整校验构建参数（校验平台插件相关的参数校验）
     * @param options
     */
    checkOptions(options: MakeRequired<IBuildCommandOption, 'platform' | 'mainBundleCompressionType'>): Promise<undefined | IBuildTaskOption>;
    checkCommonOptions(options: IBuildTaskOption): Promise<Record<string, BuildCheckResult>>;
    checkCommonOptionByKey(key: keyof IBuildTaskOption, value: any, options: IBuildTaskOption): Promise<BuildCheckResult>;
    /**
     * 校验构建插件注册的构建参数
     * @param options
     */
    private checkPluginOptions;
    shouldGenerateOptions(platform: Platform | string): boolean;
    /**
     * 获取平台默认值
     * @param platform
     */
    getOptionsByPlatform<P extends Platform | string>(platform: P): Promise<IBuildTaskOption>;
    getTexturePlatformConfigs(): Record<string, ITextureCompressConfig>;
    queryPlatformConfig(): {
        native: string[];
        config: Record<string, IPlatformConfig>;
    };
    /**
     * 获取带有钩子函数的构建阶段任务
     * @param platform
     * @returns
     */
    getBuildStageWithHookTasks(platform: Platform | string, taskName: string): IBuildStageItem | null;
    /**
     * 查询某个平台的阶段性任务按钮配置信息
     * @param platform
     */
    getBuildStageConfigByPlatform(platform: Platform): Record<string, any> | null;
    /**
     * 根据插件权重传参的插件数组
     * @param pkgNames
     * @returns
     */
    private sortPkgNameWidthPriority;
    /**
     * 获取平台插件的构建路径信息
     * @param platform
     */
    getHooksInfo(platform: Platform | string): IBuildHooksInfo;
    getBuildTemplateConfig(platform: string): BuildTemplateConfig;
    /**
     * 根据类型获取对应的执行方法
     * @param type
     * @returns
     */
    getAssetHandlers(type: ICustomAssetHandlerType): {
        pkgNameOrder: string[];
        handles: Record<string, Function>;
    };
}

export declare const pluginManager: PluginManager;

export declare interface PluginScriptInfo {
    /**
     * 脚本文件。
     */
    file: string;
    uuid: string;
}

/** JavaScript 插件脚本的 userData */
export declare interface PluginScriptUserData {
    isPlugin: true;
    /** 界面没有开放给用户。默认开启 */
    experimentalHideCommonJs?: boolean;
    /** 界面没有开放给用户。默认开启 */
    experimentalHideAmd?: boolean;
    /** 仅当 executionScope 为 enclosed 时有效。指定了要模拟的全局变量 */
    simulateGlobals?: string[];
    /** 执行作用域 */
    executionScope?: 'enclosed' | 'global';
    /** 插件执行时机 */
    loadPluginInEditor?: boolean;
    loadPluginInWeb?: boolean;
    loadPluginInMiniGame?: boolean;
    loadPluginInNative?: boolean;
}

/** 场景/预制体资源的 userData */
export declare interface PrefabAssetUserData {
    /** 是否为持久节点 */
    persistent?: boolean;
    /** 同步节点名称 */
    syncNodeName?: string;
}

export declare interface PreRenderedAsset {
    	name: string | undefined;
    	source: string | Uint8Array;
    	type: 'asset';
}

export declare interface PreRenderedChunk {
    	exports: string[];
    	facadeModuleId: string | null;
    	isDynamicEntry: boolean;
    	isEntry: boolean;
    	isImplicitEntry: boolean;
    	modules: {
        		[id: string]: RenderedModule;
        	};
    	name: string;
    	type: 'chunk';
}

export declare type PreserveEntrySignaturesOption = false | 'strict' | 'allow-extension' | 'exports-only';

export declare interface PreviewPackResult {
    atlasImagePaths: string[];
    unpackedImages: {
        imageUuid: string;
        libraryPath: string;
    }[];
    dirty: boolean;
    storeInfo: PacStoreInfo;
    atlases: IAtlasInfo[];
}

export declare type PureModulesOption = boolean | string[] | IsPureModule;

export declare function queryBuildConfig(): Promise<BuildConfiguration>;

export declare function queryDefaultBuildConfigByPlatform(platform: Platform): Promise<IBuildTaskOption<string>>;

export declare type RenderChunkHook = (
	this: PluginContext,
	code: string,
	chunk: RenderedChunk,
	options: NormalizedOutputOptions
) => { code: string; map?: SourceMapInput } | string | null | undefined;

export declare interface RenderedChunk extends PreRenderedChunk {
    	code?: string;
    	dynamicImports: string[];
    	fileName: string;
    	implicitlyLoadedBefore: string[];
    	importedBindings: {
        		[imported: string]: string[];
        	};
    	imports: string[];
    	map?: SourceMap;
    	referencedFiles: string[];
}

export declare interface RenderedModule {
    	code: string | null;
    	originalLength: number;
    	removedExports: string[];
    	renderedExports: string[];
    	renderedLength: number;
}

/** 渲染纹理资源的 userData */
export declare interface RenderTextureAssetUserData extends TextureBaseAssetUserData {
    width: number;
    height: number;
}

export declare type ResolveAssetUrlHook = (
	this: PluginContext,
	options: {
    		assetFileName: string;
    		chunkId: string;
    		format: InternalModuleFormat;
    		moduleId: string;
    		relativeAssetPath: string;
    	}
) => string | null | void;

export declare interface ResolvedId extends ModuleOptions {
    	external: boolean | 'absolute';
    	id: string;
}

export declare interface ResolvedIdMap {
    	[key: string]: ResolvedId;
}

export declare type ResolveDynamicImportHook = (
	this: PluginContext,
	specifier: string | AcornNode,
	importer: string
) => ResolveIdResult;

export declare type ResolveFileUrlHook = (
	this: PluginContext,
	options: {
    		assetReferenceId: string | null;
    		chunkId: string;
    		chunkReferenceId: string | null;
    		fileName: string;
    		format: InternalModuleFormat;
    		moduleId: string;
    		referenceId: string;
    		relativePath: string;
    	}
) => string | null | void;

export declare type ResolveIdHook = (
	this: PluginContext,
	source: string,
	importer: string | undefined,
	options: { custom?: CustomPluginOptions; isEntry: boolean }
) => ResolveIdResult;

export declare type ResolveIdResult = string | false | null | void | PartialResolvedId;

export declare type ResolveImportMetaHook = (
	this: PluginContext,
	prop: string | null,
	options: { chunkId: string; format: InternalModuleFormat; moduleId: string }
) => string | null | void;

declare namespace rollup {
    export {
        rollup_2 as rollup,
        watch,
        defineConfig,
        VERSION,
        RollupError,
        RollupWarning,
        RollupLogProps,
        SourceMapSegment,
        ExistingDecodedSourceMap,
        ExistingRawSourceMap,
        DecodedSourceMapOrMissing,
        SourceMap,
        SourceMapInput,
        PartialNull,
        ModuleOptions,
        SourceDescription,
        TransformModuleJSON,
        ModuleJSON,
        PluginCache,
        MinimalPluginContext,
        EmittedAsset,
        EmittedChunk,
        EmittedFile,
        EmitAsset,
        EmitChunk,
        EmitFile,
        ModuleInfo,
        GetModuleInfo,
        CustomPluginOptions,
        PluginContext,
        PluginContextMeta,
        ResolvedId,
        ResolvedIdMap,
        PartialResolvedId,
        ResolveIdResult,
        ResolveIdHook,
        ShouldTransformCachedModuleHook,
        IsExternal,
        IsPureModule,
        HasModuleSideEffects,
        LoadResult,
        LoadHook,
        TransformPluginContext,
        TransformResult,
        TransformHook,
        ModuleParsedHook,
        RenderChunkHook,
        ResolveDynamicImportHook,
        ResolveImportMetaHook,
        ResolveAssetUrlHook,
        ResolveFileUrlHook,
        AddonHookFunction,
        AddonHook,
        ChangeEvent,
        WatchChangeHook,
        PluginImpl,
        OutputBundle,
        FunctionPluginHooks,
        OutputPluginHooks,
        InputPluginHooks,
        SyncPluginHooks,
        AsyncPluginHooks,
        FirstPluginHooks,
        SequentialPluginHooks,
        ParallelPluginHooks,
        AddonHooks,
        MakeAsync,
        ObjectHook,
        PluginHooks,
        OutputPlugin,
        Plugin_2 as Plugin,
        TreeshakingPreset,
        NormalizedTreeshakingOptions,
        TreeshakingOptions,
        GetManualChunkApi,
        GetManualChunk,
        ExternalOption,
        PureModulesOption,
        GlobalsOption,
        InputOption,
        ManualChunksOption,
        ModuleSideEffectsOption,
        PreserveEntrySignaturesOption,
        SourcemapPathTransformOption,
        InputOptions,
        NormalizedInputOptions,
        InternalModuleFormat,
        ModuleFormat,
        GeneratedCodePreset,
        NormalizedGeneratedCodeOptions,
        GeneratedCodeOptions,
        OptionsPaths,
        InteropType,
        GetInterop,
        AmdOptions,
        NormalizedAmdOptions,
        OutputOptions,
        NormalizedOutputOptions,
        WarningHandlerWithDefault,
        WarningHandler,
        SerializedTimings,
        PreRenderedAsset,
        OutputAsset,
        RenderedModule,
        PreRenderedChunk,
        RenderedChunk,
        OutputChunk,
        SerializablePluginCache,
        RollupCache,
        RollupOutput,
        RollupBuild,
        RollupOptions,
        MergedRollupOptions,
        ChokidarOptions,
        RollupWatchHooks,
        WatcherOptions,
        RollupWatchOptions,
        TypedEventEmitter,
        RollupAwaitingEmitter,
        RollupWatcherEvent,
        RollupWatcher,
        AcornNode
    }
}

export declare function rollup_2(options: RollupOptions): Promise<RollupBuild>;

export declare interface RollupAwaitingEmitter<T extends { [event: string]: (...args: any) => any }>
	extends TypedEventEmitter<T> {
    	close(): Promise<void>;
    	emitAndAwait<K extends keyof T>(event: K, ...args: Parameters<T[K]>): Promise<ReturnType<T[K]>[]>;
    	/**
     	 * Registers an event listener that will be awaited before Rollup continues
     	 * for events emitted via emitAndAwait. All listeners will be awaited in
     	 * parallel while rejections are tracked via Promise.all.
     	 * Listeners are removed automatically when removeAwaited is called, which
     	 * happens automatically after each run.
     	 */
    	onCurrentAwaited<K extends keyof T>(
    		event: K,
    		listener: (...args: Parameters<T[K]>) => Promise<ReturnType<T[K]>>
    	): this;
    	removeAwaited(): this;
}

export declare interface RollupBuild {
    	cache: RollupCache | undefined;
    	close: () => Promise<void>;
    	closed: boolean;
    	generate: (outputOptions: OutputOptions) => Promise<RollupOutput>;
    	getTimings?: () => SerializedTimings;
    	watchFiles: string[];
    	write: (options: OutputOptions) => Promise<RollupOutput>;
}

export declare interface RollupCache {
    	modules: ModuleJSON[];
    	plugins?: Record<string, SerializablePluginCache>;
}

export declare interface RollupError extends RollupLogProps {
    	parserError?: Error;
    	stack?: string;
    	watchFiles?: string[];
}

export declare interface RollupLogProps {
    	code?: string;
    	frame?: string;
    	hook?: string;
    	id?: string;
    	loc?: {
        		column: number;
        		file?: string;
        		line: number;
        	};
    	message: string;
    	name?: string;
    	plugin?: string;
    	pluginCode?: string;
    	pos?: number;
    	url?: string;
}

export declare interface RollupOptions extends InputOptions {
    	// This is included for compatibility with config files but ignored by rollup.rollup
    	output?: OutputOptions | OutputOptions[];
}

export declare interface RollupOutput {
    	output: [OutputChunk, ...(OutputChunk | OutputAsset)[]];
}

export declare interface RollupWarning extends RollupLogProps {
    	chunkName?: string;
    	cycle?: string[];
    	exportName?: string;
    	exporter?: string;
    	guess?: string;
    	importer?: string;
    	missing?: string;
    	modules?: string[];
    	names?: string[];
    	reexporter?: string;
    	source?: string;
    	sources?: string[];
}

export declare type RollupWatcher = RollupAwaitingEmitter<{
    	change: (id: string, change: { event: ChangeEvent }) => void;
    	close: () => void;
    	event: (event: RollupWatcherEvent) => void;
    	restart: () => void;
}>;

export declare type RollupWatcherEvent =
	| { code: 'START' }
	| { code: 'BUNDLE_START'; input?: InputOption; output: readonly string[] }
	| {
    			code: 'BUNDLE_END';
    			duration: number;
    			input?: InputOption;
    			output: readonly string[];
    			result: RollupBuild;
    	  }
	| { code: 'END' }
	| { code: 'ERROR'; error: RollupError; result: RollupBuild | null };

export declare type RollupWatchHooks = 'onError' | 'onStart' | 'onBundleStart' | 'onBundleEnd' | 'onEnd';

export declare interface RollupWatchOptions extends InputOptions {
    	output?: OutputOptions | OutputOptions[];
    	watch?: WatcherOptions | false;
}

/** 渲染纹理精灵帧的 userData */
export declare interface RtSpriteFrameAssetUserData {
    /** 图片 UUID 或数据库 URI */
    imageUuidOrDatabaseUri: string;
    /** 宽度 */
    width?: number;
    /** 高度 */
    height?: number;
}

export declare function run(platform: Platform, dest: string): Promise<IBuildResultData>;

export declare interface ScriptAssetUserData {
    isPlugin?: boolean;
    isNative?: boolean;
    loadPluginInNative?: boolean;
    loadPluginInWeb?: boolean;
}

/**
 * 构建内置的脚本编译模块，后续会开放更多的接口，供平台使用
 */
export declare class ScriptBuilder {
    static outputImportMap(importMap: ImportMap, options: IImportMapOptions): Promise<void>;
}

export declare class ScriptBuilder_2 {
    _scriptOptions: IScriptOptions;
    _importMapOptions: ImportMapOptions;
    scriptPackages: string[];
    static projectOptions: IScriptProjectOption;
    initTaskOptions(options: IInternalBuildOptions | IInternalBundleBuildOptions): {
        scriptOptions: IScriptOptions;
        importMapOptions: {
            format: "esm" | "commonjs" | undefined;
            data: {
                imports: {};
            };
            output: string;
        };
    };
    initProjectOptions(options: IInternalBuildOptions | IInternalBundleBuildOptions): Promise<void>;
    buildBundleScript(bundles: IBundle[]): Promise<any>;
    static buildPolyfills(options: IPolyFills | undefined, dest: string): Promise<any>;
    static buildSystemJs(options: IBuildSystemJsOption): Promise<any>;
    static outputImportMap(importMap: ImportMap, options: IImportMapOptions): Promise<void>;
}

/** JavaScript 脚本模块的 userData */
export declare interface ScriptModuleUserData {
    isPlugin: false;
}

export declare type SequentialPluginHooks =
	| 'augmentChunkHash'
	| 'generateBundle'
	| 'options'
	| 'outputOptions'
	| 'renderChunk'
	| 'transform';

export declare interface SerializablePluginCache {
    	[key: string]: [number, any];
}

export declare interface SerializedAssetFinder {
    meshes?: Array<string | null>;
    animations?: Array<string | null>;
    skeletons?: Array<string | null>;
    textures?: Array<string | null>;
    materials?: Array<string | null>;
    scenes?: Array<string | null>;
}

export declare interface SerializedTimings {
    	[label: string]: [number, number, number];
}

export declare interface SharedSettings {
    useDefineForClassFields: boolean;
    allowDeclareFields: boolean;
    loose: boolean;
    guessCommonJsExports: boolean;
    exportsConditions: string[];
    preserveSymlinks: boolean;
    importMap?: {
        json: {
            imports?: Record<string, string>;
            scopes?: Record<string, Record<string, string>>;
        };
        url: string;
    };
}

export declare type ShouldTransformCachedModuleHook = (
	this: PluginContext,
	options: {
    		ast: AcornNode;
    		code: string;
    		id: string;
    		meta: CustomPluginOptions;
    		moduleSideEffects: boolean | 'no-treeshake';
    		resolvedSources: ResolvedIdMap;
    		syntheticNamedExports: boolean | string;
    	}
) => boolean;

export declare interface SimpleInfo {
    time: number;
    uuid?: string;
}

export declare interface SimplifyOptions {
    // 压缩比例
    targetRatio?: number;
    // 防止破面
    enableSmartLink?: boolean;
    // 误差距离
    agressiveness?: number;
    // 计算迭代次数
    maxIterationCount?: number;
}

export declare interface SourceDescription extends Partial<PartialNull<ModuleOptions>> {
    	ast?: AcornNode;
    	code: string;
    	map?: SourceMapInput;
}

export declare interface SourceMap {
    	file: string;
    	mappings: string;
    	names: string[];
    	sources: string[];
    	sourcesContent: string[];
    	version: number;
    	toString(): string;
    	toUrl(): string;
}

export declare type SourceMapInput = ExistingRawSourceMap | string | null | { mappings: '' };

export declare type SourcemapPathTransformOption = (
	relativeSourcePath: string,
	sourcemapPath: string
) => string;

export declare type SourceMapSegment =
	| [number]
	| [number, number, number, number]
	| [number, number, number, number, number];

/** Spine 资源的 userData */
export declare interface SpineAssetUserData {
    /** 图集资源的 UUID */
    atlasUuid: string;
}

/** 精灵图集资源的 userData */
export declare interface SpriteAtlasAssetUserData {
    /** 图集纹理名称 */
    atlasTextureName: string;
    /** 纹理 UUID */
    textureUuid: string | null;
    /** 精灵帧列表 */
    frames: SpriteFrameAssetUserData[];
    /** 资源 UUID */
    uuid: string;
    /** 格式版本 */
    format: number;
}

export declare interface SpriteFrameAssetUserData extends SpriteFrameBaseAssetUserData {
    isUuid?: boolean;
    imageUuidOrDatabaseUri: string;
}

export declare interface SpriteFrameBaseAssetUserData {
    trimType?: string;
    trimThreshold: number;
    rotated: boolean;
    offsetX: number;
    offsetY: number;
    trimX: number;
    trimY: number;
    width: number;
    height: number;
    rawWidth: number;
    rawHeight: number;
    borderTop: number;
    borderBottom: number;
    borderLeft: number;
    borderRight: number;
    packable?: boolean;
    pixelsToUnit: number;
    pivotX: number;
    pivotY: number;
    meshType: number;
    vertices: SpriteFrameVertices;
}

export declare class SpriteFrameInfo {
    name: string;
    uuid: string;
    imageUuid: string;
    textureUuid: string;
    spriteFrame: SpriteFrame;
    trim: {
        width: number;
        height: number;
        rotatedWidth: number;
        rotatedHeight: number;
        x: number;
        y: number;
    };
    rawWidth: number;
    rawHeight: number;
    width: number;
    height: number;
    originalPath: string;
    rotated: boolean;
    _file: string;
    _libraryPath: string;
    _pacUuid: string;
    private _mtime;
    constructor(spriteFrame: SpriteFrame, assetInfo: IAsset, options: IPackOptions);
    toJSON(): any;
}

export declare interface SpriteFrameVertices {
    rawPosition: number[];
    indexes: number[];
    uv: number[];
    nuv: number[];
    triangles?: number[];
    minPos: number[];
    maxPos: number[];
}

/**
 * Query any any stats of the engine.
 * @group Merged Types
 */
export declare class StatsQuery {
    /**
     * @param engine Path to the engine root.
     */
    static create(engine: string): Promise<StatsQuery>;
    /**
     * Constant manager for engine and user.
     */
    constantManager: StatsQuery.ConstantManager;
    /**
     * Gets the path to the engine root.
     */
    get path(): string;
    /**
     * Gets the path to tsconfig.
     */
    get tsConfigPath(): string;
    /**
     * Gets all optimzie decorators
     */
    getOptimizeDecorators(): ConfigInterface.IOptimizeDecorators;
    /**
     * Gets TreeShake config
     */
    getTreeShakeConfig(): ConfigInterface.ITreeShakeConfig | undefined;
    /**
     * Gets all features defined.
     */
    getFeatures(): string[];
    /**
     * Returns if the specified feature is defined.
     * @param feature Feature ID.
     */
    hasFeature(feature: string): boolean;
    /**
     * Gets all feature units included in specified features.
     * @param featureIds Feature ID.
     */
    getUnitsOfFeatures(featureIds: string[]): string[];
    getIntrinsicFlagsOfFeatures(featureIds: string[]): Record<string, number | boolean | string>;
    getOverriddenConstantsOfFeatures(featureIds: string[]): Record<string, number | boolean>;
    /**
     * Gets all feature units in their names.
     */
    getFeatureUnits(): string[];
    /**
     * Gets the path to source file of the feature unit.
     * @param moduleId Name of the feature unit.
     */
    getFeatureUnitFile(featureUnit: string): string;
    /**
     * Gets all editor public modules in their names.
     */
    getEditorPublicModules(): string[];
    /**
     * Gets the path to source file of the editor-public module.
     * @param moduleName Name of the public module.
     */
    getEditorPublicModuleFile(moduleName: string): string;
    /**
     * Gets the source of `'cc'`.
     * @param featureUnits Involved feature units.
     * @param mapper If exists, map the feature unit name into another module request.
     */
    evaluateIndexModuleSource(featureUnits: string[], mapper?: (featureUnit: string) => string): string;
    /**
     * Evaluates the source of `'internal-constants'`(`'cc/env'`),
     * @param context
     */
    evaluateEnvModuleSourceFromRecord(record: Record<string, unknown>): string;
    /**
     * Evaluates module overrides under specified context.
     * @param context
     */
    evaluateModuleOverrides(context: Context): Record<string, string>;
    private static _readModulesInDir;
    private static _baseNameToFeatureUnitName;
    private static _editorBaseNameToModuleName;
    private constructor();
    evalTest<T>(test: Test, context: Context): T;
    private _evalPathTemplate;
    private _initialize;
    private _engine;
    private _index;
    private _features;
    private _config;
    private _featureUnits;
    private _editorPublicModules;
}

/**
 * @group Merged Types
 */
declare namespace StatsQuery {
    namespace ConstantManager {
        type PlatformType = 'WEB_EDITOR' | 'WEB_MOBILE' | 'WEB_DESKTOP' | 'WECHAT' | 'WECHAT_MINI_PROGRAM' | 'BYTEDANCE' | 'ALIPAY' | 'TAOBAO' | 'TAOBAO_MINIGAME' | 'OPPO' | 'VIVO' | 'HUAWEI' | 'HONOR' | 'COCOS_RUNTIME' | 'SUD' | 'SUDV2' | 'NATIVE_EDITOR' | 'ANDROID' | 'WINDOWS' | 'IOS' | 'MAC' | 'OHOS' | 'OPEN_HARMONY' | 'LINUX' | 'HTML5' | 'NATIVE' | 'NODEJS' | 'INVALID_PLATFORM';
        type IPlatformConfig = { [key in PlatformType]: boolean };
        interface IInternalFlagConfig {
            SERVER_MODE: boolean;
            NOT_PACK_PHYSX_LIBS: boolean;
            WEBGPU: boolean;
            /**
             * Native code (wasm/asmjs) bundle mode, 0: asmjs, 1: wasm, 2: both
             * @default 2
             */
            NATIVE_CODE_BUNDLE_MODE: number;
            /**
             * An internal constant to indicate whether we cull the meshopt wasm module and asm.js module.
             *
             * @default false
             */
            CULL_MESHOPT: boolean;
            /**
             * An internal constant to indicate whether we use wasm assets as minigame subpackage.
             * This is useful when we need to reduce code size.
             */
            WASM_SUBPACKAGE: boolean;
            /**
             * An internal constant to indicate whether we're using 3D modules.
             */
            USE_3D: boolean;
            /**
             * An internal constant to indicate whether we're using ui skew module.
             */
            USE_UI_SKEW: boolean;
        }
        interface IPublicFlagConfig {
            DEBUG: boolean;
            NET_MODE: number;
        }
        interface IFlagConfig extends IInternalFlagConfig, IPublicFlagConfig {}
        interface IModeConfig {
            EDITOR: boolean;
            PREVIEW: boolean;
            BUILD: boolean;
            TEST: boolean;
        }
        interface IConstantOptions {
            platform: PlatformType;
            flagConfig: IFlagConfig;
        }
        type ModeType = keyof IModeConfig;
        type FlagType = keyof IFlagConfig;
        interface BuildTimeConstants extends IPlatformConfig, IFlagConfig, IModeConfig {}
        interface CCEnvConstants extends IPlatformConfig, IPublicFlagConfig, IModeConfig {}
        type ValueType = boolean | number;
        interface ConstantOptions {
            mode: ModeType;
            platform: PlatformType;
            flags: Partial<Record<FlagType, ValueType>>;
        }
    }
    class ConstantManager {
        private _engineRoot;
        private _ccConfigJsonStr;
        constructor(engineRoot: string);
        exportDynamicConstants(options: ConstantManager.ConstantOptions): string;
        genBuildTimeConstants(options: ConstantManager.ConstantOptions): ConstantManager.BuildTimeConstants;
        genCCEnvConstants(options: ConstantManager.ConstantOptions): ConstantManager.CCEnvConstants;
        private _exportConstants;
        exportStaticConstants(options: ConstantManager.ConstantOptions): string;
        genInternalConstants(): string;
        genCCEnv(): string;
        private _genConstantDeclaration;
        private _getConstantConfig;
        private _hasCCGlobal;
        private _hasDynamic;
        private _evalExpression;
        private _applyOptionsToConfig;
    }
}

export declare interface StoreInfo {
    uuid: string;
    mtime: number;
}

/** 支持创建的资源类型常量数组（用于 Zod enum 和 TypeScript type） */
export declare const SUPPORT_CREATE_TYPES: readonly ["animation-clip", "typescript", "auto-atlas", "effect", "scene", "prefab", "material", "terrain", "physics-material", "label-atlas", "render-texture", "directory", "effect-header"];

export declare type SyncPluginHooks =
	| 'augmentChunkHash'
	| 'outputOptions'
	| 'renderDynamicImport'
	| 'resolveAssetUrl'
	| 'resolveFileUrl'
	| 'resolveImportMeta';

export declare enum TangentImportSetting {
    /**
     * 不在导出的网格中包含正切信息。
     */
    exclude = 0,
    /**
     * 如果模型文件中包含正切信息则导出正切，否则不导出正切。
     */
    optional = 1,
    /**
     * 如果模型文件中包含正切信息则导出正切，否则若纹理坐标存在则重新计算并导出正切。
     */
    require = 2,
    /**
     * 不管模型文件中是否包含正切信息，直接重新计算并导出正切。
     */
    recalculate = 3
}

export declare const enum TaskAddResult {
    BUSY = 0,
    SUCCESS = 1,
    PARAM_ERROR = 2
}

export declare class TaskManager {
    private static readonly tasks;
    static readonly pluginTasks: Record<IPluginHookName, IPluginHookName>;
    private static buildTaskMap;
    activeTasks: Set<TaskType>;
    get taskWeight(): number;
    static getBuildTask(type: TaskType): any[];
    static getTaskHandleFromNames(taskNames: string[]): any[];
    static getCustomTaskName(name: string): string;
    activeTask(type: TaskType): any[];
    activeCustomTask(name: string, taskNames: string[]): any[];
}

export declare type TaskType = 'dataTasks' | 'settingTasks' | 'buildTasks' | 'md5Tasks' | 'postprocessTasks' | string;

export declare type Test = string;

export declare interface Texture2DAssetUserData extends TextureBaseAssetUserData {
    isUuid?: boolean;
    imageUuidOrDatabaseUri?: string;
}

export declare interface TextureBaseAssetUserData {
    wrapModeS: WrapMode;
    wrapModeT: WrapMode;
    minfilter: Filter;
    magfilter: Filter;
    mipfilter: Filter;
    anisotropy: number;
}

export declare interface TextureCompress {
    platform: string;
    init(): Promise<void>;
    updateUserConfig(): Promise<void>;
    addTask(assetInfo: IAssetInfo): IImageTaskInfo;
    run(): Promise<void>;
}

export declare class TextureCompress_2 extends EventEmitter_2 {
    _taskMap: Record<string, IImageTaskInfo>;
    platform: string;
    static overwriteFormats: Record<string, string>;
    static _presetIdToCompressOption: Record<string, Record<string, Record<string, number | string>>>;
    static allTextureCompressConfig: AllTextureCompressConfig;
    static userCompressConfig: UserCompressConfig;
    static compressCacheDir: string;
    static storedCompressInfo: Record<string, CompressCacheInfo>;
    static storedCompressInfoPath: string;
    static enableMipMaps: boolean;
    _waitingCompressQueue: Set<ICompressConfig>;
    _compressAssetLen: number;
    _compressExecuteInfo: CompressExecuteInfo | null;
    textureCompress: boolean;
    constructor(platform: string, textureCompress?: boolean);
    static initCommonOptions(): Promise<void>;
    init(): Promise<void>;
    /**
     * 更新缓存的纹理压缩项目配置
     */
    updateUserConfig(): Promise<void>;
    static queryTextureCompressCache(uuid: string): CompressCacheInfo;
    /**
     * 根据资源信息返回资源的纹理压缩任务，无压缩任务的返回 null
     * @param assetInfo
     * @returns IImageTaskInfo | null
     */
    addTask(uuid: string, task: IImageTaskInfo): IImageTaskInfo;
    /**
     * 根据 Image 信息添加资源的压缩任务
     * @param assetInfo （不支持自动图集）
     * @returns
     */
    addTaskWithAssetInfo(assetInfo: Asset | VirtualAsset): IImageTaskInfo | {
        src: string;
        presetId: any;
        compressOptions: Record<string, Record<string, string | number>>;
        hasAlpha: any;
        mtime: any;
        hasMipmaps: boolean;
        dest: never[];
        suffix: never[];
    } | undefined;
    /**
     * 根据图集或者 Image 资源信息返回资源的纹理压缩任务，无压缩任务的返回 null
     */
    genTaskInfoFromAssetInfo(assetInfo: Asset | VirtualAsset): IImageTaskInfo | {
        src: string;
        presetId: any;
        compressOptions: Record<string, Record<string, string | number>>;
        hasAlpha: any;
        mtime: any;
        hasMipmaps: boolean;
        dest: never[];
        suffix: never[];
    } | null | undefined;
    /**
     * 根据纹理压缩配置 id 获取对应的纹理压缩选项
     * @param presetId
     * @returns Record<string, number | string> | null
     */
    getCompressOptions(presetId: string): (Record<string, Record<string, number | string>>) | null;
    /**
     * 查询某个指定 uuid 资源的纹理压缩任务
     * @param uuid
     * @returns
     */
    queryTask(uuid: string): IImageTaskInfo;
    removeTask(uuid: string): void;
    /**
     * 执行所有纹理压缩任务，支持限定任务，否则将执行收集的所有纹理压缩任务
     */
    run(taskMap?: Record<string, IImageTaskInfo>): Promise<Record<string, IImageTaskInfo> | undefined>;
    /**
     * 筛选整理压缩任务中缓存失效的实际需要压缩的任务队列
     * @param taskMap
     * @returns
     */
    private sortImageTask;
    executeCompressQueue(): Promise<unknown> | undefined;
    _getNextTask(): ICompressConfig | null;
    _checkTaskCanExecute(taskConfig: ICompressConfig): boolean;
    _compressImage(config: ICompressConfig): Promise<void>;
    /**
     * 检查压缩任务是否已经完成，如未完成，则继续执行剩下的任务
     * @returns
     */
    _step(): Promise<any>;
    private customCompressImage;
    compressImageByConfig(optionItem: ICompressConfig): Promise<void>;
}

export declare interface TextureCubeAssetUserData extends TextureBaseAssetUserData {
    imageDatabaseUri?: string;
    isRGBE: boolean;

    mipBakeMode: number;
    /**
     * `0` 意味着默认。见 https://github.com/cocos-creator/3d-tasks/issues/2253
     */
    faceSize?: number;
    // 符号资源 uuid
    sign?: string;

    // 六个面的 UUID
    front?: string;
    back?: string;
    left?: string;
    right?: string;
    top?: string;
    bottom?: string;
}

export declare type TransformHook = (
	this: TransformPluginContext,
	code: string,
	id: string
) => TransformResult;

export declare interface TransformModuleJSON {
    	ast?: AcornNode;
    	code: string;
    	// note if plugins use new this.cache to opt-out auto transform cache
    	customTransformCache: boolean;
    	originalCode: string;
    	originalSourcemap: ExistingDecodedSourceMap | null;
    	sourcemapChain: DecodedSourceMapOrMissing[];
    	transformDependencies: string[];
}

export declare interface TransformOptions {
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

export declare interface TransformPluginContext extends PluginContext {
    	getCombinedSourcemap: () => SourceMap;
}

export declare type TransformResult = string | null | void | Partial<SourceDescription>;

export declare interface TreeshakingOptions
	extends Partial<Omit<NormalizedTreeshakingOptions, 'moduleSideEffects'>> {
    	moduleSideEffects?: ModuleSideEffectsOption;
    	preset?: TreeshakingPreset;
    	/** @deprecated Use `moduleSideEffects` instead */
    	pureExternalModules?: PureModulesOption;
}

export declare type TreeshakingPreset = 'smallest' | 'safest' | 'recommended';

export declare interface TypedEventEmitter<T extends { [event: string]: (...args: any) => any }> {
    	addListener<K extends keyof T>(event: K, listener: T[K]): this;
    	emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): boolean;
    	eventNames(): Array<keyof T>;
    	getMaxListeners(): number;
    	listenerCount(type: keyof T): number;
    	listeners<K extends keyof T>(event: K): Array<T[K]>;
    	off<K extends keyof T>(event: K, listener: T[K]): this;
    	on<K extends keyof T>(event: K, listener: T[K]): this;
    	once<K extends keyof T>(event: K, listener: T[K]): this;
    	prependListener<K extends keyof T>(event: K, listener: T[K]): this;
    	prependOnceListener<K extends keyof T>(event: K, listener: T[K]): this;
    	rawListeners<K extends keyof T>(event: K): Array<T[K]>;
    	removeAllListeners<K extends keyof T>(event?: K): this;
    	removeListener<K extends keyof T>(event: K, listener: T[K]): this;
    	setMaxListeners(n: number): this;
}

export declare type Url = string;

export declare interface UserCompressConfig {
    customConfigs: Record<string, ICustomConfig>;
    defaultConfig: Record<string, {
        name: string;
        options: Record<string, Record<string, {
            quality: string | number;
        }>>;
    }>;
    userPreset: Record<string, {
        name: string;
        options: Record<string, Record<string, {
            quality: string | number;
        }>>;
        overwrite?: Record<string, Record<string, {
            quality: string | number;
        }>>;
    }>;
    genMipmaps: boolean;
}

export declare type UUID = string;

export declare const VERSION: string;

/**
 * 虚拟的 asset 实例
 * 没有对应的源文件都的都是虚拟 asset
 */
export declare class VirtualAsset {
    versionCode: number;
    _init: boolean;
    importError: Error | any;
    get init(): boolean;
    set init(bool: boolean);
    /**
     * 等待导入完成
     */
    _waitInitHandle: Function[];
    waitInit(): Promise<void>;
    action: AssetActionEnum;
    task: number;
    invalid: boolean;
    uuid2recycle: {
        [index: string]: Meta;
    };
    get source(): string;
    get url(): string;
    get library(): string;
    get temp(): string;
    get uuid(): string;
    get displayName(): string;
    /**
     * 获取一个存储在资源上的数据
     * @param key
     * @returns
     */
    getData(key: string): any;
    /**
     * 设置一个存储在资源上的数据
     * @param key
     * @param value
     * @returns
     */
    setData(key: string, value: any): void;
    generate(): void;
    meta: Meta;
    subAssets: {
        [name: string]: VirtualAsset;
    };
    set imported(imported: boolean);
    get imported(): boolean;
    _lock: boolean;
    _waitLockHandler: Function[];
    /**
     * 锁定资源
     */
    lock(): Promise<unknown>;
    /**
     * 解锁资源
     */
    unlock(): void;
    _assetDB: AssetDB;
    _parent: VirtualAsset | Asset | null;
    _name: string;
    _id: string;
    _swapSpace: any;
    _isDirectory?: boolean;
    get parent(): Asset | VirtualAsset | null;
    get userData(): {
        [index: string]: any;
    };
    constructor(meta: Meta, name: string, id: string, assetDB: AssetDB);
    /**
     * 复制外部的 userData 数据
     * @param json 模版对象
     * @param overwrite 如果 userData 内有数据，是否使用模版内的数据覆盖，默认 false
     */
    assignUserData(json: Object, overwrite?: boolean): void;
    /**
     * 保存当前资源的 meta 信息
     */
    save(): any;
    /**
     * 清空并还原 meta 数据
     * 并清除 subMeta 内的数据
     * @param handle 删除内部的 subAsset 的时候会执行回调
     */
    reset(): Promise<boolean>;
    /**
     * 查询一个文件的绝对地址
     * @param extOrFile
     */
    getFilePath(extOrFile: string): string;
    /**
     * 存储一个 uuid 为名字的 buffer
     * 传入一个扩展名或者相对路径，如果传入扩展名，则存储到 uuid.extname
     * 如果传入的是一个相对路径或者文件名，则放到 uuid 为名字的目录内
     * @param extOrPath 一个扩展名或者相对路径
     * @param buffer
     */
    saveToLibrary(extOrFile: string, buffer: Buffer | string): Promise<void>;
    /**
     * 复制一个文件到 library 内
     * @param extOrFile
     * @param target
     */
    copyToLibrary(extOrFile: string, target: string): Promise<void>;
    /**
     * 删除一个以 uuid 为名字的导入文件
     * @param extOrFile
     */
    deleteFromLibrary(extOrFile: string): Promise<false | undefined>;
    /**
     * 判断一个以 uuid 为名字的文件是否存在
     * @param extOrFile
     */
    existsInLibrary(extOrFile: string): boolean;
    /**
     * 判断是否是文件夹
     */
    isDirectory(): boolean;
    /**
     * 创建一个虚拟的 asset，这个 asset 没有实体
     * 一个虚拟的 asset 也允许存储都个文件
     * @param name
     * @param importer 使用什么解析
     */
    createSubAsset(name: string, importer: string, options?: {
        displayName?: string;
        id?: string;
    }): Promise<VirtualAsset>;
    /**
     * 注册依赖的文件
     * 记录的是依赖的文件的源路径
     * 在每次 asset 任务之后都需要检查依赖 asset 的资源并更新
     * 依赖的文件更新的时候，需要更新自身
     * @param fileOrUuid 当前资源依赖的文件的绝对路径，不能传入相对路径
     *   db://assets/test.json
     *   /Users/xx/project/assets/test.json
     *   db://assets/test.plist@c30fb
     */
    depend(fileOrUuidOrUrl: string): void;
    /**
     * 获取交换空间对象
     * 这个空间主要是提供给父子资源间数据相互依赖使用的临时数据空间
     * 并不会保证数据存在，需要使用方自己去判断数据正确性，如无数据，需要自己生成
     */
    getSwapSpace<T>(): T;
}

export declare type WarningHandler = (warning: RollupWarning) => void;

export declare type WarningHandlerWithDefault = (
	warning: RollupWarning,
	defaultHandler: WarningHandler
) => void;

export declare function watch(config: RollupWatchOptions | RollupWatchOptions[]): RollupWatcher;

export declare type WatchChangeHook = (
	this: PluginContext,
	id: string,
	change: { event: ChangeEvent }
) => void;

export declare interface WatcherOptions {
    	buildDelay?: number;
    	chokidar?: ChokidarOptions;
    	clearScreen?: boolean;
    	exclude?: string | RegExp | (string | RegExp)[];
    	include?: string | RegExp | (string | RegExp)[];
    	skipWrite?: boolean;
}

export declare type WebDesktopBuildOptions = IBuildTaskOption<'web-desktop'>;

export declare interface webDesktopOptions {
    /**
     * 是否使用 WEBGPU 渲染后端
     * @default false
     * @experiment
     */
    useWebGPU: boolean;
    /**
     * 游戏视图分辨率
     */
    resolution: {
        designHeight: number;
        designWidth: number;
    };
}

export declare type WebMobileBuildOptions = IBuildTaskOption<'web-mobile'>;

export declare interface webMobileOptions {
    /**
     * 是否使用 WEBGPU 渲染后端
     * @experiment
     */
    useWebGPU: boolean;
    /**
     * 设备方向
     * @default 'auto'
     */
    orientation: IOrientation_2;
    /**
     * 是否嵌入 Web 端调试工具
     * @default false
     */
    embedWebDebugger: boolean;
}

export declare enum WebPlatform {
    WEB_EDITOR = 0,
    WEB_MOBILE = 1,
    WEB_DESKTOP = 2,
}

export declare type windowsOptions = nativeOptions & {
    executableName: string;
    renderBackEnd: {
        vulkan: boolean;
        gles3: boolean;
        gles2: boolean;
    };
    targetPlatform: 'win32' | 'x64';
    serverMode: boolean;
    vsData: string;
    vsVersion?: string;
};

export declare type WrapMode = 'repeat' | 'clamp-to-edge' | 'mirrored-repeat';

export { }
