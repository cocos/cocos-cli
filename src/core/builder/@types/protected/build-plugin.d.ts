// ********************************* plugin ****************************************

import {
    IBuildPluginConfig,
    IBuildTaskOption,
    IDisplayOptions,
    IConfigItem,
    ISettings,
    IVerificationRuleMap,
    PlatformCompressConfig,
    IBuildUtils,
    IBuild,
    ITaskState,
    PanelInfo,
    BundleCompressionType,
    IConsoleType,
    MakeRequired,
    IBuildTaskItemJSON,
} from '../public';
import { BuilderAssetCache } from './asset-manager';
import { IBundle, InternalBuildResult, ScriptBuilder, IBundleManager } from './build-result';
import { IInternalBuildOptions, IInternalBundleBuildOptions } from './options';
import { ImportMap } from './import-map';
import { IImportMapOptions, IPlatformType } from './options';
import { StatsQuery } from '@cocos/ccbuild';

export interface IQuickSpawnOption {
    cwd?: string;
    env?: any;

    downGradeWaring?: boolean; // 将会转为 log 打印，默认为 false
    downGradeLog?: boolean; // 将会转为 debug 打印，默认为 true
    downGradeError?: boolean; // 将会转为警告，默认为 false
    ignoreLog?: boolean; // 忽略 log 信息
    ignoreError?: boolean; // 忽略错误信息
    prefix?: string; // log 输出前缀
    shell?: boolean;//windows 是否使用 shell 运行 spawn
}

export interface IInternalBuildUtils extends IBuildUtils {
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

export interface IInternalBuild extends IBuild {
    Utils: IInternalBuildUtils;
    debugMode: boolean; // 是否为调试模式，仅供开发使用，进程池开启的子进程打开 inspector 后会自动在第一行断点，任务管理器也可以随意组织

    // ------------------ 开放的一些构建内置资源处理模块，供插件自由组合使用（持续更新中） ---------------------
    ScriptBuilder: typeof ScriptBuilder;
}

export type IProcessingFunc = (process: number, message: string, state?: ITaskState) => void;
export interface IBuildManager {
    taskManager: any;
    currentCompileTask: any;
    currentBuildTask: any;
    __taskId: string;
}

// TODO 此接口似乎没有用到
export interface IBuildProcessInfo {
    state: ITaskState; // 任务状态
    progress: number; // 任务进度
    message: string; // 最后一次更新的进度消息
    id: string; // 任务唯一标识符
    options: any; // 构建参数
}

export interface IScriptInfo {
    file: string;
    uuid: string;
}

type ICheckRule = 'pathExist' | 'valid' | 'required' | 'normalName' | 'noChinese' | 'array' | 'string' | 'number' | 'http';

export interface IBuildPanel {
    // 内部使用的 Vue
    Vue: any;
    validator: {
        has: (ruleName: string) => boolean;
        // 通过返回空字符串，失败返回错误信息
        checkRuleWithMessage: (ruleName: ICheckRule, val: any, ...arg: any[]) => Promise<string>;
        check: (ruleName: ICheckRule, val: any, ...arg: any[]) => Promise<boolean>;
        checkWithInternalRule: (ruleName: ICheckRule, val: any, ...arg: any[]) => boolean;
        queryRuleMessage: (ruleName: ICheckRule) => string;
    };
}

export interface IBuildWorkerPluginInfo {
    assetHandlers?: string;
    // 注册到各个平台的钩子函数
    hooks?: Record<string, string>;
    pkgName: string;
    internal: boolean; // 是否为内置插件
    priority: number; // 优先级
    // [platform][stageName]: ICustomBuildStageItem
    customBuildStages?: {
        [platform: string]: IBuildStageItem[];
    };
    buildTemplate?: BuildTemplateConfig;
    customIconConfigs?: {
        [platform: string]: IBuildIconItem[];
    };
}

export type IPluginHookName =
    | 'onBeforeBuild'
    | 'onAfterInit'
    | 'onBeforeInit'
    | 'onAfterInit'
    | 'onBeforeBuildAssets'
    | 'onAfterBuildAssets'
    | 'onBeforeCompressSettings'
    | 'onAfterCompressSettings'
    | 'onAfterBuild'
    | 'onBeforeCopyBuildTemplate'
    | 'onAfterCopyBuildTemplate'
    | 'onError';
// | 'onBeforeCompile'
// | 'compile'
// | 'onAfterCompile'
// | 'run';

export type IPluginHook = Record<IPluginHookName, IInternalBaseHooks>;
export namespace IInternalHook {
    export type throwError = boolean; // 插件注入的钩子函数，在执行失败时是否直接退出构建流程
    export type title = string; // 插件任务整体 title，支持 i18n 写法

    // ------------------ 钩子函数 --------------------------
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

    // ----------------- bundle 构建流程的钩子函数 ----------
    export type onBeforeBundleInit = IInternalBundleBaseHooks;
    export type onAfterBundleInit = IInternalBundleBaseHooks;
    export type onBeforeBundleDataTask = IInternalBundleBaseHooks;
    export type onAfterBundleDataTask = IInternalBundleBaseHooks;
    export type onBeforeBundleBuildTask = IInternalBundleBaseHooks;
    export type onAfterBundleBuildTask = IInternalBundleBaseHooks;

    // ------------------ 其他操作函数 ---------------------
    export type onBeforeRun = IInternalStageTaskHooks;
    // 内置插件才有可能触发这个函数
    export type run = IInternalStageTaskHooks;
    export type onAfterRun = IInternalStageTaskHooks;

    export type onBeforeMake = IInternalStageTaskHooks;
    // 内置插件才有可能触发这个函数
    export type make = IInternalStageTaskHooks;
    export type onAfterMake = IInternalStageTaskHooks;
}

export interface PlatformPackageOptions {
    [packageName: string]: Record<string, any>;
}

export type IInternalBaseHooks = (
    options: IInternalBuildOptions,
    result: InternalBuildResult,
    cache: BuilderAssetCache,
    ...args: any[]
) => void;

export type IInternalStageTaskHooks = {
    this: IBuildStageTask;
    root: string;
    options: IInternalBuildOptions;
}

export type IInternalBundleBaseHooks = (
    this: IBundleManager,
    options: IInternalBundleBuildOptions,
    bundles: IBundle[],
    cache: BuilderAssetCache,
) => void;

export interface IBuildTask {
    handle: (options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderAssetCache, settings?: ISettings) => {};
    title: string;
    name: string;
}

export type OverwriteCommonOption =
    | 'buildPath'
    | 'server'
    | 'polyfills'
    | 'mainBundleIsRemote'
    | 'name'
    | 'sourceMaps'
    | 'experimentalEraseModules'
    | 'buildStageGroup';

export interface IBuildStageItem {
    name: string; // 阶段唯一名称，同平台不允许重名
    displayName?: string; // 阶段名称，显示在构建面板对应按钮以及一些报错提示上
    description?: string; // 构建阶段描述，将会作为构建面板对应按钮上的 tooltip
    hidden?: boolean; // 是否显示指定的控制按钮在构建列表，默认显示
    parallelism?: 'none' | 'all' | 'other';
    hook: string;
};

export interface IconConfig {
    // 图标类型
    type: 'icon' | 'image',
    // 具体的图片路径或者 icon 信息，图片路径支持 db:// 、 project:// 、 packages:// 、相对路径和绝对路径
    value: string;
}


export interface IPlatformInfo {
    label: string;
    icon?: IconConfig;
}

interface ICustomBuildIconItem extends IconConfig {
    // 图标描述，tooltip 提示内容
    description?: string,
    // 函数为校验 icon 按钮是否禁用，返回 true 表示禁用，返回 false 表示启用。不配置 disabled 函数时，默认启用
    disabled?: (taskInfo: IBuildTaskItemJSON) => boolean | Promise<boolean>;
    // 按钮点击后的事件
    // click?: (taskInfo: IBuildTaskItemJSON) => void;
}


// Variant with Hook
interface IconConfigWithHook extends ICustomBuildIconItem {
    executeType: 'hook';     // Discriminant
    hook: string;
}

// Final union type
export type IBuildIconItem = IconConfigWithHook;

export type ICustomBuildIconInfo = IBuildIconItem & {
    pkgName: string;
}
export interface IInternalBuildPluginConfig extends IBuildPluginConfig {
    doc?: string; // 注册文档地址
    platformName?: string; // 平台名，可以指定为 i18n 写法, 只有官方构建插件的该字段有效
    platformType?: StatsQuery.ConstantManager.PlatformType,
    icon?: IconConfig; // 平台 icon
    displayName?: string; // 在构建面板上的显示名称，默认为插件名
    hooks?: string; // 钩子函数的存储路径
    panel?: string; // relate url about custom panel
    // 仅对内部插件开放
    textureCompressConfig?: PlatformCompressConfig;
    buildTemplateConfig?: BuildTemplateConfig;
    assetBundleConfig?: {
        // asset bundle 的配置
        supportedCompressionTypes: BundleCompressionType[];
        // TODO 后续废弃，统一使用外层的 platformType 与引擎保持一致
        platformType: IPlatformType;
    };

    priority?: number;
    wrapWithFold?: boolean; // 是否将选项显示在折叠框内（默认 true ）
    options?: IDisplayOptions; // 需要注入的平台参数配置
    verifyRuleMap?: IVerificationRuleMap; // 注入的需要更改原有参数校验规则的函数
    commonOptions?: Record<string, IConfigItem>; // 允许修改部分内置配置的界面显示方式
    debugConfig?: IDebugConfig;
    // 阶段性任务注册信息，由于涉及到按钮排序问题，需要指定为数组
    customBuildStages?: Array<IBuildStageItem>;
    // icon 操作注册信息
    customIconConfigs?: Array<IBuildIconItem>;
    internal?: boolean; // 注册后，构建插件赋予的标记，插件指定无效
}
export type IPlatformBuildPluginConfig = MakeRequired<IInternalBuildPluginConfig, 'platformType' | 'platformName'>;

export interface BuildTemplateConfig {
    // 构建模板的配置
    templates: {
        path: string;
        // 输出地址的相对路径
        destUrl: string;
    }[];
    displayName?: string;
    version: string;
    dirname?: string; // 指定构建模板目录名称，默认与平台名称保持一致
    pkgName?: string; // 注册的来源插件
}

export type ICustomBuildStageDisplayItem = IBuildStageItem & {
    groupItems: IBuildStageItem[]; // 是否是复合按钮
    inGroup: boolean;
    lock?: boolean; // 是否锁定，用于界面防止重复点击
}

export interface BuildCheckResult {
    error: string;
    newValue: any;
    level: IConsoleType;
}

export type IBuildVerificationFunc = (value: any, options: IBuildTaskOption) => boolean | Promise<boolean>;

export interface IDebugConfig {
    options?: IDisplayOptions; // 显示在构建平台编译运行调试工具上的配置选项
    custom?: string; // 显示在构建平台编译运行调试工具上的配置 vue 组件
}

export interface ICompInfo {
    displayName?: string;
    doc?: string;
    custom?: any;
    options?: IDisplayOptions;
    panelInfo?: PanelInfo;
    wrapWithFold: boolean;

    // ..... 初始化时未存在的字段 .....
    panel?: any; // 实例化后的 panel 对象
    pkgName?: string; // 插件名称
}

// 构建平台下架状态
export interface IPlatformDelisted {
    status: 'preDelisted' | 'delisted'; // 状态
    message: string; // 默认下架提示信息
    [key: string]: string; // 对应语言的下架提示信息。例如 message_zh
}
