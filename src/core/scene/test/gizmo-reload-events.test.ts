import { EventEmitter } from 'events';

const mockService = {
    Selection: {
        query: jest.fn(),
    },
    Engine: {
        repaintInEditMode: jest.fn(),
    },
};
const mockGetClassName = jest.fn((obj: any) => obj?.__className ?? obj?.constructor?.name ?? '');
const mockGizmoDefines = {
    components: new Map(),
    iconGizmo: new Map(),
    persistentGizmo: new Map(),
    methods: new Map(),
};

jest.mock('cc', () => {
    class MockNode { }
    class MockComponent { }
    class MockCamera { }
    class MockColor { }
    class MockRect { }
    class MockVec3 { }

    return {
        __esModule: true,
        default: {
            director: {
                getScene: jest.fn(() => null),
            },
        },
        Camera: MockCamera,
        Color: MockColor,
        Component: MockComponent,
        gfx: {},
        js: {
            getClassName: mockGetClassName,
        },
        Layers: {
            Enum: {
                GIZMOS: 1 << 1,
                SCENE_GIZMO: 1 << 2,
                EDITOR: 1 << 3,
            },
        },
        Node: MockNode,
        Rect: MockRect,
        Vec3: MockVec3,
        director: {
            getScene: jest.fn(() => null),
        },
    };
});

jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => () => undefined,
    Service: mockService,
}));

jest.mock('../scene-process/service/gizmo/transform-tool', () => ({
    TransformToolData: class TransformToolData extends EventEmitter {
        toolName = 'position';
        is2D = true;
        snapConfigs = {};
    },
}));

jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({
    __esModule: true,
    default: mockGizmoDefines,
}));

jest.mock('../scene-process/service/gizmo/base/gizmo-base', () => ({
    __esModule: true,
    default: class GizmoBase { },
}));

jest.mock('../scene-process/service/gizmo/gizmo-operation', () => ({
    __esModule: true,
    default: class GizmoOperation {
        init = jest.fn();
    },
}));

jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({
    create3DNode: jest.fn(),
}));

jest.mock('../scene-process/service/gizmo/utils/rect-transform-snapping', () => ({
    rectTransformSnapping: {
        getPureDataObject: jest.fn(() => ({})),
        initFromData: jest.fn(),
    },
}));

jest.mock('../scene-process/service/gizmo/controller/world-axis', () => ({
    __esModule: true,
    default: class WorldAxisController { },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: jest.fn(),
    },
}));

jest.mock('../scene-process/service/gizmo/components/camera', () => ({}));
jest.mock('../scene-process/service/gizmo/components/box-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/directional-light', () => ({}));
jest.mock('../scene-process/service/gizmo/components/canvas', () => ({}));
jest.mock('../scene-process/service/gizmo/components/ui-transform', () => ({}));
jest.mock('../scene-process/service/gizmo/components/sphere-light', () => ({}));
jest.mock('../scene-process/service/gizmo/components/spot-light', () => ({}));
jest.mock('../scene-process/service/gizmo/components/sphere-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/capsule-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/cone-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/cylinder-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/plane-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/simplex-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/mesh-collider', () => ({}));
jest.mock('../scene-process/service/gizmo/components/box-collider-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/circle-collider-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/polygon-collider-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/mesh-renderer', () => ({}));
jest.mock('../scene-process/service/gizmo/components/skinned-mesh-renderer', () => ({}));
jest.mock('../scene-process/service/gizmo/components/video-player', () => ({}));
jest.mock('../scene-process/service/gizmo/components/web-view', () => ({}));

describe('Gizmo editor lifecycle', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.resetModules();
        jest.clearAllMocks();
        mockGizmoDefines.components.clear();
        mockGizmoDefines.iconGizmo.clear();
        mockGizmoDefines.persistentGizmo.clear();
        mockGizmoDefines.methods.clear();
    });

    it('initializes gizmos from editor open lifecycle', () => {
        jest.useFakeTimers();
        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();

        const clearAllGizmos = jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        const showIconGizmos = jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});
        const initFromConfig = jest.spyOn(gizmo, 'initFromConfig').mockImplementation(() => undefined as any);

        gizmo.onEditorOpened();

        expect(clearAllGizmos).toHaveBeenCalledTimes(1);
        expect(showIconGizmos).toHaveBeenCalledTimes(1);
        expect(initFromConfig).toHaveBeenCalledTimes(1);
        jest.runOnlyPendingTimers();
    });

    it('rebuilds selected gizmos from editor open lifecycle', () => {
        jest.useFakeTimers();
        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        (gizmo as any)._selection = ['old-node-uuid'];
        mockService.Selection.query.mockReturnValue(['/Canvas/button']);

        const clearAllGizmos = jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        const showIconGizmos = jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});
        jest.spyOn(gizmo, 'initFromConfig').mockImplementation(() => undefined as any);
        const onSelectionSelect = jest.spyOn(gizmo, 'onSelectionSelect').mockImplementation(() => {});

        gizmo.onEditorOpened();

        expect(clearAllGizmos).toHaveBeenCalledTimes(1);
        expect(showIconGizmos).toHaveBeenCalledTimes(1);
        expect((gizmo as any)._selection).toEqual([]);
        expect(onSelectionSelect).toHaveBeenCalledWith('/Canvas/button');
        jest.runOnlyPendingTimers();
        expect(mockService.Engine.repaintInEditMode).toHaveBeenCalledTimes(1);
    });

    it('does not reuse destroyed gizmos after clearing all gizmos', () => {
        const { GizmoService } = require('../scene-process/service/gizmo');
        class FakeGizmo {
            target: any = null;
            destroyed = false;
            private _visible = false;

            show() {
                this._visible = true;
            }

            hide() {
                this._visible = false;
            }

            visible() {
                return this._visible;
            }

            destroy() {
                this.destroyed = true;
                this.hide();
            }
        }
        mockGizmoDefines.components.set('FakeComponent', FakeGizmo);
        const gizmo = new GizmoService();
        const firstComponent = { __className: 'FakeComponent' };
        const secondComponent = { __className: 'FakeComponent' };

        (gizmo as any)._showGizmo('component', firstComponent);
        const firstGizmo = (gizmo as any)._componentPool.get('FakeComponent')?.[0];
        expect(firstGizmo).toBeDefined();

        gizmo.clearAllGizmos();
        (gizmo as any)._showGizmo('component', secondComponent);
        const secondGizmo = (gizmo as any)._componentPool.get('FakeComponent')?.[0];

        expect(firstGizmo.destroyed).toBe(true);
        expect(firstGizmo.target).toBeNull();
        expect(secondGizmo).not.toBe(firstGizmo);
        expect(secondGizmo.destroyed).toBe(false);
        expect(secondGizmo.target).toBe(secondComponent);
    });
});
