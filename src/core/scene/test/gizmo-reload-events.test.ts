import { EventEmitter } from 'events';

const mockService = {
    Selection: {
        query: jest.fn(),
        clear: jest.fn(),
        select: jest.fn(),
    },
    Engine: {
        repaintInEditMode: jest.fn(),
    },
    Editor: {
        getCurrentEditorType: jest.fn(),
        getRootNode: jest.fn(),
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
    class MockScene { }
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
        Scene: MockScene,
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
        snapConfigs = {
            getPureDataObject: () => ({}),
            initFromData: () => undefined,
        };
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
jest.mock('../scene-process/service/gizmo/components/distance-joint-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/spring-joint-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/hinge-joint-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/fixed-joint-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/relative-joint-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/slider-joint-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/wheel-joint-2d', () => ({}));
jest.mock('../scene-process/service/gizmo/components/mesh-renderer', () => ({}));
jest.mock('../scene-process/service/gizmo/components/skinned-mesh-renderer', () => ({}));
jest.mock('../scene-process/service/gizmo/components/video-player', () => ({}));
jest.mock('../scene-process/service/gizmo/components/web-view', () => ({}));
jest.mock('../scene-process/service/gizmo/components/light-probe-group', () => ({}));
jest.mock('../scene-process/service/gizmo/components/reflection-probe', () => ({}));
jest.mock('../scene-process/service/gizmo/components/lod-group', () => ({}));

describe('Gizmo editor lifecycle', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.resetModules();
        jest.clearAllMocks();
        mockGizmoDefines.components.clear();
        mockGizmoDefines.iconGizmo.clear();
        mockGizmoDefines.persistentGizmo.clear();
        mockGizmoDefines.methods.clear();
        mockService.Editor.getCurrentEditorType.mockReturnValue('unknown');
        mockService.Editor.getRootNode.mockReturnValue(null);
        delete (globalThis as any).EditorExtends;
        delete (globalThis as any).cc;
    });

    it('resets gizmos from editor open lifecycle without reloading config', () => {
        jest.useFakeTimers();
        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        gizmo.transformToolName = 'rotate';

        const clearAllGizmos = jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        const showIconGizmos = jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});
        const initFromConfig = jest.spyOn(gizmo, 'initFromConfig').mockImplementation(() => undefined as any);

        gizmo.onEditorOpened();

        expect(clearAllGizmos).toHaveBeenCalledTimes(1);
        expect(showIconGizmos).toHaveBeenCalledTimes(1);
        expect(gizmo.transformToolName).toBe('position');
        expect(initFromConfig).not.toHaveBeenCalled();
        jest.runOnlyPendingTimers();
    });

    it('does not let late config restore override the editor-open position tool', async () => {
        let resolveConfig!: (value: unknown) => void;
        const configPromise = new Promise((resolve) => { resolveConfig = resolve; });
        const request = jest.fn(() => configPromise);
        const { Rpc } = require('../scene-process/rpc');
        Rpc.getInstance.mockReturnValue({ request });

        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        gizmo.transformToolName = 'position';
        gizmo.viewMode = 'select';
        (gizmo as any)._hasEditorOpened = true;

        const restorePromise = gizmo.initFromConfig();
        resolveConfig({
            transformToolName: 'rotate',
            viewMode: 'view',
            toolsVisibility3d: true,
        });
        await restorePromise;

        expect(gizmo.transformToolName).toBe('position');
        expect(gizmo.viewMode).toBe('select');
    });

    it('rebuilds selected gizmos from editor open lifecycle', () => {
        jest.useFakeTimers();
        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        (gizmo as any)._selection = ['old-node-uuid'];
        mockService.Selection.query.mockReturnValue(['/Canvas/button']);

        const clearAllGizmos = jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        const showIconGizmos = jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeByPath: jest.fn(() => ({ uuid: 'button-uuid' })),
            },
        };

        gizmo.onEditorOpened();

        expect(clearAllGizmos).toHaveBeenCalledTimes(1);
        expect(showIconGizmos).toHaveBeenCalledTimes(1);
        expect((gizmo as any)._selection).toEqual([]);
        expect(mockService.Selection.clear).toHaveBeenCalledTimes(1);
        expect(mockService.Selection.select).toHaveBeenCalledWith('/Canvas/button');
        jest.runOnlyPendingTimers();
        expect(mockService.Engine.repaintInEditMode).toHaveBeenCalledTimes(1);
    });

    it('skips reselecting paths that are not in the opened editor scene', () => {
        jest.useFakeTimers();
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeByPath: jest.fn(() => null),
            },
        };
        mockService.Selection.query.mockReturnValue(['/Missing']);

        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});

        gizmo.onEditorOpened();

        expect(mockService.Selection.clear).toHaveBeenCalledTimes(1);
        expect(mockService.Selection.select).not.toHaveBeenCalled();
        jest.runOnlyPendingTimers();
    });

    it('reselects prefab nodes by path relative to the prefab root when hidden Canvas is not in hierarchy', () => {
        jest.useFakeTimers();
        const child = { name: 'Child', uuid: 'child-uuid', children: [] };
        const root = { name: 'Node', uuid: 'root-uuid', children: [child] };
        (globalThis as any).EditorExtends = {
            Node: {
                getNodeByPath: jest.fn(() => null),
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);
        mockService.Selection.query.mockReturnValue(['Node/Child']);

        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();
        jest.spyOn(gizmo, 'clearAllGizmos').mockImplementation(() => {});
        jest.spyOn(gizmo as any, '_showIconGizmosForScene').mockImplementation(() => {});

        gizmo.onEditorOpened();

        expect(mockService.Selection.select).toHaveBeenCalledWith('Node/Child');
        jest.runOnlyPendingTimers();
    });

    it('resolves transform gizmo nodes with the same prefab relative path fallback', () => {
        const child = { name: 'Child', uuid: 'child-uuid', children: [], isValid: true, parent: null };
        const root = { name: 'Node', uuid: 'root-uuid', children: [child], isValid: true, parent: null };
        (globalThis as any).cc = {
            EditorExtends: {
                Node: {
                    getNodeByPath: jest.fn(() => null),
                },
            },
        };
        mockService.Editor.getCurrentEditorType.mockReturnValue('prefab');
        mockService.Editor.getRootNode.mockReturnValue(root);
        mockService.Selection.query.mockReturnValue(['Node/Child']);

        const TransformBaseGizmo = require('../scene-process/service/gizmo/node/transform-base').default;
        const gizmo = new TransformBaseGizmo(null);

        expect(gizmo.nodes).toEqual([child]);
    });

    it('refreshes transform controller size when selected gizmos are updated after camera restore', () => {
        const TransformBaseGizmo = require('../scene-process/service/gizmo/node/transform-base').default;
        const gizmo = new TransformBaseGizmo(null);
        const updateControllerTransform = jest.fn();
        const adjustControllerSize = jest.fn();
        (gizmo as any).updateControllerTransform = updateControllerTransform;
        (gizmo as any)._controller = { adjustControllerSize };

        gizmo.onNodeChanged();

        expect(updateControllerTransform).toHaveBeenCalledTimes(1);
        expect(adjustControllerSize).toHaveBeenCalledTimes(1);
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

    it('persists grid color with a targeted write, independent of the whole-object save', async () => {
        const stored: Record<string, any> = { gridColor: [11, 22, 33, 44] };
        const request = jest.fn((_svc: string, method: string, args: any[]) => {
            const [key] = args;
            if (method === 'get') {
                if (key === 'gizmo') return Promise.resolve(stored);
                if (key === 'gizmo.gridColor') return Promise.resolve(stored.gridColor);
                return Promise.resolve(undefined);
            }
            if (method === 'set') {
                if (key === 'gizmo.gridColor') stored.gridColor = args[1];
                else if (key === 'gizmo') Object.assign(stored, args[1]);
                return Promise.resolve(true);
            }
            return Promise.resolve(undefined);
        });
        const { Rpc } = require('../scene-process/rpc');
        Rpc.getInstance.mockReturnValue({ request });

        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();

        // 面板改色：定向写入 gizmo.gridColor（local），不依赖初始加载/整块 saveConfig
        gizmo.setGridColor([200, 100, 50, 255]);
        await Promise.resolve();
        await Promise.resolve();

        const gridSet = request.mock.calls.find(
            (c: any[]) => c[1] === 'set' && c[2][0] === 'gizmo.gridColor',
        );
        expect(gridSet).toBeDefined();
        expect(gridSet![2][1]).toEqual([200, 100, 50, 255]);
        expect(gridSet![2][2]).toBe('local');
        expect(stored.gridColor).toEqual([200, 100, 50, 255]);
    });

    it('does not let the whole-object saveConfig clobber previously saved GizmoConfig fields with defaults', async () => {
        // 磁盘上已保存的、非默认的 GizmoConfig 字段
        const stored: Record<string, any> = {
            gridColor: [11, 22, 33, 44],
            is3DIcon: true,
            iconSize: 5,
            toolsVisibility3d: false,
            originAxis2D: { x: false, y: false, z: true },
            originAxis3D: { x: false, y: true, z: false },
        };
        const request = jest.fn((_svc: string, method: string, args: any[]) => {
            if (method === 'get') return Promise.resolve(stored);
            if (method === 'set') {
                Object.assign(stored, args[1]);
                return Promise.resolve(true);
            }
            return Promise.resolve(undefined);
        });
        const { Rpc } = require('../scene-process/rpc');
        Rpc.getInstance.mockReturnValue({ request });

        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();

        // 模拟切工具/切视图触发的 saveConfig：此时 GizmoConfig 各静态量仍是默认值，
        // saveConfig 不应写入这些字段，应保留磁盘上已保存的值。
        await gizmo.saveConfig();

        const setCall = request.mock.calls.find((c: any[]) => c[1] === 'set');
        expect(setCall).toBeDefined();
        const written = setCall![2][1];
        // ...current 保留了已保存的字段，而非被默认值覆盖
        expect(written.gridColor).toEqual([11, 22, 33, 44]);
        expect(written.is3DIcon).toBe(true);
        expect(written.iconSize).toBe(5);
        expect(written.toolsVisibility3d).toBe(false);
        expect(written.originAxis2D).toEqual({ x: false, y: false, z: true });
        expect(written.originAxis3D).toEqual({ x: false, y: true, z: false });
    });

    it('persists other GizmoConfig fields with their own targeted writes', async () => {
        const stored: Record<string, any> = {};
        const request = jest.fn((_svc: string, method: string, args: any[]) => {
            const [key] = args;
            if (method === 'get') {
                if (key === 'gizmo') return Promise.resolve(stored);
                return Promise.resolve(stored[String(key).replace('gizmo.', '')]);
            }
            if (method === 'set') {
                if (String(key).startsWith('gizmo.')) stored[String(key).replace('gizmo.', '')] = args[1];
                else if (key === 'gizmo') Object.assign(stored, args[1]);
                return Promise.resolve(true);
            }
            return Promise.resolve(undefined);
        });
        const { Rpc } = require('../scene-process/rpc');
        Rpc.getInstance.mockReturnValue({ request });

        const { GizmoService } = require('../scene-process/service/gizmo');
        const gizmo = new GizmoService();

        gizmo.setOriginAxes2D({ x: false, y: true, z: false });
        await Promise.resolve();
        await Promise.resolve();

        const axisSet = request.mock.calls.find(
            (c: any[]) => c[1] === 'set' && c[2][0] === 'gizmo.originAxis2D',
        );
        expect(axisSet).toBeDefined();
        expect(axisSet![2][1]).toEqual({ x: false, y: true, z: false });
        expect(axisSet![2][2]).toBe('local');
    });
});
