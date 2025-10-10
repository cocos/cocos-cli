import { IInternalBuildOptions, InternalBuildResult, IBuildPaths } from "../protected";

export type IOrientation = 'auto' | 'landscape' | 'portrait';
export interface IOptions {
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

