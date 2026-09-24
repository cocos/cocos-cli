'use strict';

/**
 * 「Preview in Editor」游戏视图播放服务（Game View）。
 *
 * 移植自 cocos-editor（Creator）scene 进程的 preview-play manager
 * （scene/source/script/3d/manager/preview-play/index.ts），并适配 dev-cli 的
 * 单窗口预览 webview 结构（无 SceneFacadeManager / 无多窗口 changeTargetWindow 需求）：
 *
 * - 游戏运行在**编辑器引擎**里（boot 时 window.isPreviewProcess=true → EDITOR_NOT_IN_PREVIEW=false；
 *   cc.GAME_VIEW 由 engine-bootstrap 在引擎模块求值后显式置位）：组件生命周期、物理、输入派发均按运行态执行；
 * - play：隐藏编辑器相机（游戏相机上屏 mainWindow），Engine.pause() 停编辑器 tick，
 *   director/game.resume() 由游戏主循环驱动帧；Operation 以 Preview 优先级短路，
 *   编辑器相机/gizmo 不响应画布输入，画布事件改由本服务转发到 input._dispatch*（见 INPUT_REDIRECT）；
 * - pause：director/game.pause()，showEditorCamera() 切回编辑器相机，Engine.resume()
 *   恢复编辑器 tick —— 同一运行场景以「编辑态」呈现，gizmo/框选/相机漫游原生可操作
 *   （对齐 Creator PreviewPlay.pause(true) + PreviewSceneFacade.isInputRedirected 语义）；
 *   输入门控已卸载且游戏 tick 停摆，游戏脚本在暂停期间收不到输入（Creator 同款语义）；
 * - step：仅暂停态有效，director.resume() → tick(1/fps) → pause()，前进一帧后保持暂停，
 *   编辑器 tick 持续渲染，视图即时反映步进结果（对齐 Creator PreviewPlay.step）；
 * - resume（pause(false)）：同一 director 继续（不重载场景、不重启引擎），
 *   hideEditorCamera() + Engine.pause() + director/game.resume()；
 * - stop：注销事件/输入门控、关闭物理（宿主随后销毁 webview，等价 Creator「停止即重启进程」，
 *   不做场景还原——编辑场景在另一个 webview 中从未被动过）。
 */

import { Camera, Director, director, game, input, Layers, Node, renderer, Scene } from 'cc';
import { BaseService, register, Service } from './core';
import { ServiceEvents } from './core/global-events';
import { OperationPriority } from './operation/types';
import type { OperationEvent } from './operation/types';
import { sceneUtils } from './scene/utils';
import type {
    IPreviewPlayEvents,
    IPreviewPlayService,
    IPreviewPlayStartOptions,
    PreviewPlayState,
} from '../../common';

declare const cc: any;

/** 编辑器相机/节点的 layer 掩码（GIZMOS | SCENE_GIZMO | EDITOR），与 CameraService._detachSceneCameras 一致。 */
const EDITOR_MASK = Layers.makeMaskInclude([
    Layers.Enum.GIZMOS,
    Layers.Enum.SCENE_GIZMO,
    Layers.Enum.EDITOR,
]);

/**
 * play 态输入重定向表（对齐 Creator PreviewSceneFacade.redirectInput 的 Events 映射）：
 * EDITOR 构建下 pal 输入源**不注册原生 DOM 监听**（MouseInputSource 构造里 `if(!EDITOR)`），
 * 游戏只能经 input._dispatch* 入口收输入；故 play 态把画布 Operation 事件转发到对应
 * dispatch 方法，并返回 false 短路编辑器侧处理（相机/gizmo/框选不响应游戏输入）。
 * dblclick 无对应 dispatch（Creator 亦不转发），仅短路。
 *
 * 坐标契约：引擎 MouseInputSource._getLocation 自己减 canvas 偏移并乘 DPR，因此转发的
 * clientX/clientY 必须是 DOM 页面坐标（input-bridge 只对 x/y、moveDelta* 做渲染缓冲换算，
 * clientX/clientY、movementX/movementY 保留 DOM 空间）；传渲染缓冲坐标会被二次换算而整体偏移。
 */
const INPUT_REDIRECT: ReadonlyArray<readonly [OperationEvent, string | undefined]> = [
    ['mousedown', '_dispatchMouseDownEvent'],
    ['mousemove', '_dispatchMouseMoveEvent'],
    ['mouseup', '_dispatchMouseUpEvent'],
    ['mousewheel', '_dispatchMouseScrollEvent'],
    ['keydown', '_dispatchKeyboardDownEvent'],
    ['keyup', '_dispatchKeyboardUpEvent'],
    ['dblclick', undefined],
];

/** 判定是否编辑器侧相机（暂停时展示、播放时隐藏），对齐 Creator NeedHideCamera + EDITOR_MASK。 */
function isEditorCamera(camera: any): boolean {
    if (camera?.node && (camera.node.layer & EDITOR_MASK)) {
        return true;
    }
    const usage = camera?.cameraUsage;
    const CameraUsage = (renderer as any)?.scene?.CameraUsage;
    if (usage === undefined || !CameraUsage) {
        return false;
    }
    return usage === CameraUsage.EDITOR || usage === CameraUsage.SCENE_VIEW || usage === CameraUsage.PREVIEW;
}

@register('PreviewPlay')
export class PreviewPlayService extends BaseService<IPreviewPlayEvents> implements IPreviewPlayService {

    private _state: PreviewPlayState = 'stop';
    private _fps = 60;
    private _stats = false;
    private _scene: Scene | null = null;
    /** 记录进入 play 前用户的场景光设置，暂停时还原（对齐 Creator _sceneLightOn）。 */
    private _sceneLightOn = false;
    /** 首次进入暂停时把编辑器相机对焦到运行场景（对齐 Creator firstResume → Camera.defaultFocus）。 */
    private _firstPause = true;
    /** play 态被隐藏的编辑器相机节点，暂停时恢复 active。 */
    private readonly _hiddenEditorCameraNodes: Set<Node> = new Set();
    /** pause 态被下屏的游戏相机（enabled=false），恢复播放时重新启用。 */
    private readonly _parkedGameCameras: Set<any> = new Set();
    /** pause 态被临时改成 GAME_VIEW 的编辑器相机 → 原 usage（退出暂停时还原）。 */
    private readonly _profilerRetargetedCameras: Map<any, number> = new Map();
    /** 暂停态被摘下的 profiler 统计对象（冻结中），退出暂停时还原。 */
    private _frozenProfilerStats: unknown;
    /** play 态的 Operation 重定向/短路监听（转发游戏输入 + 防止编辑器相机/gizmo 响应）。 */
    private readonly _inputGateHandlers: Map<OperationEvent, (event: unknown) => boolean> = new Map();

    private readonly _onSceneBeforeLaunch = (_launchingScene: Scene) => {
        // 运行期脚本切场景：旧场景关闭消息 + 清选中（对齐 Creator onSceneBeforeLaunch）。
        if (this._scene) {
            ServiceEvents.emit('editor:close', this._scene);
            try { Service.Selection?.clear(); } catch { /* Selection 未注册时忽略 */ }
        }
    };

    private readonly _onSceneLaunch = (scene: Scene) => {
        // 运行期脚本切场景：重新登记编辑实体并广播 open（Hierarchy/Inspector/服务跟随新场景），
        // 再按当前状态恢复取景。暂停态同样要处理：异步加载可能在暂停后才完成，step 也可能触发
        // 切场景——只更新 _scene 会让 Editor 仍指向旧场景，恢复播放后视图与运行场景脱节。
        this._scene = scene;
        if (this._state === 'play') {
            this.adoptRuntimeScene(undefined);
            ServiceEvents.emit('editor:open', scene);
            this.hideEditorCamera();
        } else if (this._state === 'pause') {
            this.adoptRuntimeScene(undefined);
            ServiceEvents.emit('editor:open', scene);
            this.enterPauseView();
        }
    };

    // ---- 公共 API -------------------------------------------------------

    public getState(): PreviewPlayState {
        return this._state;
    }

    public isPause(): boolean {
        return this._state === 'pause';
    }

    /**
     * 进入 game view：运行序列化场景快照 → 服务对运行场景初始化（editor:open 扇出）→
     * 开物理 → 相机/tick/输入切到播放态（或按 options.paused 停在第 0 帧的暂停态）。
     */
    public async start(serializedSceneJson: string, options?: IPreviewPlayStartOptions): Promise<void> {
        if (this._state !== 'stop') {
            await this.stop();
        }
        let parsed: Record<string, any>;
        try {
            parsed = typeof serializedSceneJson === 'string'
                ? JSON.parse(serializedSceneJson)
                : serializedSceneJson;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error('[PreviewPlay] invalid serialized scene json: ' + message);
        }

        // 旧场景（重入场景）先走 close 扇出：NodeManager 解绑并清缓存，避免拆场景时的 book 事件外溢。
        if (this._scene) {
            ServiceEvents.emit('editor:close', this._scene);
            this._scene = null;
        }

        const scene = await sceneUtils.runSceneImmediateByJson(parsed);
        this._scene = scene ?? director.getScene() ?? null;
        // 把运行场景登记为当前编辑实体（必须先于扇出）：NodeService.queryNodeTree/选择/组件等
        // 服务层守卫都读 Service.Editor.getRootNode()/isOpen，未登记会全部拒绝（scene not opened）。
        this.adoptRuntimeScene(options?.sceneUrl);
        // editor:open 扇出：Camera 创建编辑器相机（并 detach 游戏相机）、NodeManager 绑定引擎级
        // 节点事件（运行期结构变化实时广播 → Hierarchy 跟随）、Gizmo 初始化等。
        ServiceEvents.emit('editor:open', this._scene);

        // 记录并屏蔽场景光设置（播放期间恒开，暂停时还原；对齐 Creator start）。
        try {
            this._sceneLightOn = Service.SceneView?.querySceneLightOn?.() ?? false;
            Service.SceneView?.setSceneLightOn(true);
        } catch { /* SceneView 未注册时忽略 */ }

        this.setPhysicsEnabled(true);
        this._registerDirectorEvents();
        this._firstPause = true;

        if (options?.paused) {
            // 冷启动暂停：不推进任何游戏帧，直接进入「可操作暂停态」（第 0 帧由编辑器 tick 渲染）。
            director.pause();
            game.pause();
            this._state = 'pause';
            this.enterPauseView();
        } else {
            this.hideEditorCamera();
            try { Service.Engine.pause(); } catch { /* Engine 未就绪时忽略 */ }
            this._state = 'play';
            this.applyPlayConfig();
            this.installPlayInputGate();
            director.resume();
            game.resume();
        }
        this.emit('preview-play:state-changed', this._state);
    }

    /** 暂停/继续。暂停=切回可操作编辑视图；继续=同一 director 从暂停处接着跑（不重载）。 */
    public async pause(isPause: boolean): Promise<void> {
        if (isPause) {
            if (this._state !== 'play') {
                return;
            }
            director.pause();
            game.pause();
            this._state = 'pause';
            this.removePlayInputGate();
            this.enterPauseView();
        } else {
            if (this._state !== 'pause') {
                return;
            }
            this.installPlayInputGate();
            this.hideEditorCamera();
            // 播放期间场景光恒开；用户设置保留到下次暂停还原（对齐 Creator pause(false)）。
            try { Service.SceneView?.setSceneLightOn(true); } catch { /* ignore */ }
            try { Service.Engine.pause(); } catch { /* ignore */ }
            this._state = 'play';
            this.applyPlayConfig();
            director.resume();
            game.resume();
        }
        this.emit('preview-play:state-changed', this._state);
    }

    /** 分步：仅暂停态有效。前进一帧（dt=1/fps）后保持暂停；返回是否执行。 */
    public step(): boolean {
        if (this._state !== 'pause') {
            return false;
        }
        const fps = Number.isFinite(this._fps) && this._fps > 0 ? this._fps : 60;
        director.resume();
        director.tick(1 / fps);
        director.pause();
        return true;
    }

    /** 退出 game view。宿主随后销毁 webview，这里只做本地状态与引擎开关的收敛。 */
    public async stop(): Promise<void> {
        if (this._state === 'stop') {
            return;
        }
        this._unregisterDirectorEvents();
        this.removePlayInputGate();
        this.setProfilerCameraUsage(false);
        this._hiddenEditorCameraNodes.clear();
        this._parkedGameCameras.clear();
        this.setPhysicsEnabled(false);
        try { Service.Editor?.releaseRuntimeScene?.(); } catch { /* Editor 未注册时忽略 */ }
        this._state = 'stop';
        try {
            game.pause();
            director.pause();
            Service.Engine.stopTick();
        } catch { /* 引擎可能已在销毁路径上 */ }
        this._scene = null;
        this.emit('preview-play:state-changed', this._state);
    }

    public setFps(fps: number): void {
        if (!(fps > 0)) {
            return;
        }
        this._fps = fps;
        if (this._state === 'play') {
            try { game.frameRate = fps; } catch { /* ignore */ }
        }
    }

    public showState(show: boolean): void {
        this._stats = !!show;
        if (this._state === 'play') {
            try { cc.debug?.setDisplayStats?.(this._stats); } catch { /* ignore */ }
        }
    }

    /**
     * 运行期新增相机组件（含暂停态经 Inspector 添加）：play 态把它挂回 mainWindow，
     * 抵消 CameraService.detachNewSceneCamera 的编辑器语义（对齐 Creator PreviewSceneFacade.onComponentAdded）。
     */
    public onComponentAdded(comp: any): void {
        if (this._state === 'stop' || !(comp instanceof Camera)) {
            return;
        }
        const playing = this._state === 'play';
        Promise.resolve().then(() => {
            try {
                const camera = (comp as Camera).camera;
                if (!camera || isEditorCamera(camera)) {
                    return;
                }
                if (playing) {
                    // play 态：挂回 mainWindow，抵消 CameraService.detachNewSceneCamera 的编辑器语义
                    // （对齐 Creator PreviewSceneFacade.onComponentAdded）。
                    this._parkedGameCameras.delete(camera);
                    camera.enabled = true;
                    const targetWindow = (comp as any).targetTexture?.window;
                    camera.changeTargetWindow(targetWindow || director.root?.mainWindow || null);
                } else {
                    // pause 态新增的游戏相机同样下屏，避免叠在编辑视图上。
                    this._parkedGameCameras.add(camera);
                    camera.enabled = false;
                }
            } catch { /* 相机尚未初始化时忽略 */ }
        });
    }

    // ---- 相机切换（单窗口简化版 hideEditorCamera/showEditorCamera） ---------

    /** 播放态：编辑器相机下屏（enabled=false + 节点隐藏 + 挪到 tempWindow），游戏相机挂回 mainWindow。 */
    public hideEditorCamera(): void {
        this.setProfilerCameraUsage(false);
        const root = (director as any).root;
        const scene = director.getScene() as any;
        const renderScene = scene?.renderScene || scene?._renderScene;
        const cameras: any[] = renderScene?.cameras ? [...renderScene.cameras] : [];
        // 逆序切换：priority 相同的相机保持与浏览器预览一致的渲染顺序（对齐 Creator 注释）。
        for (let index = cameras.length - 1; index >= 0; index--) {
            const camera = cameras[index];
            if (!camera) {
                continue;
            }
            if (isEditorCamera(camera)) {
                try { camera.enabled = false; } catch { /* ignore */ }
                try { camera.changeTargetWindow(root?.tempWindow ?? null); } catch { /* ignore */ }
                if (camera.node) {
                    this._hiddenEditorCameraNodes.add(camera.node);
                }
            } else {
                // 恢复播放：游戏相机重新启用并挂回 mainWindow（或 targetTexture 窗口）。
                this._parkedGameCameras.delete(camera);
                try { camera.enabled = true; } catch { /* ignore */ }
                try {
                    const comp = camera.node?.getComponent?.(Camera) as (Camera & { targetTexture?: any }) | null;
                    const targetWindow = comp?.targetTexture?.window;
                    camera.changeTargetWindow(targetWindow || root?.mainWindow || null);
                } catch { /* ignore */ }
            }
        }
        this._hiddenEditorCameraNodes.forEach((node) => {
            try { node.active = false; } catch { /* ignore */ }
        });
        // 播放态隐藏 2D 标尺坐标数值（对齐 Creator start 的 setRulerVisible(false)）。
        try { Service.Camera?.setRulerVisible?.(false); } catch { /* Camera 未注册时忽略 */ }
    }

    /**
     * 暂停态：恢复编辑器相机（上屏 mainWindow），游戏相机**必须 enabled=false 下屏**。
     * 仅 changeTargetWindow(tempWindow) 在本引擎构建上不可靠（tempWindow 与 mainWindow 共享
     * swapchain 时仍会绘制；tempWindow 缺失时 changeTargetWindow(null) 还会回落 mainWindow），
     * 表现为暂停画面里游戏相机全屏内容叠在编辑器视图上、元素不随编辑器相机缩放。
     */
    public showEditorCamera(): void {
        this._hiddenEditorCameraNodes.forEach((node) => {
            try { node.active = true; } catch { /* ignore */ }
        });
        this._hiddenEditorCameraNodes.clear();

        const root = (director as any).root;
        const scene = director.getScene() as any;
        const renderScene = scene?.renderScene || scene?._renderScene;
        const cameras: any[] = renderScene?.cameras ? [...renderScene.cameras] : [];
        for (let index = cameras.length - 1; index >= 0; index--) {
            const camera = cameras[index];
            if (!camera) {
                continue;
            }
            if (isEditorCamera(camera)) {
                try { camera.enabled = true; } catch { /* ignore */ }
                try { camera.changeTargetWindow(root?.mainWindow ?? null); } catch { /* ignore */ }
            } else {
                this._parkedGameCameras.add(camera);
                try { camera.enabled = false; } catch { /* ignore */ }
                try { camera.changeTargetWindow(root?.tempWindow ?? null); } catch { /* ignore */ }
            }
        }
        // 暂停态恢复标尺（编辑视图保持与场景编辑器一致的坐标尺）。
        try { Service.Camera?.setRulerVisible?.(true); } catch { /* Camera 未注册时忽略 */ }
    }

    /**
     * 暂停态的 stats 面板可见性开关：引擎只在 GAME / GAME_VIEW usage 的相机上开 profiler pass
     * （default-renderpipeline: `enableProfiler = ppl.profiler && isGameView`），暂停切回编辑器相机后
     * 恒不绘制。这里把「走全管线且上屏的编辑器相机」临时标为 GAME_VIEW，退出暂停时还原。
     */
    private setProfilerCameraUsage(enabled: boolean): void {
        if (!enabled) {
            this._profilerRetargetedCameras.forEach((usage, camera) => {
                try { camera.cameraUsage = usage; } catch { /* 相机已销毁时忽略 */ }
            });
            this._profilerRetargetedCameras.clear();
            return;
        }
        if (this._profilerRetargetedCameras.size > 0) {
            return;
        }
        const CameraUsage = (renderer as any)?.scene?.CameraUsage;
        if (!CameraUsage) {
            return;
        }
        const scene = director.getScene() as any;
        const renderScene = scene?.renderScene || scene?._renderScene;
        const cameras: any[] = renderScene?.cameras ? [...renderScene.cameras] : [];
        for (const camera of cameras) {
            // 只挑走全管线的编辑器相机：引擎要求 visibility 含 DEFAULT（enableFullPipeline），否则设了也不出面板。
            if (!camera || !isEditorCamera(camera) || !(camera.visibility & Layers.Enum.DEFAULT)) {
                continue;
            }
            this._profilerRetargetedCameras.set(camera, camera.cameraUsage);
            try { camera.cameraUsage = CameraUsage.GAME_VIEW; } catch { /* ignore */ }
        }
    }

    // ---- 内部 -------------------------------------------------------------

    private _registerDirectorEvents(): void {
        this._unregisterDirectorEvents();
        director.on(Director.EVENT_BEFORE_SCENE_LAUNCH, this._onSceneBeforeLaunch, this);
        director.on(Director.EVENT_AFTER_SCENE_LAUNCH, this._onSceneLaunch, this);
    }

    private _unregisterDirectorEvents(): void {
        director.off(Director.EVENT_BEFORE_SCENE_LAUNCH, this._onSceneBeforeLaunch, this);
        director.off(Director.EVENT_AFTER_SCENE_LAUNCH, this._onSceneLaunch, this);
    }

    /** 把当前运行场景登记为 EditorService 的编辑实体（服务层 getRootNode/isOpen 守卫由此满足）。 */
    private adoptRuntimeScene(sceneUrl: string | undefined): void {
        try {
            Service.Editor?.adoptRuntimeScene?.(this._scene as Scene, sceneUrl ? { url: sceneUrl } : undefined);
        } catch (error) {
            console.warn('[PreviewPlay] adopt runtime scene failed:', error);
        }
    }

    /** 进入暂停视图：编辑器相机 + 首次对焦 + 还原场景光 + 恢复编辑器 tick。 */
    private enterPauseView(): void {
        this.showEditorCamera();
        this.setProfilerCameraUsage(true);
        if (this._firstPause) {
            this._firstPause = false;
            try { Service.Camera?.defaultFocus(this._scene?.uuid ?? ''); } catch { /* ignore */ }
        }
        try { Service.SceneView?.setSceneLightOn(this._sceneLightOn); } catch { /* ignore */ }
        try {
            Service.Engine.resume();
            // usage 改动需一帧重绘才落到 pass 配置上；暂停态按需渲染，这里显式催一帧。
            void Service.Engine.repaintInEditMode?.();
        } catch { /* ignore */ }
    }

    private applyPlayConfig(): void {
        try { game.frameRate = this._fps; } catch { /* ignore */ }
        try { cc.debug?.setDisplayStats?.(this._stats); } catch { /* ignore */ }
    }

    private setPhysicsEnabled(enabled: boolean): void {
        try {
            const physicsSystem = cc.physics?.PhysicsSystem?.instance;
            if (physicsSystem) {
                physicsSystem.enable = enabled;
            }
        } catch (error) {
            console.warn('[PreviewPlay] toggle physics failed:', error);
        }
    }

    /** play 态：以 Preview 优先级接管 Operation 事件——转发给 cc.input（游戏）并短路编辑器侧处理。 */
    private installPlayInputGate(): void {
        if (this._inputGateHandlers.size > 0) {
            return;
        }
        // Service proxy 对未注册服务直接 throw，整体兜底避免 play 流程被输入门控装配失败阻断。
        try {
            const operation = Service.Operation as any;
            if (!operation?.addListener) {
                return;
            }
            for (const [type, dispatchMethod] of INPUT_REDIRECT) {
                const handler = (event: unknown): boolean => {
                    if (dispatchMethod) {
                        // 必须用 'cc' 模块导入的 input 实例（cc.input 命名空间属性在部分构建形态下缺失）；
                        // dispatch 包装方法在引擎产物中原名保留（exposed for Editor Only）。
                        const dispatch = (input as unknown as Record<string, unknown> | undefined)?.[dispatchMethod];
                        if (typeof dispatch === 'function') {
                            // pal 回调末尾会调 mouseEvent.stopPropagation()/preventDefault()，
                            // Operation 事件是纯数据对象，必须补齐原生事件方法否则抛 TypeError 中断派发。
                            const nativeLike = Object.assign({}, event as object, {
                                stopPropagation: () => { /* no-op */ },
                                preventDefault: () => { /* no-op */ },
                            });
                            try {
                                (dispatch as (evt: unknown) => void).call(input, nativeLike);
                            } catch { /* 单事件转发失败不影响后续事件 */ }
                        }
                    }
                    return false; // OperationManager.emit 在返回 false 时短路后续监听
                };
                this._inputGateHandlers.set(type, handler);
                operation.addListener(type, handler, OperationPriority.Preview);
            }
        } catch (error) {
            console.warn('[PreviewPlay] install input gate failed:', error);
        }
    }

    private removePlayInputGate(): void {
        if (this._inputGateHandlers.size === 0) {
            return;
        }
        try {
            const operation = Service.Operation as any;
            this._inputGateHandlers.forEach((handler, type) => {
                try { operation?.removeListener?.(type, handler); } catch { /* ignore */ }
            });
        } catch { /* ignore */ }
        this._inputGateHandlers.clear();
    }

}
