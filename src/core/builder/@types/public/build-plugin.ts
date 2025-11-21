import { IBuildResult, ICompressConfig } from './build-result';
import { IBuilderConfigItem, IBuildTaskOption } from '../protected';

export interface IBuildPluginConfig {
    doc?: string; // document address
    hooks?: string; // relate url about IHook
    panel?: string; // relate url about custom panel
    options?: IDisplayOptions; // config of options
    verifyRuleMap?: IVerificationRuleMap;
}

export interface IBuildPluginProfile {
    builder?: {
        common?: Record<string, any>;
        // { platform: options }
        options?: Record<string, Record<string, any>>;
        // id: options
        taskOptionsMap?: Record<string, any>;
    };
    __version__: string;

    // 旧版本的数据格式，已废弃
    common?: Record<string, any>;
    // { platform: options }
    options?: Record<string, Record<string, any>>;
}

export type IVerificationFunc = (val: any, ...arg: any[]) => boolean | Promise<boolean>;
export type IInternalVerificationFunc = (val: any, ...arg: any[]) => boolean;

export type IVerificationRuleMap = Record<string, IVerificationRule>;

export interface IVerificationRule {
    func: IVerificationFunc;
    message: string;
}
export interface IInternalVerificationRule {
    func: IInternalVerificationFunc;
    message: string;
}

export type IDisplayOptions = Record<string, IBuilderConfigItem>;

export type ArrayItem = {
    label: string;
    value: string;
};

export interface IBuildPlugin {
    configs?: BuildPlugin.Configs;
    assetHandlers?: BuildPlugin.AssetHandlers;
    load?: BuildPlugin.load;
    unload?: BuildPlugin.Unload;
}
export type IBaseHooks = (options: IBuildTaskOption, result: IBuildResult) => Promise<void> | void;
export type IBuildStageHooks = (root: string, options: IBuildTaskOption) => Promise<void> | void;

export namespace BuildPlugin {
    export type Configs = Record<string, IBuildPluginConfig>;
    export type AssetHandlers = string;
    export type load = () => Promise<void> | void;
    export type Unload = () => Promise<void> | void;
}

export namespace BuildHook {
    export type throwError = boolean; // 插件注入的钩子函数，在执行失败时是否直接退出构建流程
    export type title = string; // 插件任务整体 title，支持 i18n 写法

    export type onError = IBaseHooks; // 构建发生中断错误时的回调，仅作为事件通知，并不能劫持错误

    export type onBeforeBuild = IBaseHooks;
    export type onBeforeCompressSettings = IBaseHooks;
    export type onAfterCompressSettings = IBaseHooks;
    export type onAfterBuild = IBaseHooks;

    export type onAfterMake = IBuildStageHooks;
    export type onBeforeMake = IBuildStageHooks;

    export type load = () => Promise<void> | void;
    export type unload = () => Promise<void> | void;
}

export namespace AssetHandlers {
    export type compressTextures = (
        tasks:ICompressConfig[],
    ) => Promise<void>;
}
