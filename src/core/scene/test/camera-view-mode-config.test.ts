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
    init = jest.fn();
    on = jest.fn();
    updateGrid = jest.fn();
    updateOriginAxisByConfig = jest.fn();
    refresh = jest.fn();
    focus = jest.fn();
    showGrid = jest.fn();
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
    gfx: {},
}));

jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => () => undefined,
    Service: mockService,
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
            node: {},
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
        await Promise.resolve();
        await Promise.resolve();

        expect(camera.is2D).toBe(true);
        expect(defaultFocus).toHaveBeenCalledWith('scene-uuid');
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
});

export {};
