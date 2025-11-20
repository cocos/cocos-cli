import { InternalBuildResult } from '../../@types/protected';
import { IOptions as INativeOption } from '../native-common/type';

export type IOptions = INativeOption & {
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

export interface ITaskOptionPackages {
    windows: IOptions;
}

export interface IBuildResult extends InternalBuildResult {
    userFrameWorks: boolean; // 是否使用用户的配置数据
}
