import { IInternalBuildOptions, InternalBuildResult, IBuildPaths } from "../protected";

export type IOrientation = 'auto' | 'landscape' | 'portrait';
export interface IOptions {
    useWebGPU: boolean;
    orientation: IOrientation;
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

