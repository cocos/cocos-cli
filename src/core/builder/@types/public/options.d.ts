import * as babel from '@babel/core';
import { ITextureCompressPlatform, ITextureCompressType, PlatformCompressConfig } from './texture-compress';
import { BuildTemplateConfig, IBuildTaskOption, IPlatformType } from '../protected';
import { IFlags } from '@cocos/creator-types/editor/packages/engine/@types'
import { StatsQuery } from '@cocos/ccbuild';
import { EngineInfo, EngineConfig } from '../../../engine/@types/public';
import { extend } from 'lodash';

export type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type ISortType = 'taskName' | 'createTime' | 'platform' | 'buildTime';

export interface IPhysicsConfig {
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
// 物理配置
export interface ICollisionMatrix {
    [x: string]: number;
}
export interface IVec3Like {
    x: number;
    y: number;
    z: number;
}
export interface IPhysicsMaterial {
    friction: number; // 0.5
    rollingFriction: number; // 0.1
    spinningFriction: number; // 0.1
    restitution: number; // 0.1
}
export type IConsoleType = 'log' | 'warn' | 'error' | 'debug' | 'info' | 'success' | 'ready' | 'start';

export type BreakType = 'cancel' | 'crashed' | 'refreshed' | 'interrupted' | '';
export type ICustomConsoleType = IConsoleType | 'group' | 'groupEnd' | 'groupCollapsed';

export interface IConsoleMessage {
    type: ICustomConsoleType,
    value: string;
    num: number;
    time: string;
}
export interface IPlatformConfig {
    texture: PlatformCompressConfig;
    // TODO 后续废弃，统一使用 platformType
    type: IPlatformType;
    platformType: StatsQuery.ConstantManager.PlatformType;
    name: string;
    createTemplateLabel: string;
}

interface IBinGroupConfig {
    enable: boolean;
    threshold: number;
}

export interface IBuildCacheUseConfig {
    serializeData?: boolean; // 序列化结果
    engine?: boolean;
    textureCompress?: boolean;
    autoAtlas?: boolean;
}

export interface IBuildCommonOptions {
    taskId?: string; // 指定构建任务 id，可选
    logDest?: string; // 任务的指定构建输出地址，可选
    name: string; // 游戏名称
    outputName: string;
    // 构建后的游戏文件夹生成的路径
    buildPath: string;
    taskName: string;
    platform: Platform;
    scenes: IBuildSceneItem[];
    skipCompressTexture: boolean;
    packAutoAtlas: boolean;
    sourceMaps: boolean | 'inline';
    experimentalEraseModules: boolean;
    bundleCommonChunk: boolean;

    startScene: string;

    debug: boolean;
    mangleProperties: boolean;
    inlineEnum: boolean; // 内联枚举
    inlineSpriteFrames: boolean;
    md5Cache: boolean;
    polyfills?: IPolyFills;
    buildScriptTargets?: string;
    // bundle 设置
    mainBundleCompressionType: BundleCompressionType;
    mainBundleIsRemote: boolean;
    server?: string; // 服务器地址
    startSceneAssetBundle: boolean; // 配置初始场景为远程包
    bundleCommonJs?: string;
    binGroupConfig?: IBinGroupConfig;

    // 移除远程包 Bundle 的脚本, 小游戏平台将会自动勾选
    moveRemoteBundleScript: boolean;

    // 是否使用自定义插屏选项
    useSplashScreen?: boolean;

    /**
     * 是否是预览进程发送的构建请求。
     * @default false
    */
    preview?: boolean;
    stage?: string; // 构建阶段指定，默认为 build 可指定为 make/run 等
    buildMode?: 'normal' | 'bundle' | 'script';
    nextStages?: string[];
    // 构建阶段性任务绑定分组
    // buildStageGroup?: Record<string, string[]>;
    nativeCodeBundleMode: 'wasm' | 'asmjs' | 'both';
    wasmCompressionMode?: 'brotli';
    buildBundleOnly?: boolean; // 仅构建 Bundle
    // 构建 Bundle 的指定包含传参，未传递时按照项目内所有 Bundle 的原始配置打包
    // name 有一定的计算规则，作为选填项
    bundleConfigs?: IBundleOptions[];
    /**
     * @deprecated please use engineModulesConfigKey
     */
    overwriteProjectSettings?: {
        macroConfig?: {
            cleanupImageCache: string;
        },
        includeModules?: {
            physics?: 'inherit-project-setting' | string;
            'physics-2d'?: 'inherit-project-setting' | string;
            'gfx-webgl2'?: 'inherit-project-setting' | 'on' | 'off';
            [key?: string]: string;
        };
    };
}

export interface OverwriteProjectSettings extends EngineConfig {
    engineInfo: EngineInfo;
}

export interface IBuildOptionBase extends IBuildCommonOptions, OverwriteProjectSettings {
    engineModulesConfigKey?: string; // 3.8.6 新增的多模块裁切
    useCacheConfig?: IBuildCacheUseConfig;
}

export interface BundleFilterConfig {
    range: 'include' | 'exclude';
    type: 'asset' | 'url';
    patchOption?: {
        patchType: 'glob' | 'beginWith' | 'endWith' | 'contain';
        value: string;
    };
    assets?: string[];
}

export interface IBundleOptions {
    root: string, // bundle 的根目录, 开发者勾选的目录，如果是 main 包等内置 Bundle，这个字段任意字符串均可
    priority?: number, // bundle 的优先级
    compressionType?: BundleCompressionType, // bundle 的压缩类型
    isRemote?: boolean, // bundle 是否是远程包
    output?: boolean, // 是否输出此 bundle 包（默认为 true）
    name: string;
    // isEncrypted: boolean // bundle 中的代码是否加密，原生平台使用

    dest?: string, // bundle 的输出目录
    scriptDest?: string, // 脚本的输出地址
    bundleFilterConfig?: BundleFilterConfig[];
}


export interface IBundleTaskOption extends IBuildTaskOption {
    dest: string;
}

export type UUID = string;


/**
 * 构建使用的场景的数据
 */
export interface IBuildSceneItem {
    url: string;
    uuid: string;
}

export interface IPolyFills {
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

export interface IBuildSystemJsOption {
    dest: string;
    platform: string;
    debug: boolean;
    sourceMaps: boolean | 'inline';
    hotModuleReload?: boolean;
}

interface ICompressPresetConfig {
    name: string;
    options: Record<ITextureCompressPlatform, Record<ITextureCompressType, { quality: number | string }>>;
}
export interface ITextureCompressConfigs {
    userPreset: Record<string, ICompressPresetConfig>;
    genMipmaps: boolean;
    customConfigs: Record<string, ICompressPresetConfig>;
}

// **************************** options *******************************************
export type Platform =
    | 'web-desktop'
    | 'web-mobile'
    | 'wechatgame'
    | 'wechatprogram'
    | 'oppo-mini-game'
    | 'vivo-mini-game'
    | 'huawei-quick-game'
    | 'honor-mini-game'
    | 'migu-mini-game'
    | 'alipay-mini-game'
    | 'taobao-creative-app'
    | 'taobao-mini-game'
    | 'mac'
    | 'ios'
    | 'linux'
    | 'android'
    | 'google-play'
    | 'ohos'
    | 'harmonyos-next'
    | 'windows'
    | 'xiaomi-quick-game'
    | 'baidu-mini-game'
    | 'bytedance-mini-game'
    | 'cocos-play'
    | 'huawei-agc'
    ;
export type BundleCompressionType = 'none' | 'merge_dep' | 'merge_all_json' | 'subpackage' | 'zip';

export type IModules = 'esm' | 'commonjs' | 'systemjs';
export interface ITransformOptions {
    importMapFormat: IModules;
    plugins?: babel.PluginItem[];
    loose?: boolean;
}

export type IBuildStage = 'build' | 'bundle' | 'make' | 'run' | string;

export type ITaskState = 'waiting' | 'success' | 'failure' | 'cancel' | 'processing' | 'none';

export interface ITaskItemJSON {
    id: string;
    progress: number;
    state: ITaskState;
    // 当前任务的主信息
    message: string;
    // 当前任务的详细日志信息
    detailMessage?: string;
    time: string;
}

export interface IBuildTaskItemJSON extends ITaskItemJSON {
    stage: 'build' | string;
    options: IBuildTaskOption;
    dirty: boolean;
    rawOptions?: IBuildTaskOption;
    type: 'build',
}

export type IOrientation = 'auto' | 'landscape' | 'portrait';
