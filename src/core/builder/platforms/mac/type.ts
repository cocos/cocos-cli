import { IInternalBuildOptions, InternalBuildResult } from '../../@types/protected';
import { CocosParams } from '../native-common/pack-tool/base/default';
import { ICustomBuildScriptParam, IOptions as INativeOption } from '../native-common/type';


export type IOrientation = 'landscape' | 'portrait';

export type IOptions = INativeOption & {
    executableName: string;
    packageName: string;
    renderBackEnd: {
        metal: boolean;
        gles3: boolean;
        gles2: boolean;
    },
    supportM1: boolean;
    skipUpdateXcodeProject: boolean;
    targetVersion: string;
}

export interface ITaskOptionPackages {
    mac: IOptions;
}

export interface IMacInternalBuildOptions extends IInternalBuildOptions {
    mac: IOptions;
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<any>;
    platform: 'mac';
}

export interface IBuildResult extends InternalBuildResult {
    userFrameWorks: boolean; // 是否使用用户的配置数据
}
