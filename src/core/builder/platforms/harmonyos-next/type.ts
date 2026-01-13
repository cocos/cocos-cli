import { IInternalBuildOptions, InternalBuildResult } from '../../@types/protected';
import { CocosParams } from '../native-common/pack-tool/base/default';
import { ICustomBuildScriptParam, IOptions as INativeOption } from '../native-common/type';

export type IOrientation = 'landscape' | 'portrait';

export type IAppABI = 'armeabi-v7a' | 'arm64-v8a';
export type IJsEngine = 'JSVM' | 'V8' | 'ARK';

export interface IOptions extends INativeOption {
    packageName: string;
    orientation: {
        landscapeRight: boolean;
        landscapeLeft: boolean;
        portrait: boolean;
        upsideDown: boolean;
    },
    deviceTypes: {
        phone: boolean;
        tablet: boolean;
        pc_2in1: boolean; // PC/2in1
        tv: boolean;
        wearable: boolean;
        car: boolean;
        default: boolean;
    },
    // apiLevel: number;
    sdkPath: string;
    ndkPath: string;
    appABIs: IAppABI[];

    renderBackEnd: {
        // vulkan: boolean;
        gles3: boolean;
        // gles2: boolean;
    };
    jsEngine: IJsEngine
    useAotOptimization: boolean;
    useGamepad: boolean;
    //useV8: boolean;
}

export interface ITaskOptionPackages {
    'harmonyos-next': IOptions;
}

export interface IHarmonyOSNextInternalBuildOptions extends IInternalBuildOptions {
    packages: {
        'harmonyos-next': IOptions;
    };
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<any>;
    platform: 'harmonyos-next';
}


export interface IBuildResult extends InternalBuildResult {
    userFrameWorks: boolean; // 是否使用用户的配置数据
}
