
import { IInternalBuildOptions, InternalBuildResult } from '../../@types/protected';
import { CocosParams } from '../native-common/pack-tool/base/default';
import { ICustomBuildScriptParam, IOptions as INativeOption } from '../native-common/type';

export type IOrientation = 'landscape' | 'portrait';

export interface IOptions extends INativeOption {
    packageName: string;
    orientation: {
        landscapeRight: boolean;
        landscapeLeft: boolean;
        portrait: boolean;
        upsideDown: boolean;
    },

    apiLevel: number;
    sdkPath: string;
    ndkPath: string;

    renderBackEnd: {
        // vulkan: boolean;
        gles3: boolean;
        // gles2: boolean;
    }
}

export interface ITaskOptionPackages {
    ohos: IOptions;
}

export interface IOhosInternalBuildOptions extends IInternalBuildOptions {
    packages: {
        ohos: IOptions;
    };
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<any>;
    platform: 'ohos';
}


export interface IBuildResult extends InternalBuildResult {
    userFrameWorks: boolean; // 是否使用用户的配置数据
}
