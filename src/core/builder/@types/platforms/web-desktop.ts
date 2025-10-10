import { IBuildPaths } from "..";
import { IInternalBuildOptions, appTemplateData, InternalBuildResult } from "../protected";


export interface IOptions {
    useWebGPU: boolean;
    resolution: {
        designHeight: number;
        designWidth: number;
    };
}

export interface IBuildResult extends InternalBuildResult {
    paths: IPaths;
}
export interface IPaths extends IBuildPaths {
    styleCSS?: string; // style.css 文件地址
    indexJs?: string; // index.js 文件地址
    indexHTML?: string; // index.html 文件地址
}
