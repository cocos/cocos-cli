import { IBuildScriptParam, IInternalBuildOptions, InternalBuildResult } from "../../@types/protected";
import { CocosParams } from "./pack-tool/default";

declare enum NetMode {
    client = 0,
    hostServer = 1,
    listenServer = 2,
}
export interface ITaskOptionPackages {
    native: IOptions;
}

interface ICustomBuildScriptParam extends IBuildScriptParam {
    experimentalHotReload: boolean;
}

export interface ITaskOption<T = Object> extends IInternalBuildOptions {
    packages: ITaskOptionPackages;
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<T>;
}

export interface IOptions {
    template: string;
    engine?: string;
    runAfterMake: boolean;
    encrypted: boolean;// 是否加密脚本
    compressZip: boolean;// 是否压缩脚本
    xxteaKey?: string;// xxtea 加密的 key 值
    params?: CocosParams<Object>; // console 需要的参数
    JobSystem: 'none' | 'tbb' | 'taskFlow';
    serverMode: boolean;
    netMode: NetMode;
    hotModuleReload: boolean; // 是否开启模块热重载

    projectDistPath: string;
}

export interface IBuildCache extends InternalBuildResult {
    userFrameWorks: boolean; // 是否使用用户的配置数据
}
