/// <reference types="node" />

import { __private } from 'cc';
import { ChunkInfo } from '@cocos/creator-programming-quick-pack/lib/loader';
import type { Component } from 'cc';
import { EventEmitter } from 'events';
import { default as i18n_2 } from 'i18next';
import { NextFunction } from 'express';
import type { Node as Node_2 } from 'cc';
import { Request as Request_2 } from 'express';
import { Response as Response_2 } from 'express';
import type { Scene as Scene_2 } from 'cc';
import type { Vec3 as Vec3_2 } from 'cc';

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

/** 所有资源处理器类型的常量数组（用于 Zod enum 和 TypeScript type） */
export declare const ASSET_HANDLER_TYPES: string[];

export declare enum AssetActionEnum {
    'add' = 0,
    'change' = 1,
    'delete' = 2,
    'none' = 3
}

export declare interface AssetChangeInfo {
    type: AssetChangeType;
    uuid: string;
    filePath: string;
    importer: string;
    userData: object;
}

export declare type AssetChangeType = AssetActionEnum;

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

export declare interface AssetDBOptions_2 {
    name: string;
    target: string;
    library: string;
    temp: string;
    interval: number;
    /**
     * 0: 忽略错误
     * 1: 仅仅打印错误
     * 2: 打印错误、警告
     * 3: 打印错误、警告、日志
     * 4: 打印错误、警告、日志、调试信息
     */
    level: number;
    ignoreFiles: string[];
    preImportExtList?: string[];
    readonly: boolean;
    visible: boolean;
    ignoreGlob?: string;
}

/** 资源处理器类型（从常量数组派生） */
export declare type AssetHandlerType = typeof ASSET_HANDLER_TYPES[number] | 'database';

export declare interface AssetInfo extends IAssetInfo {
    // Asset name
    // 资源名字
    name: string;
    // Asset display name
    // 资源用于显示的名字
    displayName: string;
    // URL
    source: string;
    // loader 加载的层级地址
    path: string;
    // loader 加载地址会去掉扩展名，这个参数不去掉
    url: string;
    // 绝对路径
    file: string;
    // 资源的唯一 ID
    uuid: string;
    // 使用的导入器名字
    importer: string;
    // 类型
    type: IAssetType;
    // 是否是文件夹
    isDirectory: boolean;
    // 导入资源的 map
    library: { [key: string]: string };
    // 子资源 map
    subAssets: { [key: string]: AssetInfo };
    // 是否显示
    visible: boolean;
    // 是否只读
    readonly: boolean;

    // 虚拟资源可以实例化成实体的话，会带上这个扩展名
    instantiation?: string;
    // 跳转指向资源
    redirect?: IRedirectInfo;
    // 继承类型
    extends?: string[];
    // 是否导入完成
    imported: boolean;
    // 是否导入失败
    invalid: boolean;
}

export declare interface AssetOperationOption {
    // 是否强制覆盖已经存在的文件，默认 false，传递后会直接覆盖文件，未传递时有冲突会直接抛异常
    overwrite?: boolean;
    // 是否自动重命名冲突文件，默认 false ，传递后会以内部规则自动重命名冲突文件，新的文件名可以在返回值中获取
    rename?: boolean;
}

export declare interface AssetOperationOption {
    // 是否强制覆盖已经存在的文件，默认 false
    overwrite?: boolean;
    // 是否自动重命名冲突文件，默认 false
    rename?: boolean;
}

export declare namespace Assets {
    export {
        init,
        start,
        onReady,
        onDBReady,
        onProgress,
        deleteAsset,
        refresh,
        queryAssetInfo,
        queryAssetMeta,
        queryCreateMap,
        queryAssetInfos,
        queryAssetDBInfos,
        createAssetByType,
        createAsset,
        importAsset,
        reimportAsset,
        saveAsset,
        queryUUID,
        queryPath,
        queryUrl,
        queryAssetDependencies,
        queryAssetUsers,
        querySortedPlugins,
        renameAsset,
        moveAsset,
        updateDefaultUserData,
        queryAssetUserDataConfig,
        updateAssetUserData,
        queryAssetConfigMap,
        queryThumbnailHandlers,
        generateThumbnail,
        onAssetAdded,
        onAssetChanged,
        onAssetRemoved,
        CreateAssetOptions,
        IAssetConfig,
        IAssetDBInfo,
        ICreateMenuInfo,
        IUerDataConfigItem,
        QueryAssetType,
        FilterPluginOptions,
        IPluginScriptInfo,
        IAssetMeta,
        IAssetInfo,
        AssetOperationOption,
        AssetInfo,
        IRedirectInfo,
        QueryAssetsOption,
        CreateAssetByTypeOptions,
        AssetDBOptions_2 as AssetDBOptions,
        ExecuteAssetDBScriptMethodOptions,
        ISupportCreateCCType,
        IAssetType,
        ISupportCreateType,
        AssetHandlerType,
        AssetUserDataMap
    }
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

export declare namespace Base {
    export {
        init_2 as init
    }
}

export declare interface BaseItem {
    /**
     * @zh 在项目设置上显示的模块名称，支持 i18n 格式
     * @en the module name displayed on the project settings, can be configured in i18n format.
     */
    label?: string;

    /**
     * @zh 模块详细描述，将会显示在模块鼠标上移后的提示，支持 `i18n` 的格式
     * @en the detailed description of the module, which will be displayed in the tooltip when the mouse is moved over the module, can be configured in i18n format.
     */
    description?: string;

    /**
     * @zh 是否默认包含该模块
     * @en whether the module is included by default.
     */
    default: boolean;

    /**
     * @zh 标识是否为只读模块，设为 `true` 后用户无法开启或关闭该模块。
     * @en whether the module is read-only. If set to true, users cannot modify this module.
     */
    readonly?: boolean;

    /**
     * @zh 是否在项目设置上隐藏该模块，设为 `true` 后将不会显示在项目设置中。
     * @en Whether to hide the module in the project settings. If set to true, it will not be displayed in the project settings.
     */
    hidden?: boolean;

    /**
     * @zh 默认的模块分组归属，对应 `features` 字段同级的 `categories` 中配置的目录。
     * @en The default module group belongs to, corresponding to the directory configured under the `categories` field at the same level of the `features` field.
     */
    category?: string;

    /**
     * @zh 是否为必选模块，新增模块为必选模块时，旧版本升级后会强制选择此模块，否则不会选择。
     * @en Whether it is a required module. When adding a new module, the old version will be forced to select this module after the upgrade, otherwise it will not be selected.
     */
    required?: boolean;

    /**
     * @zh 该模块依赖的其他模块，如果依赖了其他模块，则此模块勾选后，依赖模块也会被自动勾选。反过来，依赖的模块被移除勾选，此模块也会被一并移除。
     * @en The other modules that this module depends on. If the module depends on other modules, the dependent modules will be automatically selected. In addition, if the dependent module is removed, this module will also be removed.
     */
    dependencies?: string[];
}

/** 位图字体资源的 userData */
export declare interface BitmapFontAssetUserData {
    /** 字体配置 */
    _fntConfig: any;
    /** 字体大小 */
    fontSize: number;
    /** 纹理 UUID */
    textureUuid: string;
}

export declare interface CategoryDetail extends CategoryInfo {
    modules: IModules;
}

export declare interface CategoryInfo {
    label?: string;
    description?: string;
    checkable?: boolean;
    required?: boolean;
}

export declare interface CCEModuleConfig {
    description: string;
    main: string;
    types: string;
}

export declare type CCEModuleMap = {
    [moduleName: string]: CCEModuleConfig;
} & {
    mapLocation: string;
};

export declare function close_2(): Promise<void>;

export declare namespace Configuration {
    export {
        init_3 as init,
        migrateFromProject,
        reload,
        migrate,
        get,
        set,
        remove,
        save,
        getConfigPath,
        onDidSave,
        getMetadata,
        IConfiguration,
        ConfigurationScope,
        IBaseConfiguration,
        ICocosConfigurationNode,
        ICocosConfigurationPropertySchema
    }
}

/**
 * 配置范围
 */
export declare type ConfigurationScope = 'default' | 'project';

/**
 * 创建类型
 */
export declare const CREATE_TYPES: readonly ["scene", "prefab"];

/**
 * Create Asset // 创建资源
 */
export declare function createAsset(options: CreateAssetOptions): Promise<IAssetInfo>;

/**
 * Create Asset By Type // 按类型创建资源
 */
export declare function createAssetByType(ccType: ISupportCreateType, dirOrUrl: string, baseName: string, options?: CreateAssetByTypeOptions): Promise<IAssetInfo>;

export declare interface CreateAssetByTypeOptions extends AssetOperationOption {
    /**
     * 指定的模板名称，默认为 default
     */
    templateName?: string;

    /**
     * 资源内容，当 content 与 template 都传递时，优先使用 content 创建文件
     */
    content?: string | Buffer | JSON;
}

export declare interface CreateAssetOptions {
    // 资源创建的输出地址，支持绝对路径和 url
    target: string;

    // 资源文件内容，支持字符串、Buffer、JSON
    content?: string | Buffer | JSON;
    // 资源文件模板地址，例如 db://xxx/ani ，支持 url 与绝对路径
    template?: string;
    // (当 content 与 template 都未传递时，将创建文件夹)
    // (当 content 与 template 都传递时，优先使用 content 创建文件)

    // 资源处理器名称，决定了此新建资源将由哪个资源处理器处理，未指定时将由 target 的后缀查找处理器
    handler?: string;
    // 指定 uuid ，由于 uuid 也有概率冲突，uuid 冲突时会自动重新分配 uuid
    uuid?: string;
    // 默认 false 不覆盖同名时文件将会重命名指定的 path
    overwrite?: boolean;
    // 是否自动重命名冲突文件，默认 false
    rename?: boolean;
    // 新建资源时指定的一些 userData 默认配置值
    userData?: Record<string, any>;
    // 传递一些自定义配置信息，可以在自定义资源处理器内使用
    customOptions?: Record<string, any>;
}

/**
 * Delete Asset // 删除资源
 */
export declare function deleteAsset(dbPath: string): Promise<IAssetInfo | null>;

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

export declare namespace Engine {
    export {
        init_4 as init,
        getInfo,
        getConfig,
        initEngine,
        startEngineCompilation,
        queryLayerBuiltin,
        querySortingLayerBuiltin,
        EngineInfo,
        IFlags,
        MakeRequired,
        IPhysicsConfig,
        ICollisionMatrix,
        IVec3Like,
        IPhysicsMaterial,
        ICustomJointTextureLayout,
        IChunkContent,
        MacroItem,
        ISplashBackgroundColor,
        ISplashSetting,
        IDesignResolution,
        IEngineModuleConfig,
        IEngineConfig,
        IEngineProjectConfig,
        IInitEngineInfo,
        CCEModuleConfig,
        CCEModuleMap,
        ModuleRenderConfig,
        Migration,
        IModuleItem,
        Features,
        BaseItem,
        IFeatureItem,
        IFeatureGroup,
        CategoryInfo,
        IModules,
        IDisplayModuleItem,
        IDisplayModuleCache,
        CategoryDetail,
        IModuleConfig,
        IDefaultConfigKeys,
        IDefaultConfig,
        ICroppingConfigDeprecatedFeature,
        ICroppingConfig
    }
}

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

export declare type EventEmitterMethods = Pick<EventEmitter, 'on' | 'off' | 'once' | 'emit'>;

export declare interface ExecuteAssetDBScriptMethodOptions {
    name: string;
    method: string;
    args?: any[];
}

export declare interface Features {
    [feature: string]: IModuleItem;
}

export declare interface FileNameCheckConfig {
    // 匹配规则
    regStr: string;
    // 匹配失败时的提示类型
    failedType: 'error' | 'warn' | 'info',
    // 匹配失败时的提示信息，支持 i18n:xxx
    failedInfo: string;
}

export declare type Filter = 'none' | 'nearest' | 'linear';

export declare interface FilterPluginOptions {
    loadPluginInEditor?: boolean;
    loadPluginInWeb?: boolean;
    loadPluginInNative?: boolean;
    loadPluginInMiniGame?: boolean;
}

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

/**
 * Generate Thumbnail // 生成资源缩略图
 */
export declare function generateThumbnail(urlOrUUIDOrPath: string, size?: ThumbnailSize): Promise<ThumbnailInfo | null>;

export declare function get<T>(key: string, scope?: ConfigurationScope): Promise<T>;

export declare function get_2(): Promise<Project_2>;

export declare function getConfig(useDefault?: boolean): Promise<IEngineConfig>;

export declare function getConfigPath(): Promise<string>;

export declare function getInfo(): Promise<EngineInfo>;

export declare function getInfo_2(): Promise<ProjectInfo>;

export declare function getMetadata(): Promise<ICocosConfigurationNode[]>;

export declare function getProgrammingFacet(): Promise<ProgrammingFacet>;

/**
 * Get the MCP registration status.
 */
export declare function getStatus(): {
    registered: boolean;
    url?: string;
};

/**
 * Get the server running status.
 */
export declare function getStatus_2(): {
    running: boolean;
    url?: string;
};

/**
 * Get the current server base URL.
 * Returns undefined if the server is not running.
 */
export declare function getUrl(): string | undefined;

/**
 * 全局事件管理器
 * 统一管理所有服务的事件监听，支持类型安全的事件订阅
 */
export declare class GlobalEventManager {
    /**
     * 监听指定类型的事件（类型安全版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    on<TEvents extends Record<string, any>>(event: keyof TEvents, listener: TEvents[keyof TEvents] extends void ? () => void : (payload: TEvents[keyof TEvents]) => void): void;
    /**
     * 监听指定类型的事件（通用版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    on(event: string, listener: (...args: any[]) => void): void;
    /**
     * 监听指定类型的事件（一次性，类型安全版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    once<TEvents extends Record<string, any>>(event: keyof TEvents, listener: TEvents[keyof TEvents] extends void ? () => void : (payload: TEvents[keyof TEvents]) => void): void;
    /**
     * 监听指定类型的事件（一次性，通用版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    once(event: string, listener: (...args: any[]) => void): void;
    /**
     * 移除指定类型的事件监听器（类型安全版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    off<TEvents extends Record<string, any>>(event: keyof TEvents, listener: TEvents[keyof TEvents] extends void ? () => void : (payload: TEvents[keyof TEvents]) => void): void;
    /**
     * 移除事件监听器（通用版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    off(event: string, listener: (...args: any[]) => void): void;
    /**
     * 发射指定类型的事件（类型安全版本）
     * @param event 事件名称
     * @param args 事件参数
     */
    emit<TEvents extends Record<string, any>>(event: keyof TEvents, ...args: TEvents[keyof TEvents]): void;
    /**
     * 触发事件（通用版本）
     * @param event 事件名称
     * @param args 事件参数
     */
    emit(event: string, ...args: any[]): void;
    /**
     * 跨进程广播，传的参数需要能被序列化
     * @param event 事件名称
     * @param args 事件参数
     */
    broadcast<TEvents extends Record<string, any>>(event: keyof TEvents, ...args: TEvents[keyof TEvents]): void;
    broadcast(event: string, ...args: any[]): void;
    /**
     * 清除事件监听器
     * @param event 事件名称，如果不提供则清除所有
     */
    clear(event?: string): void;
}

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

export declare namespace i18n {
    export {
        i18n_2 as default
    }
}

/**
 * 添加/创建组件的选项
 */
export declare interface IAddComponentOptions {
    nodePathOrUuid: string;
    component: string;
}

export declare interface IApplyPrefabChangesParams {
    nodePath: string;
}

export declare interface IAssetConfig {
    displayName?: string;
    description?: string;
    docURL?: string;
    userDataConfig?: Record<string, IUerDataConfigItem>;
}

export declare interface IAssetDBInfo extends AssetDBOptions {
    // 当前数据库的启动状态
    state: 'none' | 'start' | 'startup' | 'refresh'; // 是否已启动

    // 数据库是否可见
    visible: boolean;

    // 提前预导入的资源后缀，将会在 afterPreStart 之前完成预导入的资源
    preImportExtList: string[];
}

export declare interface IAssetInfo {
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
    subAssets?: { [key: string]: IAssetInfo }; // 子资源 map
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

/**
 * 场景相关处理接口
 */
export declare interface IAssetService extends IServiceEvents {
    /**
     * 资源发生变化时，进行处理
     * @param uuid
     */
    assetChanged(uuid: string): Promise<void>;
    /**
     * 资源删除时，进行处理
     * @param uuid
     */
    assetDeleted(uuid: string): Promise<void>;
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

/**
 * 配置基类接口
 */
export declare interface IBaseConfiguration extends EventEmitterMethods {
    /**
     * 模块名
     */
    moduleName: string;
    /**
     * 默认配置数据
     */
    getDefaultConfig(): Record<string, any> | undefined;
    mergeDefaultConfig(defaultConfig?: Record<string, any>): void;
    /**
     * 获取配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，不指定时按优先级查找
     */
    get<T>(key?: string, scope?: ConfigurationScope): Promise<T>;
    /**
     * 获取指定范围的所有配置，默认是 project
     * @param scope
     */
    getAll(scope?: ConfigurationScope): Record<string, any> | undefined;
    /**
     * 设置配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param value 新的配置值
     * @param scope 配置作用域，默认为 'project'
     */
    set<T>(key: string, value: T, scope?: ConfigurationScope): Promise<boolean>;
    /**
     * 移除配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，默认为 'project'
     */
    remove(key: string, scope?: ConfigurationScope): Promise<boolean>;
    /**
     * 保存配置
     */
    save(): Promise<boolean>;
}

export declare interface IBaseCreateNodeParams {
    path: string;
    name?: string;
    workMode?: '2d' | '3d';
    position?: IVec3;
    keepWorldTransform?: boolean;
    canvasRequired?: boolean;
}

/**
 * 基础标识
 */
export declare interface IBaseIdentifier {
    assetName: string;
    assetUuid: string;
    assetUrl: string;
    assetType: string;
}

export declare interface ICameraService {
    init(): void;
    initFromConfig(): Promise<void>;
    is2D: boolean;
    focus(nodes?: string[] | null, editorCameraInfo?: any, immediate?: boolean): void;
    defaultFocus(uuid: string): void;
    rotateCameraToDir(dir: Vec3_2, rotateByViewDist: boolean): void;
    changeProjection(): void;
    setGridVisible(value: boolean): void;
    isGridVisible(): boolean;
    setCameraProperty(options: any): void;
    resetCameraProperty(): void;
    getCameraFov(): number;
    zoomUp(): void;
    zoomDown(): void;
    zoomReset(): void;
    alignNodeToSceneView(nodes: string[]): void;
    alignSceneViewToNode(nodes: string[]): void;
    onUpdate(deltaTime: number): void;
}

export declare interface IChangeNodeOptions {
    source?: 'editor' | 'undo' | 'engine';
    type?: NodeEventType;
    propPath?: string;
    index?: number;
    record?: boolean;
    dumpImmediately?: boolean;
}

export declare interface IChunkContent {
    skeleton: null | string;
    clips: string[];
}

export declare interface ICLI {
    Scene: IServiceManager;
    SceneEvents: GlobalEventManager;
}

/**
 * 关闭场景/预制体选项
 */
export declare interface ICloseOptions {
    urlOrUUID?: string;
}

export declare interface ICocosConfigurationNode {
    id: string;
    title: string;
    group: string;
    order?: number;
    properties: Record<string, ICocosConfigurationPropertySchema>;
}

export declare interface ICocosConfigurationPropertySchema {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    default?: unknown;
    title?: string;
    description?: string;
    enum?: Array<string | number | boolean>;
    enumDescriptions?: string[];
    minimum?: number;
    maximum?: number;
    step?: number;
    order?: number;
    properties?: Record<string, ICocosConfigurationPropertySchema>;
    items?: ICocosConfigurationPropertySchema | ICocosConfigurationPropertySchema[];
    additionalProperties?: boolean | ICocosConfigurationPropertySchema;
    required?: string[];
}

export declare interface ICollisionMatrix {
    [x: string]: number;
}

/**
 * CLI 使用的组件信息，属性值以扁平的 key-value 形式呈现
 */
export declare interface IComponent extends IComponentIdentifier {
    properties: {
        [key: string]: IPropertyValueType;
    };
    prefab: ICompPrefabInfo | null;
}

/**
 * 编辑器使用的组件详细信息，属性值以 IProperty 编码形式呈现，
 * 包含 type、readonly、default 等元信息，用于编辑器 Inspector 面板渲染
 */
export declare interface IComponentForEditor extends IProperty {
    value: {
        enabled: IPropertyValueType;
        uuid: IPropertyValueType;
        name: IPropertyValueType;
    } & Record<string, IPropertyValueType>;
    mountedRoot?: string;
}

/**
 * 组件标识信息，包含组件的基本标识字段
 */
export declare interface IComponentIdentifier {
    cid: string;
    path: string;
    uuid: string;
    name: string;
    type: string;
    enabled: boolean;
}

/**
 * 组件服务接口，定义了所有组件相关的操作方法
 */
export declare interface IComponentService extends IServiceEvents {
    /**
     * 添加组件到指定节点，返回添加后的组件信息
     * @param params - 添加组件选项
     * @param params.nodePathOrUuid - 目标节点路径或 UUID
     * @param params.component - 组件类名，支持精确匹配（'cc.Label'）和模糊匹配（'label'）
     * @returns 添加成功后的组件信息
     *
     * @example
     * ```ts
     * // 通过节点路径 + 精确组件名
     * const comp = await addComponent({ nodePathOrUuid: 'Canvas/MyNode', component: 'cc.Label' });
     *
     * // 通过节点 UUID + 模糊组件名
     * const comp = await addComponent({ nodePathOrUuid: 'abc-123-uuid', component: 'label' });
     * ```
     */
    addComponent(params: IAddComponentOptions): Promise<IComponent>;
    /**
     * 删除指定组件
     * @param params - 删除组件选项
     * @param params.path - 组件路径，支持路径、UUID 或资源 URL
     * @returns 删除成功返回 true，失败返回 false
     */
    removeComponent(params: IRemoveComponentOptions): Promise<boolean>;
    /**
     * 设置组件属性
     * - CLI 调用时传入 ISetPropertyOptions，通过 componentPath 定位，属性为扁平键值对
     * - 编辑器调用时传入 ISetPropertyOptionsForEditor，通过节点 UUID + dump 路径定位，属性为 IProperty 格式
     *
     * @param params - 设置属性选项，根据调用方不同传入不同类型
     * @returns 设置成功返回 true，失败返回 false
     *
     * @example
     * ```ts
     * // CLI 方式：通过 componentPath 定位，直接传属性键值对
     * await setProperty({
     *     componentPath: 'Canvas/cc.Label_1',
     *     properties: { string: 'Hello', fontSize: 32 },
     * });
     *
     * // 编辑器方式：通过节点 UUID + dump 路径定位，传 IProperty 格式
     * await setProperty({
     *     uuid: 'node-uuid',
     *     path: '__comps__.0.string',
     *     dump: { value: 'Hello', type: 'String' },
     * });
     * ```
     */
    setProperty(params: ISetPropertyOptions | ISetPropertyOptionsForEditor): Promise<boolean>;
    /**
     * 查询组件信息
     * - 传入 IQueryComponentOptions 时，返回 IComponent 或 IComponent
     * - 传入 string 时，返回 IComponentForEditor
     *
     * @param params - 查询选项或组件路径字符串
     * @returns 如果传入的是 IQueryComponentOptions 时返回 IComponent，如果传入是string时返回 IComponentForEditor，未找到返回 null
     *
     * @example
     * ```ts
     * CLI 模式：返回 IComponent（扁平属性）
     * const comp = await queryComponent({ path: 'Canvas/cc.Label_1' }) as IComponent;
     *
     * 编辑器模式：直接传 string，这里是uuid，因为与cli重复了，也支持 path 和 url
     * const comp = await queryComponent('uuid') as IComponentForEditor;
     * ```
     */
    queryComponent(params: IQueryComponentOptions | string): Promise<IComponent | IComponentForEditor | null>;
    /**
     * 获取所有已注册的组件类名，包含内置与自定义组件
     * @returns 组件类名数组，如 ['cc.Label', 'cc.Sprite', 'MyCustomComponent']
     */
    queryAllComponent(): Promise<string[]>;
    /**
     * 创建组件（编辑器使用），与 addComponent 不同的是仅返回是否成功
     * @param params - 添加组件选项
     * @param params.nodePathOrUuid - 目标节点路径或 UUID
     * @param params.component - 组件类名
     * @returns 创建成功返回 true，失败返回 false
     */
    createComponent(params: IAddComponentOptions): Promise<boolean>;
    /**
     * 复位组件，将组件所有属性恢复为默认值
     * @param params - 查询组件选项，用于定位要复位的组件
     * @param params.path - 组件路径，支持路径、UUID 或资源 URL
     * @returns 复位成功返回 true，失败返回 false
     */
    resetComponent(params: IQueryComponentOptions): Promise<boolean>;
    /**
     * 获取所有注册类名，支持按继承关系过滤
     * @param options - 过滤选项，不传则返回所有注册类
     * @param options.extends - 父类名称，只返回继承自该类的子类，支持字符串或字符串数组
     * @param options.excludeSelf - 是否排除父类自身，默认 false
     * @returns 类名对象数组，如 [{ name: 'cc.Label' }, { name: 'cc.Sprite' }]
     *
     * @example
     * ```ts
     * // 查询所有注册类
     * const all = await queryClasses();
     *
     * // 查询 cc.Component 的所有子类（含自身）
     * const comps = await queryClasses({ extends: 'cc.Component' });
     *
     * // 查询 cc.Component 的所有子类（排除自身）
     * const subComps = await queryClasses({ extends: 'cc.Component', excludeSelf: true });
     * ```
     */
    queryClasses(options?: IQueryClassesOptions): Promise<{
        name: string;
    }[]>;
    /**
     * 查询指定节点上所有组件暴露的可调用函数
     * @param uuid - 节点 UUID
     * @returns 节点上组件的函数信息，节点不存在时返回空对象
     */
    queryComponentFunctionOfNode(uuid: string): Promise<any>;
    /**
     * 执行组件上的指定方法
     * @param options - 执行选项
     * @param options.uuid - 组件实例的 UUID
     * @param options.name - 要执行的方法名，如 'onLoad'、'start'
     * @param options.args - 方法参数列表
     * @returns 执行成功返回 true，失败返回 false
     */
    executeComponentMethod(options: IExecuteComponentMethodOptions): Promise<boolean>;
    /**
     * 查询指定名称的组件是否已注册（是否存在对应脚本）
     * @param name - 组件类名，如 'cc.Label'
     * @returns 存在返回 true，不存在返回 false
     */
    queryComponentHasScript(name: string): Promise<boolean>;
    init(): void;
    unregisterCompMgrEvents(): void;
}

export declare interface ICompPrefabInfo {
    fileId: string;
}

/**
 * 配置的格式
 */
export declare interface IConfiguration {
    /**
     * 其他配置
     */
    [key: string]: any;
}

export declare interface ICreateByAssetParams extends IBaseCreateNodeParams {
    dbURL: string;
}

export declare interface ICreateByNodeTypeParams extends IBaseCreateNodeParams {
    nodeType: NodeType;
}

export declare interface ICreateMenuInfo {
    // 新建菜单名称，支持 i18n:xxx
    label: string;
    // 模板名称，默认为 default ，作为模板选择的唯一标识符
    name: string;
    // 创建的默认文件名称带后缀，具体实际上是为 assets 面板提供的数据，assets 面板新建时，需要先让用户填写清楚命名最后才创建
    fullFileName: string;

    // 资源文件模板地址，例如 db://xxx/ani ，支持 url 与绝对路径
    template?: string;

    // 创建类型的 handler 名称，默认为当前处理器名称
    handler?: string;

    // 创建子菜单
    submenu?: ICreateMenuInfo[];
    // 分组名称
    group?: string;

    // 资源创建时的名称校验规则
    fileNameCheckConfigs?: FileNameCheckConfig[];
}

/**
 * 创建场景/预制体选项
 */
export declare interface ICreateOptions {
    type: ICreateType;
    baseName: string;
    targetDirectory: string;
    templateType?: TSceneTemplateType;
}

export declare interface ICreatePrefabFromNodeParams {
    /** 要转换为预制体的源节点路径 */
    nodePath: string;
    /** 预制体资源保存 URL */
    dbURL: string;
    /** 是否强制覆盖现有资源 */
    overwrite?: boolean;
}

export declare type ICreateType = typeof CREATE_TYPES[number];

export declare type ICroppingConfig = {
    name: string;
    cache: Record<string, IDisplayModuleCache>,
    flags: IFlags_2,
    includeModules: string[],
    noDeprecatedFeatures: ICroppingConfigDeprecatedFeature;
    moduleToFallBack?: Record<string, string>;
}

export declare type ICroppingConfigDeprecatedFeature = {
    value: boolean,
    version: string
};

export declare interface ICustomJointTextureLayout {
    textureLength: number;
    contents: IChunkContent[];
}

export declare type IDefaultConfig = {
    key: IDefaultConfigKeys;
    name: string;
    diyConfig: (cache: Record<string, IDisplayModuleCache>, flags: IFlags_2, includeModules: string[]) => void;
}

export declare type IDefaultConfigKeys = 'defaultConfig' | 'default2d' | 'default3d' | 'defaultNative' | 'defaultSmallGames'

export declare interface IDeleteNodeParams {
    path: string;
    keepWorldTransform?: boolean;
}

export declare interface IDeleteNodeResult {
    path: string;
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

export declare interface IDisplayModuleCache {
    _value: boolean;
    _option?: string; // 保存下拉选项的值
    _flags?: IFlags_2; // 保存下拉选项的值的联动开关
}

export declare interface IDisplayModuleItem extends IFeatureItem {
    _value: boolean;
    _option?: string;
    options?: Record<string, IDisplayModuleItem>;
}

export declare interface IEditorService extends IServiceEvents {
    /**
     * 当前编辑器类型
     */
    getCurrentEditorType(): 'scene' | 'prefab' | 'unknown';
    /**
     * 打开资产
     * @param params
     */
    open(params: IOpenOptions): Promise<TEditorEntity>;
    /**
     * 关闭当前资产
     */
    close(params: ICloseOptions): Promise<boolean>;
    /**
     * 保存资产
     */
    save(params: ISaveOptions): Promise<IAssetInfo>;
    /**
     * 重载资产
     * @param params
     */
    reload(params: IReloadOptions): Promise<ReloadResult>;
    /**
     * 创建新资产
     * @param params
     */
    create(params: ICreateOptions): Promise<IBaseIdentifier>;
    /**
     * 是否有打开编辑器
     */
    hasOpen(): Promise<boolean>;
    /**
     * 获取当前打开的资产
     */
    queryCurrent(): Promise<TEditorEntity | null>;
    /**
     *
     */
    getRootNode(): TEditorInstance | null;
    lock(): Promise<void>;
    unlock(): void;
}

export declare interface IEngineConfig extends IEngineModuleConfig {
    physicsConfig: IPhysicsConfig;
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

export declare interface IEngineModuleConfig {
    // ---- 模块配置相关 ----
    includeModules: string[];
    flags?: IFlags;
    noDeprecatedFeatures?: { value: boolean, version: string };
}

export declare interface IEngineOptions {
    /**
     * 引擎仓库根目录。
     */
    root: string;
    /**
     * 引擎编译后的根目录。
     */
    distRoot: string;
    /**
     * 引擎基础 URL。
     */
    baseUrl: string;
    /**
     * 使用的引擎功能。
     */
    features: string[];
}

export declare interface IEngineProjectConfig extends Exclude<IEngineConfig, 'includeModules' | 'flags' | 'noDeprecatedFeatures'> {
    configs?: Record<string, IEngineModuleConfig>;
    globalConfigKey?: string;
}

export declare interface IEngineService extends IServiceEvents {
    /**
     * 初始化引擎服务，目前是暂时引擎 mainLoop
     */
    init(): Promise<void>;
    /**
     * 让引擎执行一帧
     */
    repaintInEditMode(): Promise<void>;
}

/**
 * 执行组件方法的选项
 */
export declare interface IExecuteComponentMethodOptions {
    uuid: string;
    name: string;
    args: any[];
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

export declare interface IFeatureGroup extends BaseItem {
    options: { [feature: string]: IFeatureItem };
}

export declare interface IFeatureItem extends BaseItem {
    /**
     * @zh 是否默认以及允许包含在上传的各个小游戏引擎插件内，目前由于部分引擎模块包体较大，默认不会打包在官方的微信引擎分离插件内。（临时方案）
     * @en Whether it is included in the upload of the various engine plugins by default. Currently, because some engine modules are packaged in a large package, the official WeChat engine separation plugin does not package them by default. (Temporary solution)
     */
    enginePlugin?: boolean;

    /**
     * @zh 限定的使用环境，允许宏的组合条件判断，默认为空支持任意环境，配置后限定为指定环境。如设置为 "$NATIVE || $HTML5" 则仅在 native 和 html5 环境下生效。
     * @en The restricted usage environment allows for conditional judgments using macro combinations. By default, it supports any environment, but once configured, it is limited to the specified environment. For example, if set to "$NATIVE || $HTML5", it will only take effect in native and HTML5 environments.
     */
    envCondition?: string;

    /**
     * @zh 当环境不符合限定的使用环境时，自动回退的模块名称。仅当 `envCondition` 配置后才有效。
     * @en The name of the engine feature to automatically fall back to when the environment does not meet the restricted usage conditions. This is only effective when `envCondition` is configured.
     */
    fallback?: string;

    /**
     * @zh 当选择了某个模块时，可以做些附加的配置
     * @en When a module is selected, additional configurations can be made
     */
    flags: { [k: string]: Pick<BaseItem, 'default' | 'label' | 'description'> & { 'ui-type': 'checkbox' | 'select' } }

    /**
     * @zh 是否为原生模块，这部分模块的编译模式可能是 wasm 也可能是共存或只有 asmjs，为 true 的模块，如果模块勾选构建面板上才会显示原生代码打包模式的配置。
     * @en Whether it is a native module. This part of the module may be compiled as wasm or asmjs, and the module with this attribute will be displayed in the packaging mode configuration in the build panel if it is selected.
     */
    isNativeModule?: boolean;

    /**
     * @zh 在原生引擎的模块宏配置，如果在原生端有原生实现，在此处补充对应字段，后续根据项目设置的配置情况，会将选择值设置到 `cmake` 配置内。
     * @en The macro configuration of the native module in the native engine. If there is a native implementation in the native engine, please fill in the corresponding fields here. The value will be set to `cmake` configuration according to the project settings.
     */
    cmakeConfig?: string;
}

export declare type IFlags = Record<string, boolean | number>;

export declare type IFlags_2 = Record<string, boolean | number>;

export declare interface IGetPostConfig {
    url: string | RegExp;
    handler: (req: Request_2, res: Response_2, next?: NextFunction) => Promise<void>;
}

export declare interface IGetPrefabInfoParams {
    nodePath: string;
}

export declare interface IGizmoService {
    gizmoRootNode: any;
    foregroundNode: any;
    backgroundNode: any;
    transformToolData: any;
    transformToolName: string;
    isViewMode: boolean;
    init(): void;
    initFromConfig(): Promise<void>;
    saveConfig(): Promise<void>;
    changeTool(name: string): void;
    setCoordinate(coord: 'local' | 'global'): void;
    setPivot(pivot: 'pivot' | 'center'): void;
    lockGizmoTool(locked: boolean): void;
    setIconVisible(visible: boolean): void;
    showAllGizmoOfNode(node: any, recursive?: boolean): void;
    removeAllGizmoOfNode(node: any, recursive?: boolean): void;
    clearAllGizmos(): void;
    callAllGizmoFuncOfNode(node: any, funcName: string, ...params: any[]): boolean;
    onUpdate(deltaTime: number): void;
}

export declare interface IInitEngineInfo {
    importBase: string;
    nativeBase: string;
    writablePath: string;
    serverURL?: string;
}

export declare interface IIsPrefabInstanceParams {
    nodePath: string;
}

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

export declare interface IMiddlewareContribution {
    get?: IGetPostConfig[];
    post?: IGetPostConfig[];
    staticFiles?: IStaticFileConfig[];
    socket?: ISocketConfig;
}

export declare interface IModuleConfig {
    moduleTreeDump: {
        default: IModules;
        categories: Record<string, CategoryDetail>;
    },
    nativeCodeModules: string[];
    moduleCmakeConfig: Record<string, { native?: string; }>;
    moduleDependMap: Record<string, string[]>;
    moduleDependedMap: Record<string, string[]>;
    features: IModules,
    ignoreModules: string[],
    envLimitModule: Record<string, {
        envList: string[];
        fallback?: string;
    }>;
}

export declare type IModuleItem = IFeatureItem | IFeatureGroup;

export declare type IModules = Record<string, IModuleItem>;

export declare interface IMountedChildrenInfo {
    targetInfo: ITargetInfo | null;
    nodes: INodeIdentifier[];
}

export declare interface IMountedComponentsInfo {
    targetInfo: ITargetInfo | null;
    components: IComponentIdentifier[];
}

/**
 * Import Asset // 导入资源
 */
export declare function importAsset(source: string, target: string, options?: AssetOperationOption): Promise<IAssetInfo[]>;

export declare interface ImportMap {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
}

export declare function init(): Promise<void>;

export declare function init_2(projectPath: string): Promise<void>;

export declare function init_3(projectPath: string): Promise<void>;

export declare function init_4(projectPath: string): Promise<void>;

export declare function init_5(projectPath: string): Promise<void>;

/**
 * Initialize the scene module.
 * Registers the scene middleware and initializes scene config.
 */
export declare function init_6(): Promise<void>;

export declare function init_7(projectPath: string): Promise<void>;

export declare function initEngine(enginePath: string, projectPath: string, serverURL?: string): Promise<void>;

export declare function initProgrammingFacet(): Promise<ProgrammingFacet>;

export declare interface INode extends INodeIdentifier {
    properties: INodeProperties;
    components?: IComponent[] | IComponentIdentifier[];
    children?: INode[];
    prefab: IPrefabInfo | null;
}

export declare interface INodeIdentifier {
    nodeId: string;
    path: string;
    name: string;
}

export declare interface INodeProperties {
    position: IVec3;
    rotation: IQuat;
    eulerAngles: IVec3;
    scale: IVec3;
    mobility: MobilityMode;
    layer: number;
    active: boolean;
}

/**
 * 节点的相关处理接口
 */
export declare interface INodeService extends IServiceEvents {
    /**
     * 创建节点
     * @param params
     */
    createNodeByType(params: ICreateByNodeTypeParams): Promise<INode | null>;
    /**
     * 创建节点
     * @param params
     */
    createNodeByAsset(params: ICreateByAssetParams): Promise<INode | null>;
    /**
     * 删除节点
     * @param params
     */
    deleteNode(params: IDeleteNodeParams): Promise<IDeleteNodeResult | null>;
    /**
     * 更新节点
     * @param params
     */
    updateNode(params: IUpdateNodeParams): Promise<IUpdateNodeResult>;
    /**
     * 查询节点
     */
    queryNode(params: IQueryNodeParams): Promise<INode | null>;
    /**
     * 查询节点树（层级管理器格式）
     */
    queryNodeTree(params: IQueryNodeTreeParams): Promise<INodeTreeItem | null>;
}

export declare interface INodeTreeComponent {
    isCustom: boolean;
    type: string;
    value: string;
    extends: string[];
}

export declare interface INodeTreeItem {
    name: string;
    active: boolean;
    locked: boolean;
    type: string;
    uuid: string;
    children: INodeTreeItem[];
    prefab: IPrefabStateInfo;
    parent: string;
    path: string;
    isScene: boolean;
    readonly: boolean;
    components: INodeTreeComponent[];
}

/**
 * 打开场景/预制体选项
 */
export declare interface IOpenOptions {
    urlOrUUID: string;
    simpleNode?: boolean;
}

export declare interface IOperationService {
    addListener(type: OperationEvent, listener: Function, priority?: number): void;
    removeListener(type: OperationEvent, listener: Function): void;
    dispatch(type: OperationEvent, ...args: any[]): void;
    emitMouseEvent(type: string, event: ISceneMouseEvent, dpr?: number): void;
    requestPointerLock(): void;
    exitPointerLock(): void;
    changePointer(type: string): void;
}

export declare interface IPhysicsConfig {
    gravity: IVec3Like; // （0，-10， 0）
    allowSleep: boolean; // true
    sleepThreshold: number; // 0.1，最小 0
    autoSimulation: boolean; // true
    fixedTimeStep: number; // 1 / 60 ，最小 0
    maxSubSteps: number; // 1，最小 0
    defaultMaterial?: string; // 物理材质 uuid
    useNodeChains: boolean; // true
    collisionMatrix: ICollisionMatrix;
    physicsEngine: string;
    physX?: {
        notPackPhysXLibs: boolean;
        multiThread: boolean;
        subThreadCount: number;
        epsilon: number;
    };
}

export declare interface IPhysicsMaterial {
    friction: number; // 0.5
    rollingFriction: number; // 0.1
    spinningFriction: number; // 0.1
    restitution: number; // 0.1
}

export declare interface IPluginScriptInfo extends PluginScriptInfo {
    url: string;
}

export declare interface IPrefab {
    name: string;
    uuid: string;
    data: INodeIdentifier;
    optimizationPolicy: OptimizationPolicy;
    persistent: boolean;
}

export declare interface IPrefabInfo {
    /** 关联的预制体资源信息 */
    asset?: IPrefab;
    root?: INodeIdentifier;
    instance?: IPrefabInstance;
    fileId: string;
    targetOverrides: ITargetOverrideInfo[];
    nestedPrefabInstanceRoots: INodeIdentifier[];
}

export declare interface IPrefabInstance {
    fileId: string;
    prefabRootNode?: INodeIdentifier;
    mountedChildren: IMountedChildrenInfo[];
    mountedComponents: IMountedComponentsInfo[];
    propertyOverrides: IPropertyOverrideInfo[];
    removedComponents: ITargetInfo[];
}

export declare interface IPrefabService extends IServiceEvents {
    /**
     * 将节点转换为预制体资源
     */
    createPrefabFromNode(params: ICreatePrefabFromNodeParams): Promise<INode>;
    /**
     * 将节点的修改应用回预制体资源
     */
    applyPrefabChanges(params: IApplyPrefabChangesParams): Promise<boolean>;
    /**
     * 重置节点到预制体原始状态
     */
    revertToPrefab(params: IRevertToPrefabParams): Promise<boolean>;
    /**
     * 解耦预制体实例，使其成为普通节点
     */
    unpackPrefabInstance(params: IUnpackPrefabInstanceParams): Promise<INode>;
    /**
     * 检查节点是否为预制体实例
     */
    isPrefabInstance(params: IIsPrefabInstanceParams): Promise<boolean>;
    /**
     * 获取节点的预制体信息
     */
    getPrefabInfo(params: IGetPrefabInfoParams): Promise<IPrefabInfo | null>;
    /**
     * 移除 prefab info
     * @param node
     * @param removeNested
     */
    removePrefabInfoFromNode(node: Node_2, removeNested?: boolean): void;
}

export declare interface IPrefabStateInfo {
    state: PrefabState;
    isUnwrappable: boolean;
    isRevertable: boolean;
    isApplicable: boolean;
    isAddedChild: boolean;
    isNested: boolean;
    assetUuid: string;
}

export declare interface IProject {
    /**
     * Gets the project directory path
     *
     * @returns {string} The project directory path
     */
    get path(): string;
    /**
     * Gets the project type (2d or 3d)
     *
     * @returns {'2d' | '3d'} The project type
     */
    get type(): '2d' | '3d';
    /**
     * Gets the package.json file path
     *
     * @returns {string} The path to package.json file
     */
    get pkgPath(): string;
    /**
     * Gets the temp directory path
     *
     * @returns {string} The path to the temporary directory
     */
    get tmpDir(): string;
    /**
     * Gets the library directory path
     *
     * @returns {string} The path to the library directory
     */
    get libraryDir(): string;
    /**
     * Opens the project and loads project information
     *
     * @returns {Promise<boolean>} Returns true if the project was opened successfully, false otherwise
     */
    open(projectPath: string): Promise<boolean>;
    /**
     * Closes the project and saves current project information
     *
     * @returns {Promise<boolean>} Returns true if the project was closed successfully, false otherwise
     */
    close(): Promise<boolean>;
    /**
     * Gets the complete project information
     *
     * @returns {ProjectInfo} The complete project information object
     */
    getInfo(): ProjectInfo;
    /**
     * Gets specific project information by key path
     *
     * @param {string} key - The key path to access nested properties (e.g., 'creator.version')
     * @returns {any} The value at the specified key path, or null if not found
     */
    getInfo(key: string): any;
    /**
     * Gets project information with optional key path
     *
     * @param {string} [key] - Optional key path to access nested properties
     * @returns {ProjectInfo | any} Project information or specific value
     */
    getInfo(key?: string): ProjectInfo | any;
    /**
     * Updates specific project information by key path or complete info
     *
     * @param {string | ProjectInfo} keyOrValue - Either a key path string or complete ProjectInfo object
     * @param {ProjectInfo} [value] - The value to set when using key path (required if keyOrValue is string)
     * @returns {Promise<boolean>} Returns true if update was successful, false otherwise
     */
    updateInfo<T>(keyOrValue: string | ProjectInfo, value?: T): Promise<boolean>;
}

/**
 * 组件的 dump 数据，以 IProperty 格式编码组件信息
 * 与 IComponent 不同，所有属性（包括 uuid, name, enabled）都通过 encodeObject 编码为 IProperty
 */
export declare interface IProperty {
    value: { [key: string]: IPropertyValueType } | IPropertyValueType;
    default?: any; // 默认值

    // 多选节点之后，这里存储多个数据，用于自行判断多选后的显示效果，无需更新该数据
    values?: ({ [key: string]: IPropertyValueType } | IPropertyValueType)[];

    lock?: { [key in keyof Vec4]?: IPropertyLock };

    cid?: string;
    type?: string;
    ui?: { name: string; data?: any }; // 是否用指定的 UI 组件，name 是组件的名称
    readonly?: boolean;
    visible?: boolean;
    name?: string;

    elementTypeData?: IProperty; // 数组里的数据的默认值 dump

    path?: string; // 数据的搜索路径，这个是由使用方填充的

    isArray?: boolean;
    invalid?: boolean;
    extends?: string[]; // 继承链
    displayName?: string; // 显示到界面上的名字
    displayOrder?: number; // 显示排序
    help?: string; // 帮助文档的 url 地址
    group?: IPropertyGroupOptions; // tab
    tooltip?: string; // 提示文本
    editor?: any; // 组件上定义的编辑器数据
    animatable?: boolean; // 是否可以在动画中编辑
    radioGroup?: boolean; // 是否渲染为 RadioGroup

    // Enum
    enumList?: any[]; // enum 类型的 list 选项数组

    bitmaskList?: any[];

    // Number
    min?: number; // 数值类型的最小值
    max?: number; // 数值类型的最大值
    step?: number; // 数值类型的步进值
    slide?: boolean; // 数组是否显示为滑块
    unit?: string; // 显示的单位
    radian?: boolean; // 标识是否为角度

    // Label
    multiline?: boolean; // 字符串是否允许换行
    // nullable?: boolean; 属性是否允许为空

    optionalTypes?: string[]; // 对属性是 object 且是可变类型的数据的支持，比如 render-pipeline

    userData?: { [key: string]: any }; // 用户透传的数据
}

export declare interface IPropertyGroupOptions {
    id: string // 默认 'default'
    name: string,
    displayOrder: number, // 默认 Infinity, 排在最后面
    style: string // 默认为 'tab'
}

export declare type IPropertyLock = { 
    default: number; 
    message: string 
};

export declare interface IPropertyOverrideInfo {
    targetInfo: ITargetInfo | null;
    propertyPath: string[];
    value?: any;
}

export declare type IPropertyValueType = IProperty | IProperty[] | null | undefined | number | boolean | string | Vec4 | Vec3 | Vec2 | Mat4 | any | Array<unknown>

export declare interface IQuat {
    x: number;
    y: number;
    z: number;
    w: number;
}

/**
 * 查询注册类的过滤选项
 */
export declare interface IQueryClassesOptions {
    extends?: string | string[];
    excludeSelf?: boolean;
}

/**
 * 查询组件的选项
 */
export declare interface IQueryComponentOptions {
    path: string;
}

export declare interface IQueryNodeParams {
    path: string;
    queryChildren: boolean;
    queryComponent: boolean;
}

export declare interface IQueryNodeTreeParams {
    path?: string;
}

export declare interface IRedirectInfo {
    // 跳转资源的类型
    type: string;
    // 跳转资源的 uuid
    uuid: string;
}

/**
 * 软刷新场景/预制体选项
 */
export declare interface IReloadOptions {
    urlOrUUID?: string;
}

/**
 * 删除组件的选项
 */
export declare interface IRemoveComponentOptions {
    path: string;
}

export declare interface IRevertToPrefabParams {
    nodePath: string;
}

/**
 * 保持场景/预制体选项
 */
export declare interface ISaveOptions {
    urlOrUUID?: string;
}

/**
 * 场景信息
 */
export declare interface IScene extends IBaseIdentifier {
    name: string;
    prefab: IPrefabInfo | null;
    children: INode[];
    components: IComponentIdentifier[];
}

export declare interface ISceneMouseEvent {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    wheelDeltaX: number;
    wheelDeltaY: number;
    moveDeltaX: number;
    moveDeltaY: number;
    leftButton: boolean;
    middleButton: boolean;
    rightButton: boolean;
    button: number;
    buttons: number;
    movementX: number;
    movementY: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    hitPoint?: any;
    type?: string;
    handleName?: string;
}

export declare interface ISceneViewService {
    init(): void;
    initFromConfig(): Promise<void>;
    saveConfig(): Promise<void>;
    setSceneLightOn(enable: boolean): void;
    querySceneLightOn(): boolean;
    onSceneOpened(scene: any): void;
    onSceneClosed(): void;
    onComponentAdded(comp: Component): void;
    onComponentRemoved(comp: Component): void;
}

export declare interface IScriptService extends IServiceEvents {
    investigatePackerDriver(): Promise<void>;
    loadScript(): Promise<void>;
    removeScript(): Promise<void>;
    scriptChange(): Promise<void>;
    queryScriptCid(uuid: string): Promise<string | null>;
    queryScriptName(uuid: string): Promise<string | null>;
    isCustomComponent(classConstructor: Function): boolean;
    suspend(condition: Promise<any>): void;
}

export declare interface ISelectionService {
    select(uuid: string): void;
    unselect(uuid: string): void;
    clear(): void;
    query(): string[];
    isSelect(uuid: string): boolean;
    reset(): void;
}

export declare interface IServiceEvents {
    onEditorOpened?(): void;
    onEditorReload?(): void;
    onEditorClosed?(): void;
    onEditorSaved?(): void;
    onNodeBeforeChanged?(node: Node_2): void;
    onBeforeRemoveNode?(node: Node_2): void;
    onBeforeAddNode?(node: Node_2): void;
    onNodeChanged?(node: Node_2, opts: IChangeNodeOptions): void;
    onBeforeNodeAdded?(node: Node_2): void;
    onAddNode?(node: Node_2): void;
    onRemoveNode?(node: Node_2): void;
    onNodeAdded?(node: Node_2): void;
    onNodeRemoved?(node: Node_2): void;
    onAddComponent?(comp: Component): void;
    onRemoveComponent?(comp: Component): void;
    onSetPropertyComponent?(comp: Component): void;
    onComponentAdded?(comp: Component): void;
    onComponentRemoved?(comp: Component): void;
    onBeforeRemoveComponent?(comp: Component): void;
    onComponentBeforeChanged?(node: Node_2): void;
    onBeforeComponentAdded?(name: string, node: Node_2): void;
    onComponentChanged?(name: string, opts: IChangeNodeOptions): void;
    onAssetDeleted?(uuid: string): void;
    onAssetChanged?(uuid: string): void;
    onAssetRefreshed?(uuid: string): void;
    onScriptExecutionFinished?(): void;
    onSelectionSelect?(uuid: string, uuids: string[]): void;
    onSelectionUnselect?(uuid: string, uuids: string[]): void;
    onSelectionClear?(): void;
}

export declare interface IServiceManager {
    Editor: IEditorService;
    Node: INodeService;
    Component: IComponentService;
    Script: IScriptService;
    Asset: IAssetService;
    Engine: IEngineService;
    Prefab: IPrefabService;
    Selection: ISelectionService;
    Operation: IOperationService;
    Undo: IUndoService;
    Camera: ICameraService;
    Gizmo: IGizmoService;
    SceneView: ISceneViewService;
}

/**
 * CLI 设置组件属性的选项
 */
export declare interface ISetPropertyOptions {
    componentPath: string;
    properties: {
        [key: string]: null | undefined | number | boolean | string | object | Array<unknown>;
    };
    record?: boolean;
}

/**
 * 编辑器设置组件属性的选项
 */
export declare interface ISetPropertyOptionsForEditor {
    uuid: string;
    path: string;
    dump: IProperty;
    record?: boolean;
}

export declare interface ISocketConfig {
    connection: (socket: any) => void;
    disconnect: (socket: any) => void;
}

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

export declare interface IStaticFileConfig {
    url: string;
    path: string;
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

export declare interface ITargetInfo {
    localID: string[];
}

export declare interface ITargetOverrideInfo {
    source: IComponentIdentifier | INodeIdentifier | null;
    sourceInfo: ITargetInfo | null;
    propertyPath: string[];
    target: INodeIdentifier | null;
    targetInfo: ITargetInfo | null;
}

export declare interface IUerDataConfigItem {
    key?: string; // 唯一标识符
    // 配置显示的名字，如果需要翻译，则传入 i18n:${key}
    label?: string;
    // 设置的简单说明
    description?: string;

    // 默认值
    default?: any;
    // 配置的类型
    type?: 'array' | 'object';
    itemConfigs?: IUerDataConfigItem[] | Record<string, IUerDataConfigItem>;
    render?: {
        ui: string;
        attributes?: Record<string, string | boolean | number>;
        items?: Array<{
            label: string;
            value: string;
        }>;
    };
}

export declare interface IUndoService {
    beginRecording(uuids: string[], options?: any): string;
    endRecording(commandId: string): void;
    cancelRecording(commandId: string): void;
    undo(): Promise<void>;
    redo(): Promise<void>;
    snapshot(): void;
    reset(): void;
    isDirty(): boolean;
}

export declare interface IUnpackPrefabInstanceParams {
    /** 要解耦的预制体实例节点 */
    nodePath: string;
    /** 递归解耦所有子预制体 */
    recursive?: boolean;
}

export declare interface IUpdateNodeParams {
    path: string;
    name?: string;
    properties?: Partial<INodeProperties>;
}

export declare interface IUpdateNodeResult {
    path: string;
}

export declare interface IVec3 {
    x: number;
    y: number;
    z: number;
}

export declare interface IVec3Like {
    x: number;
    y: number;
    z: number;
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

export declare type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export declare interface Mat4 {
    m00: number;
    m01: number;
    m02: number;
    m03: number;

    m04: number;
    m05: number;
    m06: number;
    m07: number;

    m08: number;
    m09: number;
    m10: number;
    m11: number;

    m12: number;
    m13: number;
    m14: number;
    m15: number;
}

export declare namespace Mcp {
    export {
        register,
        unregister,
        getStatus
    }
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

export declare function migrate(): Promise<void>;

export declare function migrateFromProject(): Promise<IConfiguration>;

export declare interface Migration {
    version: string;
    migrate(moduleCache: Record<string, boolean>): Record<string, boolean>;
}

export declare enum MobilityMode {
    /**
     * @en Static node
     * @zh 静态节点
     */
    Static = 0,
    /**
     * @en Stationary node
     * @zh 固定节点
     */
    Stationary = 1,
    /**
     * @en Movable node
     * @zh 可移动节点
     */
    Movable = 2
}

export declare interface ModuleRenderConfig {
    $schema?: string;

    /**
     * The modules info
     */
    features: Features;

    /**
     * The categories info
     */
    categories: { [category: string]: CategoryInfo };

    version: string;

    /**
     * The script to migrate, this script should export a const migrations: Migration[]`.
     */
    migrationScript?: string;
}

/**
 * Move Asset // 移动资源
 */
export declare function moveAsset(source: string, target: string, options?: AssetOperationOption): Promise<any>;

export declare enum NodeEventType {
    TRANSFORM_CHANGED = "transform-changed",// 节点改变位置、旋转或缩放事件
    SIZE_CHANGED = "size-changed",// 当节点尺寸改变时触发的事件
    ANCHOR_CHANGED = "anchor-changed",// 当节点锚点改变时触发的事件
    CHILD_ADDED = "child-added",// 节点子类添加
    CHILD_REMOVED = "child-removed",// 节点子类移除
    PARENT_CHANGED = "parent-changed",// 父节点改变时触发的事件
    CHILD_CHANGED = "child-changed",// 子节点改变时触发的事件
    COMPONENT_CHANGED = "component-changed",// 组件数据发生改变时
    ACTIVE_IN_HIERARCHY_CHANGE = "active-in-hierarchy-changed",// 节点在hierarchy是否激活
    NOTIFY_NODE_CHANGED = "notify-node-changed",
    PREFAB_INFO_CHANGED = "prefab-info-changed",// prefab数据改变
    LIGHT_PROBE_CHANGED = "light-probe-changed",// 光照探针数据改变
    SET_PROPERTY = "set-property",// 设置节点上的属性
    MOVE_ARRAY_ELEMENT = "move-array-element",// 调整一个数组类型的数据内某个 item 的位置
    REMOVE_ARRAY_ELEMENT = "remove-array-element",// 删除一个数组元素
    CREATE_COMPONENT = "create-component",// 创建一个组件
    RESET_COMPONENT = "reset-component"
}

export declare enum NodeType {
    EMPTY = "Empty",// 空节点
    TERRAIN = "Terrain",// 地形节点
    CAMERA = "Camera",// 摄像机节点(需要用过 TWorkMode 来区分 2D 和 3D)
    SPRITE = "Sprite",// 精灵节点(需要用过 TWorkMode 来区分 2D 和 3D)
    SPRITE_SPLASH = "SpriteSplash",// 单色
    GRAPHICS = "Graphics",// 图形节点
    LABEL = "Label",// 文本节点
    MASK = "Mask",// 遮罩节点
    PARTICLE = "Particle",// 粒子节点(需要用过 TWorkMode 来区分 2D 和 3D)
    TILED_MAP = "TiledMap",// 瓦片地图节点
    CAPSULE = "Capsule",// 胶囊体节点
    CONE = "Cone",// 圆锥体节点
    CUBE = "Cube",// 立方体节点
    CYLINDER = "Cylinder",// 圆柱体节点
    PLANE = "Plane",// 平面节点
    QUAD = "Quad",// 四边形节点
    SPHERE = "Sphere",// 球体节点
    TORUS = "Torus",// 圆环体节点
    BUTTON = "Button",// 按钮节点
    CANVAS = "Canvas",// 画布节点(需要用过 TWorkMode 来区分 2D 和 3D)
    EDIT_BOX = "EditBox",// 输入框节点
    LAYOUT = "Layout",// 布局节点
    PAGE_VIEW = "PageView",// 页面视图节点
    PROGRESS_BAR = "ProgressBar",// 进度条节点
    RICH_TEXT = "RichText",// 富文本节点
    SCROLL_VIEW = "ScrollView",// 滚动视图节点
    SLIDER = "Slider",// 滑动条节点
    TOGGLE = "Toggle",// 切换节点
    TOGGLE_GROUP = "ToggleGroup",// 切换组节点
    VIDEO_PLAYER = "VideoPlayer",// 视频播放器节点
    WEB_VIEW = "WebView",// 网页视图节点
    WIDGET = "Widget",// 小部件节点
    DIRECTIONAL_LIGHT = "Light-Directional",// 平行光
    SPHERE_LIGHT = "Light-Sphere",// 球面光
    SPOT_LIGHT = "Light-Spot",// 聚光灯
    PROBE_LIGHT = "Light-Probe-Group",// 光照探针
    REFLECTION_LIGHT = "Light-Reflection-Probe"
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

/**
 * Listen to Asset Added Event // 监听资源添加事件
 * @param listener Callback function that receives asset information
 * @returns Function to remove the listener
 *
 * 推荐用法：
 * ```typescript
 * const removeListener = onAssetAdded((info) => {
 *     console.log(`资源已添加: ${info.name}`);
 *     console.log(`  逻辑路径: ${info.url}`);
 *     console.log(`  物理路径: ${info.file}`);
 * });
 * // 稍后移除监听
 * removeListener();
 * ```
 */
export declare function onAssetAdded(listener: (info: IAssetInfo) => void): () => void;

/**
 * Listen to Asset Changed Event // 监听资源变更事件
 * @param listener Callback function that receives asset information
 * @returns Function to remove the listener
 *
 * 推荐用法：
 * ```typescript
 * const removeListener = onAssetChanged((info) => {
 *     console.log(`资源已变更: ${info.name}`);
 * });
 * // 稍后移除监听
 * removeListener();
 * ```
 */
export declare function onAssetChanged(listener: (info: IAssetInfo) => void): () => void;

/**
 * Listen to Asset Removed Event // 监听资源删除事件
 * @param listener Callback function that receives asset information
 * @returns Function to remove the listener
 *
 * 推荐用法：
 * ```typescript
 * const removeListener = onAssetRemoved((info) => {
 *     console.log(`资源已删除: ${info.name}`);
 * });
 * // 稍后移除监听
 * removeListener();
 * ```
 */
export declare function onAssetRemoved(listener: (info: IAssetInfo) => void): () => void;

/**
 * Register listener for when a specific database finishes starting.
 *
 * 注册单个数据库启动完成后的事件监听。
 *
 * **注意事项 (Notice)**:
 * - 这个事件可能会被触发多次（如果项目存在多个子数据库，如 `assets`, `internal`）。
 * - 主要用于需要做更精细化并行控制的上层逻辑，通常情况下普通的业务逻辑不需要关心此事件，直接监听 `onReady` 即可。
 *
 * @param listener 回调函数，接收启动完成的 dbInfo
 * @returns 移除监听的函数
 */
export declare function onDBReady(listener: (dbInfo: IAssetDBInfo) => void): () => void;

/**
 * 注册 configurationManager 保存事件的监听器
 * 每次 cocos.config.json 被写入磁盘时触发
 * @returns 取消监听的函数
 */
export declare function onDidSave(callback: () => void): () => void;

/**
 * Register listener for initialization progress.
 *
 * 注册初始化过程中的进度监听。
 *
 * **注意事项 (Notice)**:
 * - **仅在启动阶段有效**。一旦触发过一次 `ready` 事件（即启动阶段结束），将不再会有新的进度消息。
 * - 启动时的资源冷导入会抛出密集的进度信息，建议在 UI 层面进行适当的节流（throttle）渲染。
 *
 * @param listener 回调函数，包含当前进度、总数、当前处理的资源 url 和导入状态
 * @returns 移除监听的函数
 */
export declare function onProgress(listener: (current: number, total: number, url: string, state: 'processing' | 'success' | 'failed') => void): () => void;

/**
 * Register listener for when all asset databases are fully initialized.
 *
 * 注册数据库初始化完全完成后的事件监听。
 *
 * **注意事项 (Notice)**:
 * - 触发此事件代表**所有**注册的资源数据库都已经完全导入并初始化完成（启动阶段结束）。
 * - 收到此事件后，表示所有的资源查询、操作 API 都可以安全调用。
 * - 第一次 ready 后，将不再有 progress 进度消息。
 *
 * @param listener 回调函数
 * @returns 移除监听的函数
 */
export declare function onReady(listener: () => void): () => void;

export declare function open_2(projectPath: string): Promise<void>;

export declare type OperationEvent = SceneDragEvent | SceneKeyboardEvent | SceneMouseEvent | 'resize';

export declare enum OptimizationPolicy {
    AUTO = 0,
    SINGLE_INSTANCE = 1,
    MULTI_INSTANCE = 2
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

export declare enum PrefabState {
    NotAPrefab = 0,// Normal node, not a Prefab
    PrefabChild = 1,// Child node of a Prefab, without PrefabInstance
    PrefabInstance = 2,// Root node of a Prefab that contains a PrefabInstance
    PrefabLostAsset = 3
}

export declare class ProgrammingFacet {
    private _packerDriverUpdateCount;
    private _asyncIteration;
    static create(engine: IEngineOptions, projectPath: string): Promise<ProgrammingFacet>;
    get engineRoot(): string;
    get engineDistRoot(): string;
    get systemJsHomeDir(): string;
    get systemJsIndexFile(): string;
    get engineImportMapURL(): string;
    get packImportMapURL(): string;
    get packResolutionDetailMapURL(): string;
    loadPackResource(url: string): Promise<{
        type: "json";
        json: unknown;
    } | {
        type: "chunk";
        chunk: ChunkInfo;
    }>;
    getGlobalImportMap(): Promise<ImportMap & {
        imports: NonNullable<ImportMap["imports"]>;
    }>;
    private reload;
    notifyPackDriverUpdated(): Promise<any>;
    private _staticImportMap;
    private _engineRoot;
    private _engineDistRoot;
    private _systemJsHomeDir;
    private _systemJsBundleFileName;
    private _engineStatsQuery;
    private _quickPackLoader;
    private constructor();
    private _getQuickPackLoader;
    private _initialize;
    private _buildSystemJs;
    private _resetQuickPackLoader;
}

export declare namespace Project {
    export {
        init_5 as init,
        open_2 as open,
        close_2 as close,
        getInfo_2 as getInfo,
        get_2 as get
    }
}

export declare class Project_2 implements IProject {
    /**
     * The version of the Project
     */
    static readonly version = "4.0.0";
    private _projectPath;
    private _type;
    private _pkgPath;
    private _tmpDir;
    private _libraryDir;
    private _info;
    get path(): string;
    get type(): '2d' | '3d';
    static getPackageJsonPath(projectPath: string): string;
    get pkgPath(): string;
    get tmpDir(): string;
    get libraryDir(): string;
    static create(projectPath: string, type?: ProjectType): Promise<boolean>;
    getInfo(): ProjectInfo;
    getInfo(key: string): any;
    updateInfo<T>(keyOrValue: string | ProjectInfo, value?: T): Promise<boolean>;
    open(projectPath: string): Promise<boolean>;
    close(): Promise<boolean>;
    /**
     * Generates project information object
     *
     * @param {string} projectPath - The project directory path
     * @param {ProjectType} type - The project type (2d or 3d)
     * @returns {ProjectInfo} Generated project information
     */
    private static generateProjectInfo;
    /**
     * Validates if the project information is valid
     *
     * @param {ProjectInfo} info - The project information to validate
     * @returns {boolean} Returns true if the project info is valid, false otherwise
     */
    private isValid;
}

/**
 * Project creator information
 */
export declare interface ProjectCreatorInfo {
    /**
     * Version of the tool or engine used to create the project
     */
    version: string;

    /**
     * Dependencies of the project
     * - key: package name
     * - value: version number
     */
    dependencies?: {
        [name: string]: string,
    };

    /**
     * Registry configuration for package management
     */
    registry?: {
        /**
         * Remote repository configuration (e.g., npm, private registry)
         */
        remote?: {};
    };
}

/**
 * Project information
 */
export declare interface ProjectInfo {
    /**
     * Project name
     */
    name: string;

    /**
     * Project type ('2d' or '3d')
     */
    type: ProjectType;

    /**
     * Project version
     */
    version: string;

    /**
     * Unique identifier (UUID) of the project
     */
    uuid: string;

    /**
     * Information about the creator of the project
     */
    creator: ProjectCreatorInfo;

    /**
     * Other additional properties (flexible extension)
     */
    [key: string]: any;
}

/**
 * Project type
 * - '2d': 2D Project
 * - '3d': 3D Project
 */
export declare type ProjectType = '2d' | '3d';

/**
 * Query Asset Config Map // 查询资源配置映射表
 */
export declare function queryAssetConfigMap(): Promise<Record<string, IAssetConfig>>;

/**
 * Query All Asset Database Info // 查询所有资源数据库信息
 */
export declare function queryAssetDBInfos(): Promise<Record<string, IAssetDBInfo>>;

/**
 * Query Asset Dependencies // 查询资源依赖
 */
export declare function queryAssetDependencies(uuidOrUrl: string, type?: QueryAssetType): Promise<string[]>;

/**
 * Query Asset Info // 查询资源信息
 */
export declare function queryAssetInfo(urlOrUUIDOrPath: string, dataKeys?: string[] | undefined): Promise<IAssetInfo | null>;

/**
 * Batch Query Asset Info // 批量查询资源信息
 */
export declare function queryAssetInfos(options?: QueryAssetsOption): Promise<IAssetInfo[]>;

/**
 * Query Asset Metadata // 查询资源元数据
 */
export declare function queryAssetMeta(urlOrUUIDOrPath: string): Promise<IAssetMeta<'unknown'> | null>;

export declare interface QueryAssetsOption {
    ccType?: string | string[], // 'cc.ImageAsset' 这类，多个用数组
    isBundle?: boolean, // 筛选 asset bundle 信息，搜索子包只能与 pattern 选项共存
    importer?: string | string[], // 导入名称，多个用数组
    pattern?: string, // 路径匹配，globs 格式
    extname?: string | string[], // 扩展名匹配，多个用数组

    // 筛选一些符合 userData 配置的资源
    userData?: Record<string, boolean | string | number>;

    /**
     * @deprecated use ccType instead
     */
    type?: string;
}

export declare type QueryAssetType = 'asset' | 'script' | 'all';

/**
 * Query Asset User Data Config // 查询资源用户数据配置
 */
export declare function queryAssetUserDataConfig(urlOrUuidOrPath: string): Promise<false | Record<string, IUerDataConfigItem> | undefined>;

/**
 * Query Asset Users // 查询资源使用者
 */
export declare function queryAssetUsers(uuidOrUrl: string, type?: QueryAssetType): Promise<string[]>;

/**
 * Query Creatable Asset Map // 查询可创建资源映射表
 */
export declare function queryCreateMap(): Promise<ICreateMenuInfo[]>;

export declare function queryLayerBuiltin(): Promise<{
    name: string;
    value: number;
}[]>;

/**
 * Query Asset Path // 查询资源路径
 */
export declare function queryPath(urlOrUuid: string): Promise<string>;

/**
 * Query Sorted Plugin Scripts // 查询排序后的插件脚本
 */
export declare function querySortedPlugins(filterOptions?: FilterPluginOptions): Promise<IPluginScriptInfo[]>;

export declare function querySortingLayerBuiltin(): Promise<readonly __private._cocos_sorting_sorting_layers__SortingItem[]>;

/**
 * Query Thumbnail Handlers // 查询支持缩略图生成的资源处理器列表
 */
export declare function queryThumbnailHandlers(): string[];

/**
 * Query Asset URL // 查询资源 URL
 */
export declare function queryUrl(uuidOrPath: string): Promise<string>;

/**
 * Query Asset UUID // 查询资源 UUID
 */
export declare function queryUUID(urlOrPath: string): Promise<string | null>;

/**
 * Refresh Asset Directory // 刷新资源目录
 */
export declare function refresh(dir: string): Promise<number>;

/**
 * MCP Facade Module
 *
 * Called by the cocos-code utility process to register MCP middleware
 * in an already-initialized environment.
 * Prerequisite: the Server module must be started before calling this module.
 * This module only handles MCP-specific work: populating the toolRegistry
 * and registering MCP routes on the running server.
 */
/**
 * Register MCP middleware on the running server.
 *
 * Note: the Express server must already be started via the Server module.
 * This function only:
 * 1. Imports API modules to populate the toolRegistry (@tool decorator side-effects)
 * 2. Creates McpMiddleware and registers routes on the server
 *
 * @returns MCP endpoint URL (e.g. http://localhost:9527/mcp)
 */
export declare function register(): Promise<string>;

/**
 * Register a middleware contribution (routes, static files, sockets)
 * on the running server.
 *
 * @param name   Middleware identifier
 * @param module Middleware contribution config
 */
export declare function register_2(name: string, module: IMiddlewareContribution): Promise<void>;

/**
 * Reimport Asset // 重新导入资源
 */
export declare function reimportAsset(pathOrUrlOrUUID: string): Promise<IAssetInfo>;

export declare function reload(): Promise<void>;

/**
 * 重载结果
 */
export declare enum ReloadResult {
    SUCCESS = 0,
    FAILED = 1,
    QUEUED = 2,
    NO_EDITOR = 3,
    ASSET_NOT_FOUND = 4,
    EDITOR_NOT_FOUND = 5
}

export declare function remove(key: string, scope?: ConfigurationScope): Promise<boolean>;

/**
 * Rename Asset // 重命名资源
 */
export declare function renameAsset(source: string, newName: string, options?: AssetOperationOption): Promise<any>;

/** 渲染纹理资源的 userData */
export declare interface RenderTextureAssetUserData extends TextureBaseAssetUserData {
    width: number;
    height: number;
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

export declare function save(force?: boolean): Promise<void>;

/**
 * Save Asset // 保存资源
 */
export declare function saveAsset(pathOrUrlOrUUID: string, data: string | Buffer): Promise<IAssetInfo>;

export declare namespace Scene {
    export {
        init_6 as init,
        startupWorker
    }
}

/**
 * 场景模板类型
 */
export declare const SCENE_TEMPLATE_TYPE: readonly ["2d", "3d", "quality"];

export declare type SceneDragEvent = 'onDragLeave' | 'onDragOver' | 'onDrop';

export declare type SceneKeyboardEvent = 'keydown' | 'keyup';

export declare type SceneMouseEvent = 'dblclick' | 'mousedown' | 'mousemove' | 'mouseup' | 'mousewheel';

export declare namespace Scripting {
    export {
        init_7 as init,
        initProgrammingFacet,
        getProgrammingFacet,
        startCompileScript,
        SharedSettings,
        IPluginScriptInfo,
        FilterPluginOptions
    }
}

/** JavaScript 脚本模块的 userData */
export declare interface ScriptModuleUserData {
    isPlugin: false;
}

export declare interface SerializedAssetFinder {
    meshes?: Array<string | null>;
    animations?: Array<string | null>;
    skeletons?: Array<string | null>;
    textures?: Array<string | null>;
    materials?: Array<string | null>;
    scenes?: Array<string | null>;
}

export declare namespace Server {
    export {
        start_2 as start,
        stop_2 as stop,
        getUrl,
        register_2 as register,
        getStatus_2 as getStatus
    }
}

export declare function set<T>(key: string, value: T, scope?: ConfigurationScope): Promise<boolean>;

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
 * Start Asset DB // 启动资源数据库，开始扫描和导入资源
 */
export declare function start(): Promise<void>;

/**
 * Server Facade Module
 *
 * Provides a simplified interface for managing the Express HTTP server.
 * Wraps the core server service with startup guards and status tracking.
 */
/**
 * Initialize and start the Express HTTP server.
 *
 * @param port Optional port number; auto-selected if omitted
 * @returns The server base URL (e.g. http://localhost:9527)
 */
export declare function start_2(port?: number): Promise<string>;

/**
 * 在独立的子进程中运行项目脚本编译
 * 以避免阻塞主进程
 */
export declare function startCompileScript(assetChanges?: AssetChangeInfo[]): Promise<void>;

export declare function startEngineCompilation(force?: boolean): Promise<void>;

/**
 * Start the scene worker process.
 *
 * @param projectPath Path to the project directory
 */
export declare function startupWorker(projectPath: string): Promise<void>;

/**
 * Stop the Express HTTP server.
 */
export declare function stop_2(): Promise<void>;

/** 支持创建的资源类型常量数组（用于 Zod enum 和 TypeScript type） */
export declare const SUPPORT_CREATE_TYPES: readonly ["animation-clip", "typescript", "auto-atlas", "effect", "scene", "prefab", "material", "terrain", "physics-material", "label-atlas", "render-texture", "directory", "effect-header"];

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

export declare type TEditorEntity = IScene | INode;

export declare type TEditorInstance = Scene_2 | Node_2;

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

export declare interface ThumbnailInfo {
    type: 'icon' | 'image',
    value: string; // 具体 icon 名字或者 image 路径，image 路径支持绝对路径、 db:// 、 project:// 、和 packages:// 下的路径
}

export declare type ThumbnailSize = 'large' | 'small' | 'middle' | 'origin';

export declare type TSceneTemplateType = typeof SCENE_TEMPLATE_TYPE[number];

/**
 * Clean up MCP state.
 * Note: does NOT stop the Express server — use the Server module for that.
 */
export declare function unregister(): Promise<void>;

/**
 * Update Asset User Data // 更新资源用户数据
 */
export declare function updateAssetUserData(urlOrUuidOrPath: string, path: string, value: any): Promise<any>;

/**
 * Update Default User Data // 更新默认用户数据
 */
export declare function updateDefaultUserData(handler: string, path: string, value: any): Promise<void>;

export declare interface Vec2 {
    x: number;
    y: number;
}

export declare interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export declare interface Vec4 {
    x: number;
    y: number;
    z: number;
    w: number;
}

export declare type WrapMode = 'repeat' | 'clamp-to-edge' | 'mirrored-repeat';

export { }
