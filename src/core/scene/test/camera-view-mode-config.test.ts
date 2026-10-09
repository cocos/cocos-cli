const mockRpcRequest = jest.fn();

const mockService: any = {
    Editor: {
        getRootNode: jest.fn(() => null),
    },
    Engine: {
        repaintInEditMode: jest.fn(),
    },
    Gizmo: {
        backgroundNode: { name: 'background' },
        transformToolData: { is2D: false },
        setGridColor: jest.fn(),
    },
    Operation: {
        addListener: jest.fn(),
        dispatch: jest.fn(),
    },
};

class MockColor {
    constructor(
        public r = 0,
        public g = 0,
        public b = 0,
        public a = 255,
    ) {}
}

class MockController {
    activeValues: boolean[] = [];
    node = {
        getWorldPosition: () => ({ x: 640, y: 360, z: 5000 }),
        getWorldRotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    };
    sceneViewCenter = { x: 0, y: 0, z: 0 };
    contentRect = { x: 0, y: 0, width: 1280, height: 720 };
    scale2D = 1;
    init = jest.fn();
    on = jest.fn();
    updateGrid = jest.fn();
    updateOriginAxisByConfig = jest.fn();
    refresh = jest.fn();
    focus = jest.fn();
    showGrid = jest.fn();
    reset = jest.fn();
    isGridVisible = true;
    lineColor: any;

    private _active = false;

    set active(value: boolean) {
        this._active = value;
        this.activeValues.push(value);
    }

    get active() {
        return this._active;
    }
}

jest.mock('cc', () => ({
    Camera: class {},
    Canvas: class {},
    Color: MockColor,
    Layers: { Enum: { EDITOR: 1, IGNORE_RAYCAST: 2 } },
    Vec3: class {},
    Quat: { IDENTITY: { x: 0, y: 0, z: 0, w: 1 } },
    gfx: {},
}));

jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => () => undefined,
    Service: mockService,
    queryRegisteredService: (name: string) => mockService[name] ?? null,
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: () => ({ request: mockRpcRequest }),
    },
}));

jest.mock('../scene-process/service/camera/camera-controller-2d', () => ({
    CameraController2D: MockController,
}));

jest.mock('../scene-process/service/camera/camera-controller-3d', () => ({
    CameraController3D: MockController,
}));

jest.mock('../scene-process/service/camera/utils', () => ({
    CameraMoveMode: { IDLE: 0 },
    CameraUtils: {
        createCamera: jest.fn(() => ({
            camera: { update: jest.fn() },
            clearColor: new MockColor(48, 48, 48, 255),
            far: 10000,
            fov: 45,
            near: 0.01,
            node: { setWorldRotation: jest.fn() },
        })),
    },
}));

jest.mock('../scene-process/service/camera/editor-camera-component', () => ({
    __esModule: true,
    default: class EditorCameraComponent {},
}));

describe('CameraService view mode config', () => {
    async function flushConfigRestore() {
        await Promise.resolve();
        await Promise.resolve();
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockService.Gizmo.transformToolData.is2D = false;
        mockRpcRequest.mockImplementation((_service, _method, args) => {
            const [key] = args;
            if (key === 'gizmo') return Promise.resolve({ is2D: true });
            return Promise.resolve(undefined);
        });
        (global as any).cc = {
            director: {
                getScene: jest.fn(() => ({ uuid: 'scene-uuid' })),
            },
            view: { on: jest.fn() },
        };
    });

    afterEach(() => {
        delete (global as any).cc;
    });

    it('restores the saved 2D view when the scene editor is reopened', async () => {
        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();

        camera.onEditorOpened();
        await flushConfigRestore();

        expect(camera.is2D).toBe(true);
        expect(mockService.Gizmo.transformToolData.is2D).toBe(true);

        camera.is2D = false;
        expect(camera.is2D).toBe(false);

        camera.onEditorOpened();
        await flushConfigRestore();

        expect(camera.is2D).toBe(true);
        expect(mockService.Gizmo.transformToolData.is2D).toBe(true);
    });

    it('waits for view mode config before running deferred focus', async () => {
        let resolveGizmoConfig!: (value: { is2D: boolean }) => void;
        const gizmoConfig = new Promise<{ is2D: boolean }>((resolve) => {
            resolveGizmoConfig = resolve;
        });

        mockRpcRequest.mockImplementation((_service, _method, args) => {
            const [key] = args;
            if (key === 'gizmo') return gizmoConfig;
            return Promise.resolve(undefined);
        });

        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();
        const defaultFocus = jest.spyOn(camera, 'defaultFocus');

        camera.onEditorOpened();
        await Promise.resolve();

        expect(defaultFocus).not.toHaveBeenCalled();

        resolveGizmoConfig({ is2D: true });
        await new Promise(resolve => setImmediate(resolve));

        expect(camera.is2D).toBe(true);
        expect(defaultFocus).toHaveBeenCalledWith('scene-uuid');
    });

    it('reconciles stale toolbar dimension when reopening in the same 3D mode', async () => {
        mockRpcRequest.mockImplementation((_service, _method, args) => {
            if (args[0] === 'gizmo') return Promise.resolve({ is2D: false });
            return Promise.resolve(undefined);
        });
        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();
        camera.onEditorOpened();
        await new Promise(resolve => setImmediate(resolve));
        expect(camera.is2D).toBe(false);

        // The UI reads Gizmo state, which can be populated before the camera is ready.
        mockService.Gizmo.transformToolData.is2D = true;
        camera.controller3D.activeValues.length = 0;
        camera.onEditorOpened();
        await new Promise(resolve => setImmediate(resolve));

        expect(camera.is2D).toBe(false);
        expect(mockService.Gizmo.transformToolData.is2D).toBe(false);
        expect(camera.controller3D.activeValues).toEqual([]);
    });

    it('restores the saved front view on the first manual 2D to 3D switch', async () => {
        const frontView = {
            position: { x: 640, y: 360, z: 5000 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
        };
        let resolveViews!: (value: any) => void;
        const views = new Promise(resolve => { resolveViews = resolve; });
        mockRpcRequest.mockImplementation((_service, _method, args) => {
            if (args[0] === 'gizmo') return Promise.resolve({ is2D: true });
            if (args[0] === 'camera-infos') return views;
            return Promise.resolve(undefined);
        });
        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();
        camera.onEditorOpened();
        await new Promise(resolve => setImmediate(resolve));
        expect(camera.is2D).toBe(true);
        expect(camera.controller2D.focus).not.toHaveBeenCalled();

        resolveViews({ 'scene-uuid': frontView });
        await new Promise(resolve => setImmediate(resolve));
        expect(camera.controller2D.focus).toHaveBeenCalledWith(null, frontView, true);
        camera.is2D = false;
        expect(camera.controller3D.focus).toHaveBeenCalledWith(null, frontView, true);

        camera.controller2D.focus.mockClear();
        camera.controller3D.focus.mockClear();
        camera.is2D = true;
        camera.is2D = false;
        expect(camera.controller2D.focus).not.toHaveBeenCalled();
        expect(camera.controller3D.focus).not.toHaveBeenCalled();
    });

    it('starts a new scene in its current front view on the first 2D to 3D switch', async () => {
        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();
        camera.onEditorOpened();
        await new Promise(resolve => setImmediate(resolve));
        const frontView = {
            position: { x: 640, y: 360, z: 5000 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
        };
        const capture = jest.spyOn(camera, 'getCurCameraInfo').mockImplementation(() => {
            expect(camera.is2D).toBe(true);
            return frontView;
        });
        camera.is2D = false;
        expect(capture).toHaveBeenCalledTimes(1);
        expect(camera.controller3D.focus).toHaveBeenCalledWith(null, frontView, true);

        camera.controller3D.focus.mockClear();
        camera.is2D = true;
        camera.is2D = false;
        expect(capture).toHaveBeenCalledTimes(1);
        expect(camera.controller3D.focus).not.toHaveBeenCalled();
    });

    it('loads merged gizmo config without applying origin axes in CameraService', async () => {
        const originAxis3D = { x: true, y: false, z: true };
        mockRpcRequest.mockImplementation((_service, _method, args) => {
            const [key] = args;
            if (key === 'gizmo') return Promise.resolve({ is2D: false, originAxis3D });
            return Promise.resolve(undefined);
        });

        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();

        camera.onEditorOpened();
        await flushConfigRestore();

        expect(mockRpcRequest).toHaveBeenCalledWith('sceneConfigInstance', 'get', ['gizmo']);
        expect(mockRpcRequest).not.toHaveBeenCalledWith('sceneConfigInstance', 'get', ['gizmo', 'local']);
        expect(camera.controller2D.updateOriginAxisByConfig).not.toHaveBeenCalled();
        expect(camera.controller3D.updateOriginAxisByConfig).not.toHaveBeenCalled();
    });

    it.each(['2d', '3d'] as const)('preserves the current direction when opening a new %s template in 3D', async (mode) => {
        const canvas = { node: { uuid: 'canvas' } };
        mockService.Editor.getRootNode.mockReturnValue({ uuid: 'root', getComponentInChildren: () => canvas });
        mockRpcRequest.mockImplementation((_service, _method, args) => {
            if (args[0] === 'gizmo') return Promise.resolve({ is2D: false });
            if (args[0] === 'sceneView') return Promise.resolve({ initialModes: { 'scene-uuid': mode } });
            return Promise.resolve(undefined);
        });
        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();
        camera.onEditorOpened();
        await new Promise(resolve => setImmediate(resolve));
        expect(camera.is2D).toBe(false);
        expect(camera.camera.node.setWorldRotation).not.toHaveBeenCalled();
        expect(camera.controller3D.reset).not.toHaveBeenCalled();
        expect(camera.controller3D.focus).toHaveBeenCalledWith(['root'], undefined, true);
        mockService.Editor.getRootNode.mockReturnValue(null);
    });

    it('keeps the inactive controller grid hidden when origin axes are updated externally', () => {
        const originAxis2D = { x: true, y: true, z: false };
        const originAxis3D = { x: true, y: false, z: true };

        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();
        camera.setOriginAxes2D(originAxis2D);
        camera.setOriginAxes3D(originAxis3D);

        expect(camera.controller2D.updateOriginAxisByConfig).toHaveBeenCalledWith({
            x: originAxis2D.x,
            y: originAxis2D.y,
        });
        expect(camera.controller3D.updateOriginAxisByConfig).toHaveBeenCalledWith(originAxis3D);
        expect(camera.controller2D.showGrid).toHaveBeenLastCalledWith(false);
        expect(camera.controller3D.showGrid).toHaveBeenLastCalledWith(true);
    });

    it('delegates grid color changes to the Gizmo config owner so they persist', () => {
        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();
        (mockService.Gizmo.setGridColor as jest.Mock).mockClear();

        camera.setGridColor([12, 34, 56, 78]);

        // 归属 Gizmo：由 Gizmo.setGridColor 更新 GizmoConfig 并整块落盘，避免只改渲染而不持久化
        expect(mockService.Gizmo.setGridColor).toHaveBeenCalledWith([12, 34, 56, 78]);
    });

    it('only applies grid color to controllers without delegating when persist is false', () => {
        const { CameraService } = require('../scene-process/service/camera');
        const camera = new CameraService();
        camera.init();
        (mockService.Gizmo.setGridColor as jest.Mock).mockClear();

        camera.setGridColor([12, 34, 56, 78], false);

        expect(mockService.Gizmo.setGridColor).not.toHaveBeenCalled();
        expect(camera.controller3D.lineColor).toEqual(
            expect.objectContaining({ r: 12, g: 34, b: 56, a: 78 }),
        );
        expect(camera.controller2D.lineColor).toEqual(
            expect.objectContaining({ r: 12, g: 34, b: 56, a: 78 }),
        );
    });
});

export {};
