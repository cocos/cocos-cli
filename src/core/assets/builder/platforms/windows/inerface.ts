import { InternalBuildResult } from "../../@types/protected";
import { ITaskOption as INativeTaskOption, IOptions as INativeOption } from '../native-common/interface';


export type IOrientation = 'landscape' | 'portrait';

export interface ITaskOption extends INativeTaskOption<IOptions> {
    packages: {
        'windows': IOptions;
        native: INativeOption;
    }
}

export interface IOptions {
    executableName: string;
    renderBackEnd: {
        vulkan: boolean;
        gles3: boolean;
        gles2: boolean;
    };
    targetPlatform: 'win32' | 'x64';
    serverMode: boolean;
    vsData: string;

    vsVersion?: string;
}

export interface IBuildResult extends InternalBuildResult {
    userFrameWorks: boolean; // 是否使用用户的配置数据
}
