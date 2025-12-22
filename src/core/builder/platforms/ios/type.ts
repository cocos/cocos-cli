import { IInternalBuildOptions, InternalBuildResult } from '../../@types/protected';
import { CocosParams } from '../native-common/pack-tool/base/default';
import { ICustomBuildScriptParam, IOptions as INativeOption } from '../native-common/type';


export type IOrientation = 'landscape' | 'portrait';

export type IOptions = INativeOption & {
    executableName: string;
    packageName: string;
    orientation: {
        landscapeRight: boolean;
        landscapeLeft: boolean;
        portrait: boolean;
        upsideDown: boolean;
    },
    skipUpdateXcodeProject: boolean;
    renderBackEnd: {
        metal: boolean;
        gles3: boolean;
        gles2: boolean;
    },
    osTarget: {
        iphoneos: boolean,
        simulator: boolean,
    },
    developerTeam?: string,
    targetVersion: string,
}

export interface ITaskOptionPackages {
    ios: IOptions;
}

export interface IIOSInternalBuildOptions extends IInternalBuildOptions {
    ios: IOptions;
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<any>;
    platform: 'ios';
}

export interface IBuildResult extends InternalBuildResult {
    userFrameWorks: boolean; // 是否使用用户的配置数据
}
