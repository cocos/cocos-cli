/**
 * ServiceEvents 事件发射集成测试
 *
 * 验证各 Service/Manager 通过 ServiceEvents（globalEventEmitter）正确发射事件。
 * messageManager 的转发由 ServiceManager 统一处理，此处仅验证事件源正确性。
 */

// ==================== Mocks ====================

jest.mock('cc', () => {
    const Layers = { Enum: { GIZMOS: 1 << 21, EDITOR: 1 << 22, SCENE_GIZMO: 1 << 23 } };
    const NodeEventType = {
        TRANSFORM_CHANGED: 'transform-changed',
        SIZE_CHANGED: 'size-changed',
        ANCHOR_CHANGED: 'anchor-changed',
        CHILD_ADDED: 'child-added',
        CHILD_REMOVED: 'child-removed',
        PARENT_CHANGED: 'parent-changed',
        CHILD_CHANGED: 'child-changed',
    };
    const TransformBit = { POSITION: 1, ROTATION: 2, SCALE: 4 };
    class MockNode {
        static EventType = NodeEventType;
        static TransformBit = TransformBit;
        uuid = 'mock-node-uuid';
        name = 'MockNode';
        layer = 0;
        parent: MockNode | null = null;
        children: MockNode[] = [];
        components: any[] = [];
        _objFlags = 0;
        objFlags = 0;
        setParent(p: MockNode | null) { this.parent = p; }
        removeComponent(_comp: any) { /* noop */ }
        getComponent(_type: any) { return null; }
        on() { /* noop */ }
        off() { /* noop */ }
        get isValid() { return true; }
        _getDependComponent() { return []; }
        constructor(name?: string) {
            if (name) this.name = name;
        }
    }
    class MockComponent {
        uuid = 'mock-comp-uuid';
        node = new MockNode();
    }
    return {
        Node: MockNode,
        Component: MockComponent,
        Camera: class {},
        Color: class {},
        Vec3: class {},
        Rect: class {},
        MissingScript: class {},
        CCObject: { Flags: { Destroyed: 1, DontSave: 2, HideInHierarchy: 4 } },
        UITransform: class {},
        LODGroup: class {},
        Prefab: class {},
        Scene: class {},
        Canvas: class {},
        Layers,
        gfx: { ClearFlagBit: {} },
        js: { getClassName: () => '' },
        director: {
            getScene: () => null,
            addPersistRootNode: jest.fn(),
        },
    };
});

(global as any).cc = {
    Object: { Flags: { DontSave: 2, HideInHierarchy: 4 }, _deferredDestroy: jest.fn() },
    Node: jest.fn((name?: string) => {
        const n: any = { uuid: `mock-${name}`, name: name || 'MockNode', layer: 0, parent: null, children: [], components: [], _objFlags: 0, objFlags: 0, on: jest.fn(), off: jest.fn() };
        return n;
    }),
    director: {
        getScene: () => null,
        addPersistRootNode: jest.fn(),
    },
    Layers: { Enum: { GIZMOS: 1 << 21, SCENE_GIZMO: 1 << 23 } },
    EditorExtends: undefined,
    js: { getClassName: () => '' },
};

(global as any).EditorExtends = {
    Node: {
        updateNodeParent: jest.fn(),
        generateUUID: jest.fn(() => 'generated-uuid'),
        getNodes: jest.fn(() => ({})),
        clear: jest.fn(),
    },
    Component: {
        add: jest.fn(),
        remove: jest.fn(),
    },
    PrefabManager: {
        on: jest.fn(),
        off: jest.fn(),
    },
};

const mockRpcRequest = jest.fn().mockResolvedValue({});
jest.mock('../../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: mockRpcRequest }) },
}));

// Gizmo 子模块 mock
jest.mock('../../scene-process/service/gizmo/utils/engine-utils', () => ({
    create3DNode: jest.fn(() => ({
        uuid: 'gizmo-root', name: 'gizmoRoot', layer: 0, parent: null, children: [], components: [], on: jest.fn(), off: jest.fn(),
    })),
}));

jest.mock('../../scene-process/service/gizmo/gizmo-operation', () => {
    return jest.fn().mockImplementation(() => ({
        init: jest.fn(),
    }));
});

jest.mock('../../scene-process/service/gizmo/base/gizmo-base', () => {
    return jest.fn().mockImplementation(() => ({}));
});

jest.mock('../../scene-process/service/gizmo/gizmo-defines', () => ({
    __esModule: true,
    default: {
        components: new Map(),
        iconGizmo: new Map(),
        persistentGizmo: new Map(),
    },
}));

jest.mock('../../scene-process/service/gizmo/utils/rect-transform-snapping', () => ({
    rectTransformSnapping: {},
}));

jest.mock('../../scene-process/service/gizmo/controller/world-axis', () => {
    return jest.fn().mockImplementation(() => ({}));
});

// Mock 所有 gizmo component 的 side-effect import
jest.mock('../../scene-process/service/gizmo/components/camera', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/box-collider', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/directional-light', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/canvas', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/ui-transform', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/sphere-light', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/spot-light', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/sphere-collider', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/capsule-collider', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/cone-collider', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/cylinder-collider', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/plane-collider', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/simplex-collider', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/mesh-collider', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/box-collider-2d', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/circle-collider-2d', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/polygon-collider-2d', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/mesh-renderer', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/skinned-mesh-renderer', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/video-player', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/web-view', () => ({}));

jest.mock('../../scene-process/service/dump', () => ({
    __esModule: true,
    default: {
        restoreProperty: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../../scene-process/service/prefab/utils', () => ({
    prefabUtils: {
        isPrefabInstanceRoot: jest.fn(() => false),
        isPartOfAssetInPrefabInstance: jest.fn(() => false),
        isOutmostPrefabInstanceMountedChildren: jest.fn(() => false),
        isPartOfPrefabAsset: jest.fn(() => false),
        getPrefabStateInfo: jest.fn(() => ({ isAddedChild: false })),
        getPrefab: jest.fn(() => null),
    },
}));

jest.mock('../../scene-process/service/prefab/component', () => ({
    componentOperation: {},
}));

jest.mock('../../scene-process/service/prefab/node', () => ({
    nodeOperation: { onEditorOpened: jest.fn(), assetToNodesMap: new Map() },
}));

jest.mock('../../scene-process/service/prefab/validate-params', () => ({
    validateCreatePrefabParams: jest.fn(),
    validateNodePathParams: jest.fn(),
}));

jest.mock('../../scene-process/service/scene/utils', () => ({
    sceneUtils: {},
}));

jest.mock('../../scene-process/service/prefab/prefab-undo', () => ({
    PrefabUndoHelper: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../scene-process/service/prefab/soft-reload', () => ({
    PrefabSoftReloadScheduler: jest.fn().mockImplementation(() => ({
        waitForIdle: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('../../scene-process/service/node/node-create', () => ({
    loadAny: jest.fn(),
}));

jest.mock('../../scene-process/service/component/utils', () => ({
    __esModule: true,
    default: { addComponentMap: {} },
}));

// ==================== Imports ====================

import { globalEventEmitter } from '../../scene-process/service/core/global-events';

// ==================== Tests ====================

describe('ServiceEvents 事件发射集成测试', () => {

    beforeEach(() => {
        globalEventEmitter.removeAllListeners();
    });

    afterEach(() => {
        globalEventEmitter.removeAllListeners();
    });

    // ── GizmoService: transformToolData → ServiceEvents.emit ──

    describe('GizmoService (gizmo.ts)', () => {
        let gizmoService: any;

        beforeAll(() => {
            const { GizmoService } = require('../../scene-process/service/gizmo');
            gizmoService = new GizmoService();
            // Stub private methods that need engine context
            gizmoService.createSceneGizmo = jest.fn();
            gizmoService.saveConfig = jest.fn();
            gizmoService._saveSnapConfig = jest.fn();
            gizmoService.onSelectionSelect = jest.fn();
            gizmoService.onSelectionUnselect = jest.fn();
            gizmoService.onSelectionClear = jest.fn();
            gizmoService.onDimensionChanged = jest.fn();
            gizmoService.init();
        });

        it('is2D 变化应 emit scene:dimension-changed 到 ServiceEvents', () => {
            const listener = jest.fn();
            globalEventEmitter.on('scene:dimension-changed', listener);

            gizmoService.transformToolData.is2D = true;

            expect(listener).toHaveBeenCalledWith(true);
        });
    });

    // ── NodeManager: add / remove / change → ServiceEvents ──

    describe('NodeManager (node/index.ts)', () => {
        const { NodeManager } = require('../../scene-process/service/node/index');

        function createMockNode(uuid: string): any {
            const { Node: MockNode } = require('cc');
            const node = new MockNode();
            node.uuid = uuid;
            node.layer = 0;
            node.parent = null;
            node.children = [];
            node._objFlags = 0;
            return node;
        }

        it('add 应 emit node:added 到 ServiceEvents', () => {
            const listener = jest.fn();
            globalEventEmitter.on('node:added', listener);

            const nodeMgr = new NodeManager();
            const node = createMockNode('add-test');

            nodeMgr.add('add-test', node);

            expect(listener).toHaveBeenCalledWith(node);
        });

        it('remove 应 emit node:removed 到 ServiceEvents', () => {
            const listener = jest.fn();
            globalEventEmitter.on('node:removed', listener);

            const nodeMgr = new NodeManager();
            const node = createMockNode('rm-test');

            nodeMgr.remove('rm-test', node);

            expect(listener).toHaveBeenCalledWith(node, expect.any(Object));
        });

        it('change 应 emit node:change 到 ServiceEvents', () => {
            const listener = jest.fn();
            globalEventEmitter.on('node:change', listener);

            const nodeMgr = new NodeManager();
            const node = createMockNode('change-test');

            nodeMgr.change('change-test', node);

            expect(listener).toHaveBeenCalledWith(node, expect.objectContaining({ type: expect.any(String) }));
        });
    });

    // ── CompManager: add / remove → ServiceEvents ──

    describe('CompManager (component/index.ts)', () => {
        const { CompManager } = require('../../scene-process/service/component/index');

        it('add 应 emit component:added 到 ServiceEvents', () => {
            const listener = jest.fn();
            globalEventEmitter.on('component:added', listener);

            const compMgr = new CompManager();
            const mockComp = { uuid: 'comp-1', node: { uuid: 'n-1' } };

            compMgr.add('comp-1', mockComp);

            expect(listener).toHaveBeenCalledWith(mockComp);
        });

        it('remove 应 emit component:removed 到 ServiceEvents', () => {
            const listener = jest.fn();
            globalEventEmitter.on('component:removed', listener);

            const compMgr = new CompManager();
            const mockComp = { uuid: 'comp-2', node: { uuid: 'n-2' } };

            compMgr.remove('comp-2', mockComp);

            expect(listener).toHaveBeenCalledWith(mockComp);
        });
    });

    // ── EditorService: open / close / save / reload → ServiceEvents ──

    describe('EditorService (editor.ts)', () => {
        let editorService: any;

        beforeAll(() => {
            const { EditorService } = require('../../scene-process/service/editor');
            editorService = new EditorService();
        });

        it('open 应 emit editor:open 到 ServiceEvents', async () => {
            const listener = jest.fn();
            globalEventEmitter.on('editor:open', listener);

            const mockEditor = { open: jest.fn().mockResolvedValue({}) };
            const uuid = 'test-uuid';
            editorService.editorMap.set(uuid, mockEditor);

            mockRpcRequest.mockResolvedValueOnce({ uuid, url: 'test.scene' });

            await editorService.open({ urlOrUUID: 'test.scene' });

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('close 应 emit editor:close 到 ServiceEvents', async () => {
            const listener = jest.fn();
            globalEventEmitter.on('editor:close', listener);

            const mockEditor = { close: jest.fn().mockResolvedValue(true) };
            const uuid = 'close-uuid';
            editorService.editorMap.set(uuid, mockEditor);
            editorService.currentEditorUuid = uuid;

            mockRpcRequest.mockResolvedValueOnce({ uuid, url: 'test.scene' });

            await editorService.close({ urlOrUUID: uuid });

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('save 应 emit editor:save 到 ServiceEvents', async () => {
            const listener = jest.fn();
            globalEventEmitter.on('editor:save', listener);

            const mockEditor = { save: jest.fn().mockResolvedValue({ uuid: 'save-uuid' }) };
            const uuid = 'save-uuid';
            editorService.editorMap.set(uuid, mockEditor);
            editorService.currentEditorUuid = uuid;

            mockRpcRequest.mockResolvedValueOnce({ uuid, url: 'test.scene' });

            await editorService.save({ urlOrUUID: uuid });

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    // ── NodeService: setProperty(name) → ServiceEvents ──

    describe('NodeService (node.ts)', () => {
        it('setProperty(name) 应 emit node:change 到 ServiceEvents', async () => {
            const listener = jest.fn();
            globalEventEmitter.on('node:change', listener);

            const { NodeService } = require('../../scene-process/service/node');
            const nodeService = new NodeService();

            const { Node: MockNode } = require('cc');
            const node = new MockNode();
            node.uuid = 'name-change';
            node.name = 'OldName';

            nodeService._undo = {
                recordNodeSnapshot: jest.fn((_node: any, _opts: any, callback: any) => callback()),
            };

            const NodeMgr = (global as any).EditorExtends.Node;
            NodeMgr.getNodeByPath = jest.fn(() => node);
            NodeMgr.updateNodeName = jest.fn();

            nodeService.emit = jest.fn((...args: any[]) => {
                globalEventEmitter.emit(args[0], ...args.slice(1));
            });

            await nodeService.setProperty({
                nodePath: '/TestNode',
                path: 'name',
                dump: { value: 'NewName' },
            });

            expect(listener).toHaveBeenCalledWith(node, expect.objectContaining({ propPath: 'name' }));
        });
    });

    // ── PrefabService: filterChild / filterPart / canModifySibling → ServiceEvents ──

    describe('PrefabService (prefab.ts)', () => {
        let prefabService: any;
        let prefabUtilsMock: any;

        beforeAll(() => {
            prefabUtilsMock = require('../../scene-process/service/prefab/utils').prefabUtils;
            const { PrefabService } = require('../../scene-process/service/prefab');
            prefabService = new PrefabService();
        });

        beforeEach(() => {
            jest.clearAllMocks();
            const NodeMock = (global as any).EditorExtends.Node;
            NodeMock.getNode = jest.fn((uuid: string) => ({
                uuid,
                name: `Node-${uuid}`,
                _prefab: { root: { name: 'PrefabRoot', _prefab: { instance: true } } },
                children: [],
                objFlags: 0,
            }));
            NodeMock.getNodePath = jest.fn((node: any) => `/${node.name}`);
        });

        it('filterChildOfAssetOfPrefabInstance 中 prefab 子节点应 emit scene:change-node', () => {
            const listener = jest.fn();
            globalEventEmitter.on('scene:change-node', listener);

            prefabUtilsMock.isOutmostPrefabInstanceMountedChildren.mockReturnValue(false);
            prefabUtilsMock.isPrefabInstanceRoot.mockReturnValue(false);
            prefabUtilsMock.isPartOfAssetInPrefabInstance.mockReturnValue(true);

            prefabService.filterChildOfAssetOfPrefabInstance(['child-uuid-1'], 'test operation');

            expect(listener).toHaveBeenCalledWith('/Node-child-uuid-1');
        });

        it('filterChildOfAssetOfPrefabInstance 中非 prefab 子节点不应 emit scene:change-node', () => {
            const listener = jest.fn();
            globalEventEmitter.on('scene:change-node', listener);

            prefabUtilsMock.isOutmostPrefabInstanceMountedChildren.mockReturnValue(false);
            prefabUtilsMock.isPrefabInstanceRoot.mockReturnValue(false);
            prefabUtilsMock.isPartOfAssetInPrefabInstance.mockReturnValue(false);

            const result = prefabService.filterChildOfAssetOfPrefabInstance(['normal-uuid'], 'test');

            expect(listener).not.toHaveBeenCalled();
            expect(result).toContain('normal-uuid');
        });

        it('filterPartOfPrefabAsset 中 prefab 部件应 emit scene:change-node', () => {
            const listener = jest.fn();
            globalEventEmitter.on('scene:change-node', listener);

            prefabUtilsMock.isPartOfAssetInPrefabInstance.mockReturnValue(true);

            prefabService.filterPartOfPrefabAsset(['part-uuid'], 'test operation');

            expect(listener).toHaveBeenCalledWith('/Node-part-uuid');
        });

        it('filterPartOfPrefabAsset 中非 prefab 部件不应 emit scene:change-node', () => {
            const listener = jest.fn();
            globalEventEmitter.on('scene:change-node', listener);

            prefabUtilsMock.isPartOfAssetInPrefabInstance.mockReturnValue(false);

            const result = prefabService.filterPartOfPrefabAsset(['normal-uuid'], 'test');

            expect(listener).not.toHaveBeenCalled();
            expect(result).toContain('normal-uuid');
        });

        it('canModifySibling 中不可移动的 prefab 子节点应 emit scene:change-node', () => {
            const listener = jest.fn();
            globalEventEmitter.on('scene:change-node', listener);

            const child = {
                uuid: 'prefab-child',
                name: 'PrefabChild',
                _prefab: { root: { name: 'Root', _prefab: { instance: true } } },
                children: [],
                objFlags: 0,
            };
            const parent = {
                uuid: 'parent',
                name: 'Parent',
                _prefab: { root: { _prefab: { instance: true } } },
                children: [child],
                objFlags: 0,
            };
            (global as any).EditorExtends.Node.getNode = jest.fn(() => parent);
            (global as any).EditorExtends.Node.getNodePath = jest.fn((n: any) => `/${n.name}`);
            prefabUtilsMock.isPartOfPrefabAsset = jest.fn(() => true);
            prefabUtilsMock.getPrefabStateInfo = jest.fn(() => ({ isAddedChild: false }));

            prefabService.canModifySibling('parent', 0, 1);

            expect(listener).toHaveBeenCalledWith('/PrefabChild');
        });
    });
});
