import { IBuildPaths } from '../../../@types';
import { InternalBuildResult } from '../../../@types/protected';

export type IOrientation = 'auto' | 'landscape' | 'portrait';
export type UploadEnv = 'dev' | 'fat' | 'prod';
export interface IOptions {
    appid?: string;
    versionName?: string;
    uploadEnv?: UploadEnv;
    accessToken?: string;
    codeVersion?: string | number | null;
    bridgeLink?: string;
    bridgeBuildToken?: string;
    entryPath?: string;
    encryptKey?: string;
    /**
     * 是否使用 WEBGPU 渲染后端
     * @experiment
     */
    useWebGPU: boolean;
    /**
     * 设备方向
     * @default 'auto'
     */
    orientation: IOrientation;
    /**
     * 是否嵌入 Web 端调试工具
     * @default false
     */
    embedWebDebugger: boolean;
}
export interface IBuildResult extends InternalBuildResult {
    paths: IPaths;
}

export interface IPaths extends IBuildPaths {
    styleCSS?: string; // style.css 文件地址
    indexJs?: string; // index.js 文件地址
    indexHTML?: string; // index.html 文件地址
}

