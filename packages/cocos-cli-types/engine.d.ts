import { __private } from 'cc';

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

export declare interface Features {
    [feature: string]: IModuleItem;
}

export declare function getConfig(useDefault?: boolean): Promise<IEngineConfig>;

export declare function getInfo(): Promise<EngineInfo>;

export declare interface IChunkContent {
    skeleton: null | string;
    clips: string[];
}

export declare interface ICollisionMatrix {
    [x: string]: number;
}

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

export declare interface IEngineProjectConfig extends Exclude<IEngineConfig, 'includeModules' | 'flags' | 'noDeprecatedFeatures'> {
    configs?: Record<string, IEngineModuleConfig>;
    globalConfigKey?: string;
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

export declare interface IInitEngineInfo {
    importBase: string;
    nativeBase: string;
    writablePath: string;
    serverURL?: string;
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

export declare function init(projectPath: string): Promise<void>;

export declare function initEngine(enginePath: string, projectPath: string, serverURL?: string): Promise<void>;

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

export declare interface IVec3Like {
    x: number;
    y: number;
    z: number;
}

export declare type MacroItem = {
    key: string;
    value: boolean;
}

export declare type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

export declare interface Migration {
    version: string;
    migrate(moduleCache: Record<string, boolean>): Record<string, boolean>;
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

export declare function queryLayerBuiltin(): Promise<{
    name: string;
    value: number;
}[]>;

export declare function querySortingLayerBuiltin(): Promise<readonly __private._cocos_sorting_sorting_layers__SortingItem[]>;

export declare function startEngineCompilation(force?: boolean): Promise<void>;

export { }
