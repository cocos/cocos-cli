import { IInternalBuildOptions, InternalBuildResult } from '../../@types/protected';
import { CocosParams } from '../native-common/pack-tool/base/default';
import { ICustomBuildScriptParam, IOptions as INativeOption } from '../native-common/type';

export type IAppABI = 'armeabi-v7a' | 'arm64-v8a' | 'x86' | 'x86_64';

export interface IOptions extends INativeOption {
    packageName: string;
    resizeableActivity: boolean;
    maxAspectRatio: string;
    orientation: {
        landscapeRight: boolean;
        landscapeLeft: boolean;
        portrait: boolean;
        upsideDown: boolean;
    };
    apiLevel: number;
    appABIs: IAppABI[];
    useDebugKeystore: boolean;
    keystorePath: string;
    keystorePassword: string;
    keystoreAlias: string;
    keystoreAliasPassword: string;
    appBundle: boolean;
    androidInstant: boolean;
    inputSDK: boolean;
    remoteUrl: string;
    sdkPath: string;
    ndkPath: string;
    javaHome?: string;
    javaPath?: string;
    swappy: boolean;
    renderBackEnd: {
        vulkan: boolean;
        gles3: boolean;
        gles2: boolean;
    };
}

export interface ITaskOptionPackages {
    android: IOptions;
}

export interface IAndroidInternalBuildOptions extends IInternalBuildOptions {
    packages: {
        android: IOptions;
    };
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<any>;
    platform: 'android';
}

export interface IBuildResult extends InternalBuildResult {
    userFrameWorks: boolean; // 是否使用用户的配置数据
}

