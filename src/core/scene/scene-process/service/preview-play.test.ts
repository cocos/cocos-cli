/**
 * PreviewPlayService（「Preview in Editor」game view 状态机）单测。
 *
 * 覆盖 Creator preview-play 移植后的核心语义：
 * - start：运行快照 → editor:open 扇出 → 物理开启 → 播放态（隐藏编辑器相机 + Engine.pause + 双 resume + 输入门控）
 *   或冷启动暂停态（双 pause + 暂停视图：编辑器相机 + Engine.resume，不推进任何帧）；
 * - pause(true/false)：暂停 = 可操作编辑态（切回编辑器相机、注销输入门控、丢弃游戏输入）；
 *   继续 = 同一 director 接着跑（不重载场景）；
 * - step：仅暂停态有效，resume → tick(1/fps) → pause；
 * - 运行期切场景：播放/暂停态都重新登记编辑实体并广播 editor:open，再恢复各自取景；
 * - stop：状态归 stop、物理关闭、tick 停止。
 */

const mockRunSceneImmediateByJson = jest.fn();
const mockServiceEventsEmit = jest.fn();
const mockEnginePause = jest.fn();
const mockEngineResume = jest.fn();
const mockEngineStopTick = jest.fn();
const mockEngineRepaint = jest.fn();
const mockDefaultFocus = jest.fn();
const mockSetSceneLightOn = jest.fn();
const mockQuerySceneLightOn = jest.fn(() => false);
const mockSelectionClear = jest.fn();
const mockOperationAddListener = jest.fn();
const mockOperationRemoveListener = jest.fn();
const mockAdoptRuntimeScene = jest.fn();
const mockReleaseRuntimeScene = jest.fn();

jest.mock('./scene/utils', () => ({
    sceneUtils: {
        runSceneImmediateByJson: (...args: any[]) => mockRunSceneImmediateByJson(...args),
    },
}));

jest.mock('./core/global-events', () => ({
    ServiceEvents: {
        emit: (...args: any[]) => mockServiceEventsEmit(...args),
        on: jest.fn(),
        off: jest.fn(),
    },
}));

const mockServiceRegistry: Record<string, any> = {};

jest.mock('./core', () => {
    class MockBaseService {
        protected emit(..._args: any[]): void { /* no-op：状态事件不进 ServiceEvents 断言链 */ }
    }
    return {
        BaseService: MockBaseService,
        register: () => (target: any) => target,
        Service: new Proxy({}, {
            get(_target, prop: string) {
                const svc = mockServiceRegistry[prop];
                if (!svc) {
                    throw new Error(`[Service] '${prop}' is not registered.`);
                }
                return svc;
            },
        }),
    };
});

jest.mock('cc', () => {
    class MockCameraComponent {
        camera: any = null;
        targetTexture: any = null;
    }
    const mockDirector = {
        pause: jest.fn(),
        resume: jest.fn(),
        tick: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        getScene: jest.fn(),
        root: null as any,
    };
    const mockGame = { pause: jest.fn(), resume: jest.fn(), frameRate: 60 };
    const mockInput = {
        _dispatchMouseDownEvent: jest.fn(),
        _dispatchMouseMoveEvent: jest.fn(),
        _dispatchMouseUpEvent: jest.fn(),
        _dispatchMouseScrollEvent: jest.fn(),
        _dispatchKeyboardDownEvent: jest.fn(),
        _dispatchKeyboardUpEvent: jest.fn(),
    };
    return {
        __esModule: true,
        Camera: MockCameraComponent,
        Director: {
            EVENT_BEFORE_SCENE_LAUNCH: 'director_before_scene_launch',
            EVENT_AFTER_SCENE_LAUNCH: 'director_after_scene_launch',
        },
        director: mockDirector,
        game: mockGame,
        input: mockInput,
        Layers: {
            Enum: { GIZMOS: 1, SCENE_GIZMO: 2, EDITOR: 4, DEFAULT: 8 },
            makeMaskInclude: (layers: number[]) => layers.reduce((acc, value) => acc | value, 0),
        },
        Node: class MockNode {},
        Scene: class MockScene {},
        renderer: {
            scene: {
                // 与引擎枚举同序：EDITOR=0, GAME_VIEW=1, SCENE_VIEW=2, PREVIEW=3, GAME=4
                CameraUsage: { EDITOR: 0, GAME_VIEW: 1, SCENE_VIEW: 2, PREVIEW: 3, GAME: 4 },
            },
        },
        __mockDirector: mockDirector,
        __mockGame: mockGame,
        __mockInput: mockInput,
    };
}, { virtual: true });

import * as ccModule from 'cc';
import { PreviewPlayService } from './preview-play';

const mockDirector = (ccModule as any).__mockDirector as {
    pause: jest.Mock; resume: jest.Mock; tick: jest.Mock; on: jest.Mock; off: jest.Mock;
    getScene: jest.Mock; root: any;
};
const mockGame = (ccModule as any).__mockGame as { pause: jest.Mock; resume: jest.Mock; frameRate: number };
const mockInput = (ccModule as any).__mockInput as Record<string, jest.Mock>;

interface ICameraStub {
    node: { layer: number; active: boolean; getComponent: () => unknown };
    enabled: boolean;
    cameraUsage: number;
    changeTargetWindow: jest.Mock;
}

function createCameraStub(layer: number, usage: number): ICameraStub {
    return {
        node: { layer, active: true, getComponent: () => ({ targetTexture: null }) },
        enabled: true,
        cameraUsage: usage,
        changeTargetWindow: jest.fn(),
    };
}

const SCENE_JSON = JSON.stringify([{ name: 'scene-json' }]);

describe('PreviewPlayService (game view 状态机)', () => {
    let service: PreviewPlayService;
    let editorCamera: ICameraStub;
    let gameCamera: ICameraStub;
    let scene: { uuid: string; renderScene: { cameras: ICameraStub[] } };
    let physicsInstance: { enable: boolean };
    let setDisplayStats: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        editorCamera = createCameraStub(4 /* EDITOR layer */, 2 /* SCENE_VIEW usage */);
        gameCamera = createCameraStub(8 /* DEFAULT layer */, 1 /* GAME_VIEW usage */);
        scene = { uuid: 'scene-uuid-1', renderScene: { cameras: [editorCamera, gameCamera] } };
        mockDirector.getScene.mockReturnValue(scene);
        mockDirector.root = { mainWindow: { name: 'main' }, tempWindow: { name: 'temp' } };
        mockRunSceneImmediateByJson.mockResolvedValue(scene);

        physicsInstance = { enable: false };
        setDisplayStats = jest.fn();
        (globalThis as any).cc = {
            physics: { PhysicsSystem: { instance: physicsInstance } },
            debug: { setDisplayStats },
        };

        mockServiceRegistry.Engine = {
            pause: mockEnginePause,
            resume: mockEngineResume,
            stopTick: mockEngineStopTick,
            repaintInEditMode: mockEngineRepaint,
        };
        mockServiceRegistry.Camera = { defaultFocus: mockDefaultFocus };
        mockServiceRegistry.SceneView = {
            setSceneLightOn: mockSetSceneLightOn,
            querySceneLightOn: mockQuerySceneLightOn,
        };
        mockServiceRegistry.Selection = { clear: mockSelectionClear };
        mockServiceRegistry.Operation = {
            addListener: mockOperationAddListener,
            removeListener: mockOperationRemoveListener,
        };
        mockServiceRegistry.Editor = {
            adoptRuntimeScene: mockAdoptRuntimeScene,
            releaseRuntimeScene: mockReleaseRuntimeScene,
        };

        service = new PreviewPlayService();
    });

    afterEach(() => {
        delete (globalThis as any).cc;
    });

    it('start（播放态）：运行快照、扇出 editor:open、开物理、隐藏编辑器相机、停编辑器 tick、双 resume、装输入门控', async () => {
        await service.start(SCENE_JSON);

        expect(mockRunSceneImmediateByJson).toHaveBeenCalledWith(JSON.parse(SCENE_JSON));
        // 运行场景必须先登记为编辑实体（服务层 getRootNode/isOpen 守卫），再扇出 editor:open
        expect(mockAdoptRuntimeScene).toHaveBeenCalledWith(scene, undefined);
        const adoptOrder = mockAdoptRuntimeScene.mock.invocationCallOrder[0];
        let openOrder = Infinity;
        for (let i = 0; i < mockServiceEventsEmit.mock.calls.length; i++) {
            if (mockServiceEventsEmit.mock.calls[i][0] === 'editor:open') {
                openOrder = mockServiceEventsEmit.mock.invocationCallOrder[i];
                break;
            }
        }
        expect(adoptOrder).toBeLessThan(openOrder);
        expect(mockServiceEventsEmit).toHaveBeenCalledWith('editor:open', scene);
        expect(physicsInstance.enable).toBe(true);
        // 编辑器相机下屏：enabled=false + 节点隐藏 + 挪 tempWindow；游戏相机挂回 mainWindow
        expect(editorCamera.enabled).toBe(false);
        expect(editorCamera.node.active).toBe(false);
        expect(editorCamera.changeTargetWindow).toHaveBeenCalledWith(mockDirector.root.tempWindow);
        expect(gameCamera.changeTargetWindow).toHaveBeenCalledWith(mockDirector.root.mainWindow);
        expect(mockEnginePause).toHaveBeenCalled();
        expect(mockDirector.resume).toHaveBeenCalled();
        expect(mockGame.resume).toHaveBeenCalled();
        expect(service.getState()).toBe('play');
        expect(service.isPause()).toBe(false);
        // play 态输入门控：Operation 以 Preview(999) 优先级注册短路监听
        expect(mockOperationAddListener).toHaveBeenCalled();
        const [, , priority] = mockOperationAddListener.mock.calls[0];
        expect(priority).toBe(999);
        // 运行场景换场景钩子已注册
        expect(mockDirector.on).toHaveBeenCalledWith('director_before_scene_launch', expect.any(Function), service);
        expect(mockDirector.on).toHaveBeenCalledWith('director_after_scene_launch', expect.any(Function), service);
    });

    it('play 态：画布输入按 DOM 坐标转发到 cc.input 并短路编辑器处理（EDITOR 构建无原生 DOM 监听）', async () => {
        await service.start(SCENE_JSON);
        const mousedownCall = mockOperationAddListener.mock.calls.find(c => c[0] === 'mousedown');
        expect(mousedownCall).toBeDefined();
        const handler = mousedownCall![1] as (e: unknown) => boolean;
        expect(mousedownCall![2]).toBe(999);
        // input-bridge 产出的事件：x/y 是渲染缓冲像素（编辑器侧用），clientX/clientY 保留 DOM 页面坐标。
        const evt = { x: 300, y: 200, clientX: 250, clientY: 150, button: 0, buttons: 1 };
        // 门控必须短路编辑器侧处理（返回 false）
        expect(handler(evt)).toBe(false);
        expect(mockInput._dispatchMouseDownEvent).toHaveBeenCalledTimes(1);
        const dispatched = mockInput._dispatchMouseDownEvent.mock.calls[0][0];
        // 引擎 MouseInputSource._getLocation 自行减 canvas 偏移并乘 DPR：转发的必须是 DOM 坐标，
        // 否则画布不在页面原点或 DPR≠1 时点击/拾取整体偏移。
        expect(dispatched.clientX).toBe(250);
        expect(dispatched.clientY).toBe(150);
        expect(dispatched.button).toBe(0);
        expect(dispatched.buttons).toBe(1);
        // pal 回调末尾会调 stopPropagation()/preventDefault()，缺失会抛 TypeError 中断派发
        expect(typeof dispatched.stopPropagation).toBe('function');
        expect(typeof dispatched.preventDefault).toBe('function');
        expect(() => { dispatched.stopPropagation(); dispatched.preventDefault(); }).not.toThrow();
        // 暂停态卸载重定向：输入只给编辑器逻辑
        await service.pause(true);
        expect(mockOperationRemoveListener).toHaveBeenCalled();
    });

    it('start（冷启动暂停）：不推进任何帧，直接进入可操作暂停态（编辑器相机 + Engine.resume）', async () => {
        await service.start(SCENE_JSON, { paused: true });

        expect(mockDirector.pause).toHaveBeenCalled();
        expect(mockGame.pause).toHaveBeenCalled();
        expect(mockDirector.resume).not.toHaveBeenCalled();
        expect(mockGame.resume).not.toHaveBeenCalled();
        expect(service.getState()).toBe('pause');
        expect(service.isPause()).toBe(true);
        // 暂停视图：编辑器相机保持上屏（未被隐藏），编辑器 tick 恢复，首次对焦
        expect(editorCamera.enabled).toBe(true);
        expect(editorCamera.node.active).toBe(true);
        expect(mockEngineResume).toHaveBeenCalled();
        expect(mockDefaultFocus).toHaveBeenCalledWith('scene-uuid-1');
        expect(mockOperationAddListener).not.toHaveBeenCalled();
    });

    it('pause(true)：双暂停 + 切回编辑器相机 + 恢复编辑器 tick + 卸输入门控 + 丢弃游戏输入', async () => {
        await service.start(SCENE_JSON);
        jest.clearAllMocks();

        await service.pause(true);

        expect(mockDirector.pause).toHaveBeenCalled();
        expect(mockGame.pause).toHaveBeenCalled();
        expect(service.getState()).toBe('pause');
        // 编辑器相机恢复：node.active=true + enabled=true + 回 mainWindow；游戏相机挪 tempWindow（画面冻结）
        expect(editorCamera.node.active).toBe(true);
        expect(editorCamera.enabled).toBe(true);
        expect(editorCamera.changeTargetWindow).toHaveBeenCalledWith(mockDirector.root.mainWindow);
        expect(gameCamera.changeTargetWindow).toHaveBeenCalledWith(mockDirector.root.tempWindow);
        // 游戏相机必须真正下屏（仅 park 到 tempWindow 在本引擎构建上仍会绘制）
        expect(gameCamera.enabled).toBe(false);
        expect(mockEngineResume).toHaveBeenCalled();
        expect(mockOperationRemoveListener).toHaveBeenCalled();
        // 场景光还原为用户设置
        expect(mockSetSceneLightOn).toHaveBeenCalledWith(false);
    });

    it('pause(false)：同一 director 接着跑（不重载场景），恢复播放态取景与输入门控', async () => {
        await service.start(SCENE_JSON);
        await service.pause(true);
        jest.clearAllMocks();
        mockRunSceneImmediateByJson.mockClear();

        await service.pause(false);

        expect(mockDirector.resume).toHaveBeenCalled();
        expect(mockGame.resume).toHaveBeenCalled();
        expect(service.getState()).toBe('play');
        // 继续绝不重载场景/重启引擎
        expect(mockRunSceneImmediateByJson).not.toHaveBeenCalled();
        // 恢复播放态：编辑器相机下屏、游戏相机回 mainWindow、编辑器 tick 停
        expect(editorCamera.enabled).toBe(false);
        expect(gameCamera.enabled).toBe(true);
        expect(gameCamera.changeTargetWindow).toHaveBeenCalledWith(mockDirector.root.mainWindow);
        expect(mockEnginePause).toHaveBeenCalled();
        expect(mockOperationAddListener).toHaveBeenCalled();
    });

    it('step：仅暂停态有效，resume → tick(1/fps) → pause，播放/停止态拒绝', async () => {
        await service.start(SCENE_JSON, { paused: true });
        service.setFps(30);
        jest.clearAllMocks();

        expect(service.step()).toBe(true);
        expect(mockDirector.resume).toHaveBeenCalled();
        expect(mockDirector.tick).toHaveBeenCalledWith(1 / 30);
        expect(mockDirector.pause).toHaveBeenCalled();
        // 步进后保持暂停态（窗口仍可操作）
        expect(service.getState()).toBe('pause');
        expect(mockGame.resume).not.toHaveBeenCalled();

        // 播放态不允许 step（须先暂停）
        await service.pause(false);
        jest.clearAllMocks();
        expect(service.step()).toBe(false);
        expect(mockDirector.tick).not.toHaveBeenCalled();

        // 停止态不允许 step
        await service.stop();
        expect(service.step()).toBe(false);
    });

    it('重复 pause/幂等：已在目标态时直接返回，不重复切换', async () => {
        await service.start(SCENE_JSON);
        await service.pause(true);
        jest.clearAllMocks();

        await service.pause(true);
        expect(mockDirector.pause).not.toHaveBeenCalled();
        expect(mockEngineResume).not.toHaveBeenCalled();
        expect(service.getState()).toBe('pause');
    });

    it('stop：状态归 stop、物理关闭、注销 director 事件与输入门控、编辑器 tick 停止', async () => {
        await service.start(SCENE_JSON);
        await service.pause(true);
        jest.clearAllMocks();

        await service.stop();

        expect(service.getState()).toBe('stop');
        expect(physicsInstance.enable).toBe(false);
        expect(mockReleaseRuntimeScene).toHaveBeenCalled();
        expect(mockDirector.off).toHaveBeenCalledWith('director_before_scene_launch', expect.any(Function), service);
        expect(mockDirector.off).toHaveBeenCalledWith('director_after_scene_launch', expect.any(Function), service);
        expect(mockEngineStopTick).toHaveBeenCalled();
    });

    it('setFps/showState：仅播放态即时生效，暂停态记忆、恢复播放时套用', async () => {
        await service.start(SCENE_JSON, { paused: true });
        service.setFps(30);
        service.showState(true);
        expect(mockGame.frameRate).not.toBe(30);
        expect(setDisplayStats).not.toHaveBeenCalled();

        await service.pause(false);
        expect(mockGame.frameRate).toBe(30);
        expect(setDisplayStats).toHaveBeenCalledWith(true);
    });

    it('运行期脚本切场景：AFTER_SCENE_LAUNCH 在播放态重挂相机并重新广播 editor:open', async () => {
        await service.start(SCENE_JSON);
        const launchHandler = mockDirector.on.mock.calls.find(
            (call: any[]) => call[0] === 'director_after_scene_launch',
        )?.[1] as (scene: unknown) => void;
        expect(typeof launchHandler).toBe('function');
        const beforeHandler = mockDirector.on.mock.calls.find(
            (call: any[]) => call[0] === 'director_before_scene_launch',
        )?.[1] as (scene: unknown) => void;

        const nextScene = { uuid: 'scene-uuid-2', renderScene: { cameras: [gameCamera] } };
        mockServiceEventsEmit.mockClear();
        beforeHandler(scene);
        expect(mockServiceEventsEmit).toHaveBeenCalledWith('editor:close', scene);
        expect(mockSelectionClear).toHaveBeenCalled();
        mockDirector.getScene.mockReturnValue(nextScene);
        launchHandler(nextScene);
        expect(mockServiceEventsEmit).toHaveBeenCalledWith('editor:open', nextScene);
        expect(gameCamera.changeTargetWindow).toHaveBeenLastCalledWith(mockDirector.root.mainWindow);
    });

    it('暂停期间完成切场景：登记新场景并广播 editor:open，恢复播放后不再挂在旧场景', async () => {
        await service.start(SCENE_JSON);
        await service.pause(true);
        const beforeHandler = mockDirector.on.mock.calls.find(
            (call: any[]) => call[0] === 'director_before_scene_launch',
        )?.[1] as (scene: unknown) => void;
        const launchHandler = mockDirector.on.mock.calls.find(
            (call: any[]) => call[0] === 'director_after_scene_launch',
        )?.[1] as (scene: unknown) => void;
        expect(typeof launchHandler).toBe('function');

        // 异步加载在暂停后才完成（或 step 触发切场景）：director 已指向新场景
        const nextScene = { uuid: 'scene-uuid-2', renderScene: { cameras: [editorCamera, gameCamera] } };
        jest.clearAllMocks();
        mockDirector.getScene.mockReturnValue(nextScene);

        beforeHandler(scene);
        expect(mockServiceEventsEmit).toHaveBeenCalledWith('editor:close', scene);
        launchHandler(nextScene);

        // Editor 必须跟随新场景，否则 Hierarchy/Inspector 仍指向旧场景
        expect(mockAdoptRuntimeScene).toHaveBeenCalledWith(nextScene, undefined);
        expect(mockServiceEventsEmit).toHaveBeenCalledWith('editor:open', nextScene);
        // 暂停取景恢复：编辑器相机上屏、游戏相机下屏、编辑器 tick 继续
        expect(editorCamera.enabled).toBe(true);
        expect(editorCamera.changeTargetWindow).toHaveBeenCalledWith(mockDirector.root.mainWindow);
        expect(gameCamera.enabled).toBe(false);
        expect(mockEnginePause).not.toHaveBeenCalled();
        expect(mockEngineResume).toHaveBeenCalled();
        expect(service.getState()).toBe('pause');

        // 恢复播放：新场景的游戏相机上屏、编辑器相机下屏
        await service.pause(false);
        expect(service.getState()).toBe('play');
        expect(editorCamera.enabled).toBe(false);
        expect(gameCamera.enabled).toBe(true);
        expect(gameCamera.changeTargetWindow).toHaveBeenLastCalledWith(mockDirector.root.mainWindow);
    });

    it('start 快照非法 JSON：报错且不进入任何播放状态', async () => {
        await expect(service.start('{ broken json')).rejects.toThrow(/invalid serialized scene json/);
        expect(service.getState()).toBe('stop');
        expect(mockRunSceneImmediateByJson).not.toHaveBeenCalled();
    });
});
