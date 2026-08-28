export {};

const mockGetVisibleLOD = jest.fn();
const mockRegisterGizmo = jest.fn();
const mockControllerInstances: any[] = [];
const mockCameraNode = {
    on: jest.fn(),
    off: jest.fn(),
    getWorldRotation: jest.fn(),
};
const mockEditorCamera = {
    camera: {},
    node: mockCameraNode,
};
const mockService = {
    Camera: {
        getCamera: jest.fn(() => mockEditorCamera),
    },
    Engine: {
        repaintInEditMode: jest.fn(),
    },
    Gizmo: {
        gizmoRootNode: {},
    },
};

jest.mock('cc', () => {
    class MockComponent { }
    class MockLODGroup extends MockComponent { }
    class MockQuat { }
    class MockVec2 {
        constructor(public x = 0, public y = 0) { }
    }
    class MockVec3 {
        static readonly ZERO = new MockVec3();

        constructor(public x = 0, public y = 0, public z = 0) { }
    }

    return {
        Component: MockComponent,
        LODGroup: MockLODGroup,
        Quat: MockQuat,
        Vec2: MockVec2,
        Vec3: MockVec3,
        js: {
            getClassName: jest.fn((ctor: unknown) => ctor === MockLODGroup ? 'cc.LODGroup' : ''),
        },
    };
});

jest.mock('cc/editor/lod-group-utils', () => ({
    LODGroupEditorUtility: {
        getVisibleLOD: (...args: unknown[]) => mockGetVisibleLOD(...args),
    },
}), { virtual: true });

jest.mock('../scene-process/service/core/decorator', () => ({
    Service: mockService,
}));

jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({
    registerGizmo: (...args: unknown[]) => mockRegisterGizmo(...args),
}));

jest.mock('../scene-process/service/gizmo/base/gizmo-base', () => ({
    __esModule: true,
    default: class MockGizmoBase {
        protected _isInitialized = false;
        private _hidden = true;

        constructor(public target: unknown) { }

        protected getGizmoRoot(): unknown {
            return mockService.Gizmo.gizmoRootNode;
        }

        public initialize(): void {
            if (this._isInitialized) return;
            (this as any).init?.();
            this._isInitialized = true;
        }

        public show(): void {
            if (!this._hidden) return;
            this.initialize();
            (this as any).onShow?.();
            this._hidden = false;
        }

        public hide(): void {
            if (this._hidden) return;
            (this as any).onHide?.();
            this._hidden = true;
        }

        public destroy(): void {
            (this as any).onDestroy?.();
            this.hide();
            this.target = null;
        }

        public registerCameraMovedEvent(): void {
            mockService.Camera.getCamera()?.node?.on('transform-changed', (this as any).onEditorCameraMoved, this);
        }

        public unregisterCameraMoveEvent(): void {
            mockService.Camera.getCamera()?.node?.off('transform-changed', (this as any).onEditorCameraMoved, this);
        }
    },
}));

jest.mock('../scene-process/service/gizmo/components/lod-group/controller-lod', () => ({
    __esModule: true,
    default: class MockLODController {
        public show = jest.fn();
        public hide = jest.fn();
        public updateSize = jest.fn();
        public setString = jest.fn();
        public setPosition = jest.fn();
        public setRotation = jest.fn();
        public destroy = jest.fn();

        constructor(public rootNode: unknown) {
            mockControllerInstances.push(this);
        }
    },
}));

const { LODGroup, Vec2, Vec3 } = require('cc');
const lodGroupGizmoModule = require('../scene-process/service/gizmo/components/lod-group');

describe('LODGroup Gizmo', () => {
    beforeEach(() => {
        mockGetVisibleLOD.mockReset();
        mockCameraNode.on.mockClear();
        mockCameraNode.off.mockClear();
        mockCameraNode.getWorldRotation.mockClear();
        mockService.Camera.getCamera.mockReset();
        mockService.Camera.getCamera.mockReturnValue(mockEditorCamera);
        mockService.Engine.repaintInEditMode.mockClear();
        mockControllerInstances.length = 0;
    });

    it('registers the selected Gizmo for cc.LODGroup', () => {
        expect(lodGroupGizmoModule.name).toBe('cc.LODGroup');
        expect(mockRegisterGizmo).toHaveBeenCalledWith('cc.LODGroup', {
            SelectGizmo: lodGroupGizmoModule.SelectGizmo,
        });
    });

    it('ignores target and node updates before the controller is initialized', () => {
        const target = Object.assign(new LODGroup(), {
            objectSize: 1,
            node: {
                scale: { x: 1, y: 1, z: 1 },
                getWorldPosition: jest.fn(),
            },
        });
        const gizmo = new lodGroupGizmoModule.SelectGizmo(target);

        expect(() => gizmo.onTargetUpdate()).not.toThrow();
        expect(() => gizmo.onNodeChanged()).not.toThrow();
        expect(mockControllerInstances).toHaveLength(0);
        expect(mockService.Camera.getCamera).not.toHaveBeenCalled();
    });

    it('shows the current LOD and refreshes from camera or node changes', () => {
        const worldPosition = new Vec3(10, 20, 30);
        const target = Object.assign(new LODGroup(), {
            objectSize: 3,
            node: {
                scale: { x: -2, y: 1, z: 0.5 },
                getWorldPosition: jest.fn(() => worldPosition),
            },
        });
        mockGetVisibleLOD.mockReturnValue(2);

        const gizmo = new lodGroupGizmoModule.SelectGizmo(target);
        gizmo.show();
        gizmo.show();

        const controller = mockControllerInstances[0];
        expect(controller.rootNode).toBe(mockService.Gizmo.gizmoRootNode);
        expect(controller.updateSize).toHaveBeenCalledWith(Vec3.ZERO, new Vec2(6, 6));
        expect(controller.setString).toHaveBeenLastCalledWith('LOD 2');
        expect(controller.setPosition).toHaveBeenLastCalledWith(worldPosition);
        expect(mockGetVisibleLOD).toHaveBeenLastCalledWith(target, mockEditorCamera.camera);
        expect(mockCameraNode.on).toHaveBeenCalledTimes(1);

        mockGetVisibleLOD.mockReturnValue(-1);
        gizmo.onEditorCameraMoved();
        expect(controller.setString).toHaveBeenLastCalledWith('Culled');

        target.node.scale.x = 4;
        gizmo.onNodeChanged();
        expect(controller.updateSize).toHaveBeenLastCalledWith(Vec3.ZERO, new Vec2(12, 12));

        gizmo.hide();
        gizmo.hide();
        expect(mockCameraNode.off).toHaveBeenCalledTimes(1);
        expect(controller.hide).toHaveBeenCalled();
    });

    it('hides the controller while the editor camera is unavailable', () => {
        const target = Object.assign(new LODGroup(), {
            objectSize: 1,
            node: {
                scale: { x: 1, y: 1, z: 1 },
                getWorldPosition: jest.fn(),
            },
        });
        mockService.Camera.getCamera.mockReturnValue(null as any);

        const gizmo = new lodGroupGizmoModule.SelectGizmo(target);
        gizmo.show();

        const controller = mockControllerInstances[0];
        expect(controller.hide).toHaveBeenCalled();
        expect(controller.setString).not.toHaveBeenCalled();
        expect(mockService.Engine.repaintInEditMode).not.toHaveBeenCalled();
    });

    it('destroys the controller resources when the Gizmo is destroyed', () => {
        const target = Object.assign(new LODGroup(), {
            objectSize: 1,
            node: {
                scale: { x: 1, y: 1, z: 1 },
                getWorldPosition: jest.fn(() => new Vec3()),
            },
        });
        mockGetVisibleLOD.mockReturnValue(0);

        const gizmo = new lodGroupGizmoModule.SelectGizmo(target);
        gizmo.show();
        const controller = mockControllerInstances[0];

        gizmo.destroy();

        expect(mockCameraNode.off).toHaveBeenCalledTimes(1);
        expect(controller.hide).toHaveBeenCalled();
        expect(controller.destroy).toHaveBeenCalledTimes(1);
        expect(gizmo.target).toBeNull();
    });
});
