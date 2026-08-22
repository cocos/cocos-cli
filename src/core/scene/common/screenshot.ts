/**
 * 场景截图服务的公共类型定义。
 *
 * 截图由场景进程以 headless 方式离屏渲染当前打开的场景生成，
 * 返回临时 PNG 文件路径 + 元数据（不跨进程传裸像素，见 screenshot.ts 说明）。
 */

/** 取景 / 视图模式 */
export type TScreenshotViewMode = 'auto' | '2d' | '3d';

/** capture 入参（场景进程侧） */
export interface IScreenshotOptions {
    /** Optional target scene. It is refreshed for capture and the previous scene is restored afterwards. */
    sceneUrlOrUUID?: string;
    /** 目标渲染宽度（像素），默认使用工程设计分辨率宽度 */
    width?: number;
    /** 目标渲染高度（像素），默认使用工程设计分辨率高度；只指定一条边时按设计分辨率比例推导 */
    height?: number;
    /** 指定相机：节点路径或 uuid；不传则自动选择场景相机，再退回编辑器相机 frame-all */
    camera?: string;
    /** 视图模式：auto 跟随场景 2D/3D 判定 */
    viewMode?: TScreenshotViewMode;
}

/** 实际使用的相机参数（回传给 Agent 便于复现取景） */
export interface IScreenshotCameraInfo {
    /** 取景来源：scene = 场景内 cc.Camera；editor = 编辑器相机 frame-all */
    source: 'scene' | 'editor';
    /** 相机节点名（scene 来源时有意义） */
    nodeName?: string;
    projection: 'perspective' | 'ortho';
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    /** 透视相机垂直 FOV（度） */
    fov?: number;
    /** 正交相机高度 */
    orthoHeight?: number;
    /** Camera render priority; lower values render first. */
    priority: number;
    /** Original camera clear flags used for stack composition. */
    clearFlags: number;
    /** Camera visibility mask. */
    visibility: number;
    /** Normalized viewport rectangle. */
    viewport: { x: number; y: number; width: number; height: number };
}

/** 节点树概要中的单个节点 */
export interface IScreenshotNodeSummary {
    name: string;
    active: boolean;
    components: string[];
    children?: IScreenshotNodeSummary[];
}

/** 场景进程返回的原始截图结果（JSON-safe） */
export interface IScreenshotResult {
    /** 离屏渲染写出的临时 PNG 绝对路径 */
    filePath: string;
    width: number;
    height: number;
    /** 当前场景在 asset-db 中的 url */
    sceneUrl?: string;
    /** 场景文件名 */
    sceneName?: string;
    /** 场景磁盘文件修改时间（ms），供 Agent 判断时效 */
    mtime?: number;
    actualCamera: IScreenshotCameraInfo;
    /** All cameras rendered into the offscreen target, ordered by priority. */
    actualCameras: IScreenshotCameraInfo[];
    nodeSummary?: IScreenshotNodeSummary;
    /** 渲染备注（如无场景相机、退回编辑器相机等提示） */
    renderNote?: string;
}

export interface IScreenshotEvents {}

export interface IScreenshotService {
    capture(options: IScreenshotOptions): Promise<IScreenshotResult>;
}

export type IPublicScreenshotService = Pick<IScreenshotService, 'capture'>;
