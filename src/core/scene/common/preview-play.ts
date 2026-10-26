import type { IServiceEvents } from '../scene-process/service/core';

/**
 * 「Preview in Editor」游戏视图（Game View）播放状态。
 * 对齐 cocos-editor preview-play 的 PlayState：
 * - stop：未在播放（预览 webview 刚启动或已停止）；
 * - play：游戏主循环驱动帧，游戏相机渲染，输入进入游戏；
 * - pause：director/game 双暂停，编辑器相机 + 编辑器 tick 接管渲染，
 *   场景视图可像编辑态一样操作运行中的活场景（对齐 Creator PreviewPlay.pause(true)）。
 */
export type PreviewPlayState = 'stop' | 'play' | 'pause';

export interface IPreviewPlayStartOptions {
    /** true = 冷启动直接进入暂停态（分步冷启动：不推进任何游戏帧）。 */
    paused?: boolean;
    /** 被预览场景的 db:// url（登记运行时编辑实体时的身份标识，可缺省）。 */
    sceneUrl?: string;
}

export interface IPreviewPlayEvents {
    'preview-play:state-changed': [state: PreviewPlayState];
}

export interface IPreviewPlayService extends IServiceEvents {
    /**
     * 进入 game view：从序列化 JSON 运行场景（runSceneImmediateByJson，等价 Creator softReloadScene），
     * 开启物理、隐藏编辑器相机、暂停编辑器 tick，随后由游戏主循环驱动（或按 options.paused 停在第 0 帧）。
     * @param serializedSceneJson 编辑器场景序列化快照（sceneUtils.serialize 输出）
     */
    start(serializedSceneJson: string, options?: IPreviewPlayStartOptions): Promise<void>;
    /** 退出 game view：注销事件/输入门控、关闭物理、状态归 stop（宿主随后销毁 webview）。 */
    stop(): Promise<void>;
    /** 暂停/继续。暂停=切回编辑器相机+编辑器 tick（场景视图可操作）；继续=同一 director 接着跑，不重载。 */
    pause(isPause: boolean): Promise<void>;
    /** 分步：仅暂停态有效，director.resume → tick(1/fps) → pause，前进一帧并保持暂停。返回是否执行。 */
    step(): boolean;
    isPause(): boolean;
    getState(): PreviewPlayState;
    /** 目标帧率：播放中即时生效（game.frameRate）；同时作为分步 dt=1/fps 的来源。 */
    setFps(fps: number): void;
    /** 渲染统计面板（cc.debug.setDisplayStats），播放中即时生效。 */
    showState(show: boolean): void;
}

export type IPublicPreviewPlayService = Pick<IPreviewPlayService,
    'start' | 'stop' | 'pause' | 'step' | 'isPause' | 'getState' | 'setFps' | 'showState'
>;
