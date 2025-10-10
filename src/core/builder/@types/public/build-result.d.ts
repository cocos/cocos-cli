/**
 * settings.js 里定义的数据
 */

import { ISplashSetting, ICustomJointTextureLayout, UUID, IPhysicsConfig, IOrientation } from './options';

// ****************************** settings ************************************************

// debug: true
// designResolution: {width: "960", height: "640", policy: 4}
// jsList: ["assets/resources/b.js", "assets/resources/a.js"]
// launchScene: "db://assets/New Scene-001.scene"
// platform: "web-desktop"
// rawAssets: {
//     assets: {
//         "0e95a9f8-d4e7-4849-875a-7a11dd692b34": ["mesh/env/gltf/textures/birch_yellow_mat_baseColor.png", "cc.ImageAsset"]
//     }
//     internal: {
//         "1baf0fc9-befa-459c-8bdd-af1a450a0319": ["effects/builtin-standard.effect", "cc.EffectAsset"]
//     }
// }
// scenes: [{url: "db://assets/New Scene-001.scene", uuid: "69dc4a42-cc6c-49fb-9a57-7de0c212f83d"},…]
// startScene: "current_scene"

export interface ISettings {
    CocosEngine: string;
    engine: {
        debug: boolean;
        macros: Record<string, any>;
        customLayers: { name: string, bit: number }[];
        sortingLayers: { id: number, name: string, value: number }[];
        platform: string;
        engineModules?: string[];
        builtinAssets: string[];
    };
    physics?: IPhysicsConfig;
    rendering: {
        renderPipeline: string;
        renderMode?: number;
        // effect.bin
        effectSettingsPath?: string;
        customPipeline?: boolean;
    };
    assets: {
        server: string;
        remoteBundles: string[];
        bundleVers: Record<string, string>;
        preloadBundles: { bundle: string, version?: string }[];
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

export interface IPackageInfo {
    name: string;
    path: string;
    uuids: UUID[];
}

export interface ISettingsDesignResolution {
    width: number;
    height: number;
    policy: number;
}

interface IAssetPathBase {
    bundleName?: string;
    redirect?: string; // 重定向的 bundle 包名
}

export interface IRawAssetPathInfo extends IAssetPathBase {
    raw: string[];
}
export declare interface IAssetPathInfo extends IAssetPathBase {
    raw?: string[];

    // import: 该资源在 import 目录下的路径，包括 .json 和 .bin 文件
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

/**
 * @deprecated please use `IImportAssetPathInfo` instead
 */
export type IJsonPathInfo = IImportAssetPathInfo;

export interface IImportAssetPathInfo extends IAssetPathBase {
    // import: 该资源在 import 目录下的路径，包括 .json 和 .bin 文件
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

export interface IBuildPaths {
    dir: string; // 构建资源输出地址（ assets 所在的目录，并不一定与构建输出目录对应）
    readonly output: string; // 标准的构建输出目录，不可修改
    effectBin?: string; // effect.bin 输出地址
    settings: string; // settings.json 输出地址
    systemJs?: string; // system.js 生成地址
    engineDir?: string; // 引擎生成地址
    polyfillsJs?: string; // polyfill.js 生成地址
    assets: string; // assets 目录
    subpackages: string; // subpackages 目录
    remote: string; // remote 目录
    bundleScripts: string // bundle 的脚本，某些平台无法下载脚本，则将远程包中的脚本移到本地
    applicationJS: string; // application.js 的生成地址
    compileConfig: string; // cocos.compile.config.json
    importMap: string; // import-map 文件地址
    engineMeta: string; // 引擎构建结果的 meta 文件路径

    plugins: Record<string, string>;
    hashedMap: Record<string, string>; // 用于记录被编辑器添加过 md5 hash 值的路径 map
}

export declare class IBuildResult {
    dest: string; // options 指定的构建目录

    paths: IBuildPaths; // 构建后资源相关地址集合

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

export interface IBundleConfig {
    importBase: string; // bundle 中 import 目录的名称，通常是 'import'
    nativeBase: string; // native 中 native 目录的名称，通常是 'native'
    name: string; // bundle 的名称，可以通过 bundle 名称加载 bundle
    deps: string[]; // 该 bundle 依赖的其他 bundle 名称
    uuids: UUID[]; // 该 bundle 中的所有资源的 uuid
    paths: Record<string, any[]>; // 该 bundle 中可以通过路径加载的资源，参考以前 settings 中 rawAssets 的定义
    scenes: Record<string, UUID | number>; // 该 bundle 中所有场景，场景名为 key, uuid 为 value
    packs: Record<UUID, Array<UUID | number>>; // 该 bundle 中所有合并的 json, 参考以前 settings 中 packedAssets 的定义
    versions: { import: Array<UUID | number>, native: Array<UUID | number> }; // 该 bundle 中所有资源的版本号，参考以前 settings 中 md5AssetsMap 的定义
    redirect: Array<string | number>; // 该 bundle 中重定向到其他 bundle 的资源
    debug: boolean; // 是否是 debug 模式，debug 模式会对 config.json 的数据进行压缩，所以运行时得解压
    types?: string[]; // paths 中的类型数组，参考以前 settings 中 assetTypes 的定义
    encrypted?: boolean; // 原生上使用，标记该 bundle 中的脚本是否加密
    isZip?: boolean; // 是否是 zip 模式
    zipVersion?: string;
    extensionMap: Record<string, Array<UUID | number>>;
    /**
     * 是否有需要预加载的脚本，默认为 `true`。
     */
    hasPreloadScript: boolean;
    dependencyRelationships: Record<string, Array<UUID | number>>;
}

export interface ICompressConfig {
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
