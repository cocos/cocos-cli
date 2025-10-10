import { StatsQuery } from '@cocos/ccbuild';
import { IPolyFills, IBuildDesignResolution, IBuildOptionBase, IBuildTaskOption, ITaskItemJSON, BundleCompressionType, IPhysicsConfig, IBundleOptions, Platform, BundleFilterConfig, MakeRequired } from '../public';
import { IAssetInfo as IAssetInfoFromDB, IAssetMeta } from '../../../assets/@types/private';
import * as rollup from 'rollup';
import { EngineInfo } from '../../../engine/@types/index';
import { BuiltinBundleName } from './bundle-config';

export interface IBundleInternalOptions extends IBundleOptions {
    dest: string, // bundle 的输出目录
    scriptDest: string, // 脚本的输出地址
    priority: number, // bundle 的优先级
    compressionType: BundleCompressionType, // bundle 的压缩类型
    isRemote: boolean // bundle 是否是远程包
    bundleFilterConfig?: BundleFilterConfig[];
    // isEncrypted: boolean // bundle 中的代码是否加密，原生平台使用
}
type PlatformType = StatsQuery.ConstantManager.PlatformType;
type IBuildTimeConstantValue = StatsQuery.ConstantManager.ValueType;

export interface ScriptAssetUserData {
    isPlugin?: boolean;
    isNative?: boolean;
    loadPluginInNative?: boolean;
    loadPluginInWeb?: boolean;
}

export interface fileMap {
    src: string;
    dest: string;
}

export type Physics = 'cannon' | 'ammo' | 'builtin';
export type Url = string; // 需要的是符合 url 标准的字符串
export type AssetInfoArr = Array<string | number>; // 固定两位或三位数组 [url,ccType,isSubAsset]
export const enum TaskAddResult {
    BUSY,
    SUCCESS,
    PARAM_ERROR,
}

export interface IBundleInitOptions extends IBundleOptions {
    root: string, // bundle 的根目录, 开发者勾选的目录，如果是 main 包，这个字段为''
    name: BuiltinBundleName | string, // bundle 的名称
    priority: number, // bundle 的优先级
    compressionType: BundleCompressionType, // bundle 的压缩类型
    isRemote: boolean, // bundle 是否是远程包
    md5Cache: boolean,
    debug: boolean, // 是否压缩
    output?: boolean, // 是否输出此 bundle 包（默认为 true）
    // isEncrypted: boolean // bundle 中的代码是否加密，原生平台使用

    dest: string, // bundle 的输出目录
    scriptDest: string, // 脚本的输出地址
}

export interface IBuildScriptParam {
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
    outputName: string; // 输出文件夹名称（带后缀）
    targets?: ITransformTarget;

    system?: {
        preset?: 'web' | 'commonjs-like',
    },

    flags: Record<string, IBuildTimeConstantValue>,
    platform: PlatformType,

    /**
     * 是否开启模块热重载
     * @default false
     */
    hotModuleReload?: boolean;

    commonDir: string;
    bundleCommonChunk: boolean;
}

/**
 * 模块保留选项。
 * - 'erase' 擦除模块信息。生成的代码中将不会保留模块信息。
 * - 'preserve' 保留原始模块信息。生成的文件将和原始模块文件结构一致。
 * - 'facade' 保留原始模块信息，将所有模块转化为一个 SystemJS 模块，但这些模块都打包在一个单独的 IIFE bundle 模块中。
 *   当这个 bundle 模块执行时，所有模块都会被注册。
 *   当你希望代码中仍旧使用模块化的特性（如动态导入、import.meta.url），但又不希望模块零散在多个文件时可以使用这个选项。
 */
export type ModulePreservation = 'erase' | 'preserve' | 'facade';

export interface AssetSerializeOptions {
    'cc.EffectAsset': {
        glsl1: boolean;
        glsl3: boolean;
        glsl4: boolean;
    };
}

export interface ISerializedOptions {
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

export interface IBundleBuildOptions {
    buildTaskIds?: string[];
    taskName: string;
    dest: string;
    optionList: IBuildTaskOption[];
    logDest?: string;
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

export interface Md5GlobbyPathInfo {
    base: string;
    pattern: string;
}


export interface IMD5Options {
    // 填写需要过滤或者包含的路径匹配列表或者符合 glob 匹配规则的字符串，需要填写相对于 result.paths.dir 的相对路径
    excludes: string[];
    includes: string[];
    replaceOnly: string[];
    handleTemplateMd5Link: boolean;
}

export interface IScriptOptions {
    transform: TransformOptions;
    debug: boolean;
    sourceMaps: boolean | 'inline';
    hotModuleReload: boolean;
    moduleFormat: rollup.ModuleFormat;
    modulePreservation: ModulePreservation;
    commonDir: string;
    bundleCommonChunk: boolean;
}

export interface IImportMapOptions {
    debug: boolean;
    dest: string;
    importMapFormat?: 'commonjs' | 'esm';
}

export type IPlatformType = 'native' | 'miniGame' | 'web';

export interface IInternalBundleBuildOptions<P extends Platform = Platform> extends MakeRequired<IBuildTaskOption<P>, 'includeModules' | 'macroConfig' | 'engineModulesConfigKey' | 'customPipeline' | 'renderPipeline' | 'designResolution' | 'physicsConfig' | 'flags' | 'taskId'> {
    dest: string; // bundle 构建的输出地址，常规构建时为 assets 目录
    // 编译脚本配置选项
    buildScriptParam: IBuildScriptParam;
    // 序列化打包资源时的特殊处理
    assetSerializeOptions: AssetSerializeOptions;
    // 配置添加 md5 后缀时需要过滤的路径匹配列表
    md5CacheOptions: IMD5Options,

    logDest: string; // log 输出地址
    platformType: StatsQuery.ConstantManager.PlatformType;
}

export interface IBuildCommandOption<P extends Platform = Platform> extends Partial<IBuildTaskOption<P>> {
    configPath?: string; // 构建配置文件地址
    migrate?: boolean; // 默认关闭，开启后自动迁移传入的配置
    projectSettingsPath?: string; // 导出的项目设置文件地址
    skipCheck?: boolean; // 跳过参数的检查流程
}

export interface IInternalBuildOptions<P extends Platform = Platform> extends IInternalBundleBuildOptions<P> {
    dest: string;
    // 编译 application.js 参数配置
    appTemplateData: appTemplateData;
    // 编译引擎参数配置
    buildEngineParam: IBuildEngineParam;
    updateOnly: boolean;
    generateCompileConfig?: boolean;
    recompileConfig?: IRecompileConfig;
    resolution: {
        width: number;
        height: number;
        policy: number;
    };
    // 构建之前默认会清空构建目录，如不希望清空，请在 onBeforeInit 之前修改当前参数为 true
    useCache?: boolean;
    bundleConfigs?: IBundleInternalOptions[];
}

export interface appTemplateData {
    debugMode: boolean;
    renderMode: boolean; // !!options.renderMode,
    // ImportMapSupported: boolean;
    // NonconformingCommonJs: boolean;
    showFPS: boolean;
    importMapFile?: string;
    resolution: {
        policy: number;
        width: number;
        height: number;
    };
    // hasPhysicsAmmo: boolean;
    md5Cache: boolean;

    cocosTemplate?: string; // 注入的子模板路径
}

export interface IEngineCachePaths {
    dir: string;
    all: string;
    plugin: string;
    meta: string;
    signatureJSON: string;
    pluginJSON: string;
}

export interface ISignatureConfig {
    md5: string;
    path: string;
}

export interface IBuildSeparateEngineResult {
    paths: IEngineCachePaths,
    importMap: Record<string, string>;
}

/**
 * 引擎分离编译后，默认会生成一份包含全部引擎散文件的目录结构，默认名称为 cocos-js-all
 */
export type IBuildSeparateEngineOptions = Pick<IBuildEngineParam, 'platformType' | 'includeModules' | 'output' | 'nativeCodeBundleMode'> & {
    // plugin 缓存需要包含的模块，如未填写，则默认不 pick 出一份单独的插件文件夹，填写后 pick 出来的插件文件夹名称与 pluginName 保持一致
    pluginFeatures?: string[] | 'default' | 'all';

    engine: string;

    // 平台名称
    platform: string;
    // 输出的 importMap 地址
    importMapOutFile: string;
    // 是否生成 插件目录 到本地
    outputLocalPlugin?: boolean;
    pluginName: string; // 本地插件目录名称，默认为 cocos
    useCacheForce?: boolean;
    // 签名提供者，填写后会为引擎插件包生成签名 JSON 并写入 provider 字段
    signatureProvider?: string;
}

export type IBuildSeparateEngineCacheOptions = Pick<IBuildSeparateEngineOptions, 'pluginName' | 'engine' | 'platform' | 'platformType' | 'pluginFeatures' | 'nativeCodeBundleMode' | 'signatureProvider' | 'useCacheForce'> & { engineFeatureQuery?: EngineFeatureQuery };

export interface IBuildEngineParam {
    entry: string; // 引擎入口文件
    debug: boolean;
    mangleProperties: boolean;
    sourceMaps: boolean | 'inline';
    /**
     * @deprecated please use `platformType` instead
     */
    platform?: PlatformType;
    platformType: PlatformType;
    includeModules: string[];
    engineVersion: string;
    md5Map: string[];
    engineName: string;
    useCache: boolean;
    // 编译成散文件
    split?: boolean;
    // 生成分离引擎配置
    separateEngineOptions?: Pick<IBuildSeparateEngineOptions, 'useCacheForce' | 'pluginFeatures' | 'outputLocalPlugin' | 'pluginName' | 'signatureProvider'> & {
        checkVersionValid?: boolean;
    };
    targets?: ITransformTarget;
    skip?: boolean;
    nativeCodeBundleMode: 'wasm' | 'asmjs' | 'both';
    assetURLFormat?:
    | 'relative-from-out'
    | 'relative-from-chunk'
    | 'runtime-resolved';
    baseUrl?: string;
    flags?: Record<string, IBuildTimeConstantValue>;
    output: string;
    preserveType?: boolean;
    wasmCompressionMode?: 'brotli';
    enableNamedRegisterForSystemJSModuleFormat?: boolean;
    inlineEnum?: boolean;
    loose?: boolean;
}

export type ITransformTarget = string | string[] | Record<string, string>;

export interface IAssetInfo extends IAssetInfoFromDB {
    temp?: string; // 资源的构建缓存目录
    fatherInfo?: any;
    // fatherUuid?: string | undefined;
    userData?: any;

    dirty?: boolean;
    // TODO
    userData?: Record<string, any>;
    meta: IAssetMeta;
    subAssets: Record<string, IAssetInfo>;
    mtime: number;
}
export interface IRecompileConfig {
    enable: boolean;
    generateAssets: boolean;
    generateScripts: boolean;
    generateEngine: boolean; // 是否生成引擎
    generateEngineByCache: boolean; // 是否使用缓存引擎
}

export interface IStageTaskItemJSON extends ITaskItemJSON {
    stage: string;
    options: IBuildStageOptions;
    type: 'build-stage',
}
export interface IBundleTaskItemJSON extends ITaskItemJSON {
    options: IBundleBuildOptions;
    type: 'bundle',
}

export interface IBuildStageOptions {
    root: string;
    platform: Platform;
    taskId?: string;
    nextStages?: string[];
    buildTaskOptions?: IBuildTaskOption;
    taskName?: string;
}

export const enum BuildExitCode {
    PARAM_ERROR = 32,
    BUILD_FAILED = 34,
    BUILD_SUCCESS = 36,
    BUILD_BUSY = 37,
    UNKNOWN_ERROR = 50,
}

export interface ExecuteHookTaskOption {
    pkgName: string;
    hook: string;
    options: IBuildTaskOption;
    [x: string]: any;
}