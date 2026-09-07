import { init as sceneInit, Scene } from '../../core/scene';
import { GlobalPaths } from '../../global';
import { Rpc } from '../../core/scene/main-process/rpc';
import type {
    ISceneCommandProvider,
    SceneCommandProviderRegistration,
} from '../../core/scene/main-process/rpc';
import type { MotionPreviewDesc } from '../../core/scene/common/preview';

export type {
    ISceneCommandProvider,
    SceneCommandProviderRegistration,
    SceneCommandRequestOptions,
} from '../../core/scene/main-process/rpc';
export { WorkerSceneCommandProvider } from '../../core/scene/main-process/rpc';

/**
 * Initialize the scene module.
 * Registers the scene middleware and initializes scene config.
 */
export async function init(): Promise<void> {
    await sceneInit();
}

/**
 * Start the scene worker process.
 *
 * @param projectPath Path to the project directory
 */
export async function startupWorker(projectPath: string): Promise<void> {
    const { sceneWorker } = await import('../../core/scene/main-process/scene-worker');
    await sceneWorker.start(GlobalPaths.enginePath, projectPath);
}

/** Installs a Scene command provider and returns an ownership-bound registration. */
export function setCommandProvider(
    provider: ISceneCommandProvider,
): SceneCommandProviderRegistration {
    return Rpc.setCommandProvider(provider);
}

/** Clears and disposes the active Scene command provider. */
export function resetCommandProvider(): void {
    Rpc.resetCommandProvider();
}

// ==================== 通用 Motion 预览 ====================
// 将 scene-process PreviewService 的 Motion 门面经场景进程 RPC 暴露给 PinK。
// 方法名与 IMotionPreviewService 一一对应，供主进程 cocosHostScene 通道透传调用。

/** 显示指定 Motion 描述的采样预览。 @param desc 中立的 Motion 预览描述。 @returns 是否已成功显示预览。 */
export async function showMotion(desc: MotionPreviewDesc): Promise<boolean> {
    return Scene.Preview.showMotion(desc);
}

/** 隐藏当前 Motion 预览。 */
export function hideMotion(): Promise<void> {
    return Scene.Preview.hideMotion();
}

/** 为 Motion 预览设置展示模型资源。 @param uuid 模型资源 UUID。 */
export async function setMotionModel(uuid: string): Promise<void> {
    return Scene.Preview.setMotionModel(uuid);
}

/** 设置 Motion 预览的采样时间。 @param time 时间（秒）。 */
export function setMotionTime(time: number): Promise<void> {
    return Scene.Preview.setMotionTime(time);
}

/** 播放 Motion 预览。 */
export function playMotion(): Promise<void> {
    return Scene.Preview.playMotion();
}

/** 暂停 Motion 预览。 */
export function pauseMotion(): Promise<void> {
    return Scene.Preview.pauseMotion();
}

/** 停止 Motion 预览。 */
export function stopMotion(): Promise<void> {
    return Scene.Preview.stopMotion();
}

/** 设置 Motion 预览使用的变量值。 @param name 变量名。 @param value 变量值。 */
export function setMotionVariable(name: string, value: number): Promise<void> {
    return Scene.Preview.setMotionVariable(name, value);
}

/** 设置 Motion 预览中 Blend 参数的临时值，不回写任何资产。 @param axis Blend 1D 使用 value，Blend 2D 使用 x/y。 @param value 参数值。 */
export function setMotionParameter(axis: 'value' | 'x' | 'y', value: number): Promise<void> {
    return Scene.Preview.setMotionParameter(axis, value);
}

/** 查询 Motion 预览时间轴长度。 @returns 当前 Motion 的时间轴统计，尚未建立预览时返回 null。 */
export function getMotionTimelineStats(): Promise<{ timeLineLength: number } | null> {
    return Scene.Preview.getMotionTimelineStats();
}

/** 查询当前是否有活跃的 Motion 预览。 @returns 存在返回 true。 */
export async function isMotionActive(): Promise<boolean> {
    return Scene.Preview.isMotionActive();
}

/** 查询当前 Motion 预览的渲染图像帧。 @param info 图像尺寸。 @returns 图像帧数据。 */
export function queryMotionImage(info: { width: number; height: number }): Promise<unknown> {
    return Scene.Preview.queryMotionImage(info);
}

/** 转发预览相机左键/中键按下（轨道旋转 / 中键平移）。 @param action 事件参数（相对画布坐标与按键）。 */
export function onMotionMouseDown(action: { x: number; y: number; button: number }): Promise<void> {
    return Scene.Preview.onMotionMouseDown(action);
}

/** 转发预览相机鼠标移动（轨道旋转 / 平移）。 @param action 事件参数（相对位移）。 */
export function onMotionMouseMove(action: { movementX: number; movementY: number }): Promise<void> {
    return Scene.Preview.onMotionMouseMove(action);
}

/** 转发预览相机鼠标释放。 @param action 事件参数（相对画布坐标）。 */
export function onMotionMouseUp(action: { x: number; y: number }): Promise<void> {
    return Scene.Preview.onMotionMouseUp(action);
}

/** 转发预览相机滚轮缩放。 @param action 事件参数（滚轮增量）。 */
export function onMotionMouseWheel(action: { wheelDeltaY: number; wheelDeltaX: number }): Promise<void> {
    return Scene.Preview.onMotionMouseWheel(action);
}
