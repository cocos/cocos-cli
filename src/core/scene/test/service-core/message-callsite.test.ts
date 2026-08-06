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
jest.mock('../../scene-process/service/gizmo/components/light-probe-group', () => ({}));
jest.mock('../../scene-process/service/gizmo/components/reflection-probe', () => ({}));

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

const mockConsumePreserveUndoHistoryForPrefabReload = jest.fn(() => ({ preserveUndoHistory: false, editorSession: null }));
const mockPrefabSoftReloadSchedule = jest.fn();

jest.mock('../../scene-process/service/prefab/prefab-undo', () => ({
    PrefabUndoHelper: jest.fn().mockImplementation(() => ({
        consumePreserveUndoHistoryForPrefabReload: mockConsumePreserveUndoHistoryForPrefabReload,
    })),
}));

jest.mock('../../scene-process/service/prefab/soft-reload', () => ({
    PrefabSoftReloadScheduler: jest.fn().mockImplementation(() => ({
        schedule: mockPrefabSoftReloadSchedule,
        waitForIdle: jest.fn().mockResolvedValue(undefined),
        invalidate: jest.fn(),
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

        beforeEach(() => {
            editorService.editorMap.clear();
            editorService.currentEditorUuid = null;
            mockRpcRequest.mockReset();
            mockRpcRequest.mockResolvedValue({});
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

        it('open 新资源时应先释放已删除源资源对应的当前编辑器会话', async () => {
            const sourceUuid = 'deleted-open-source-uuid';
            const targetUuid = 'new-open-target-uuid';
            const deletedEditor = { close: jest.fn().mockResolvedValue(true) };
            const targetEditor = { open: jest.fn().mockResolvedValue({}) };
            editorService.editorMap.set(sourceUuid, deletedEditor);
            editorService.editorMap.set(targetUuid, targetEditor);
            editorService.currentEditorUuid = sourceUuid;

            mockRpcRequest
                .mockResolvedValueOnce({ uuid: targetUuid, url: 'db://assets/new.scene', type: 'scene' })
                .mockResolvedValueOnce(null);

            await editorService.open({ urlOrUUID: 'db://assets/new.scene' });

            expect(deletedEditor.close).toHaveBeenCalledWith({ save: false });
            expect(editorService.currentEditorUuid).toBe(targetUuid);
            expect(editorService.editorMap.get(sourceUuid)).toBeUndefined();
        });

        it('serializes concurrent opens and closes the intermediate editor before switching again', async () => {
            const oldUuid = 'concurrent-old-uuid';
            const firstUuid = 'concurrent-first-uuid';
            const secondUuid = 'concurrent-second-uuid';
            let releaseOldClose!: () => void;
            const oldEditor = { close: jest.fn(() => new Promise<boolean>((resolve) => { releaseOldClose = () => resolve(true); })) };
            const firstEditor = { open: jest.fn().mockResolvedValue({}) , close: jest.fn().mockResolvedValue(true) };
            const secondEditor = { open: jest.fn().mockResolvedValue({}) , close: jest.fn().mockResolvedValue(true) };
            editorService.editorMap.set(oldUuid, oldEditor);
            editorService.editorMap.set(firstUuid, firstEditor);
            editorService.editorMap.set(secondUuid, secondEditor);
            editorService.currentEditorUuid = oldUuid;

            mockRpcRequest.mockImplementation(async (_service: string, method: string, args: string[]) => {
                if (method !== 'queryAssetInfo') {
                    return undefined;
                }
                const value = args[0];
                if (value === 'first.scene') return { uuid: firstUuid, url: value, type: 'scene' };
                if (value === 'second.scene') return { uuid: secondUuid, url: value, type: 'scene' };
                if (value === oldUuid) return undefined;
                if (value === firstUuid) return { uuid: firstUuid, url: 'first.scene', type: 'scene' };
                return undefined;
            });

            const firstOpen = editorService.open({ urlOrUUID: 'first.scene' });
            const secondOpen = editorService.open({ urlOrUUID: 'second.scene' });
            await new Promise<void>((resolve) => setImmediate(resolve));
            await new Promise<void>((resolve) => setImmediate(resolve));

            expect(oldEditor.close).toHaveBeenCalledTimes(1);
            expect(firstEditor.open).not.toHaveBeenCalled();
            expect(secondEditor.open).not.toHaveBeenCalled();

            releaseOldClose();
            await Promise.all([firstOpen, secondOpen]);

            expect(firstEditor.open).toHaveBeenCalledTimes(1);
            expect(firstEditor.close).toHaveBeenCalledWith({ save: true });
            expect(secondEditor.open).toHaveBeenCalledTimes(1);
            expect(editorService.currentEditorUuid).toBe(secondUuid);
            expect(editorService.editorMap.has(firstUuid)).toBe(false);
        });

        it('does not discard the current editor when closing it fails during open', async () => {
            const sourceUuid = 'close-failed-source-uuid';
            const targetUuid = 'close-failed-target-uuid';
            const sourceEditor = { close: jest.fn().mockRejectedValue(new Error('save failed')) };
            const targetEditor = { open: jest.fn().mockResolvedValue({}) };
            editorService.editorMap.set(sourceUuid, sourceEditor);
            editorService.editorMap.set(targetUuid, targetEditor);
            editorService.currentEditorUuid = sourceUuid;
            editorService.isOpen = true;

            mockRpcRequest.mockImplementation(async (_service: string, method: string, args: string[]) => {
                if (method !== 'queryAssetInfo') return undefined;
                if (args[0] === 'target.scene') return { uuid: targetUuid, url: 'target.scene', type: 'scene' };
                return { uuid: sourceUuid, url: 'source.scene', type: 'scene' };
            });

            await expect(editorService.open({ urlOrUUID: 'target.scene' })).rejects.toThrow('save failed');

            expect(editorService.currentEditorUuid).toBe(sourceUuid);
            expect(editorService.isOpen).toBe(true);
            expect(editorService.editorMap.get(sourceUuid)).toBe(sourceEditor);
            expect(targetEditor.open).not.toHaveBeenCalled();
        });

        it('open target fails after deleted source close without leaving a stale current session', async () => {
            const sourceUuid = 'deleted-failed-open-source-uuid';
            const targetUuid = 'failed-open-target-uuid';
            const sourceEditor = { close: jest.fn().mockResolvedValue(true) };
            const targetEditor = { open: jest.fn().mockRejectedValue(new Error('target open failed')) };
            editorService.editorMap.set(sourceUuid, sourceEditor);
            editorService.editorMap.set(targetUuid, targetEditor);
            editorService.currentEditorUuid = sourceUuid;
            editorService.isOpen = true;

            mockRpcRequest
                .mockResolvedValueOnce({ uuid: targetUuid, url: 'db://assets/failed.scene', type: 'scene' })
                .mockResolvedValueOnce(null);

            await expect(editorService.open({ urlOrUUID: 'db://assets/failed.scene' })).rejects.toThrow('target open failed');

            expect(sourceEditor.close).toHaveBeenCalledWith({ save: false });
            expect(editorService.currentEditorUuid).toBeNull();
            expect(editorService.isOpen).toBe(false);
            expect(editorService.editorMap.has(sourceUuid)).toBe(false);
            expect(editorService.editorMap.has(targetUuid)).toBe(false);
        });

        it('close 在源资源已删除时仍可丢弃当前编辑器会话', async () => {
            const uuid = 'deleted-source-uuid';
            const mockEditor = { close: jest.fn().mockResolvedValue(true) };
            editorService.editorMap.set(uuid, mockEditor);
            editorService.currentEditorUuid = uuid;

            mockRpcRequest.mockResolvedValueOnce(null);

            await editorService.close({
                urlOrUUID: 'db://assets/deleted.scene',
                save: false,
                allowDeletedSourceFallback: true,
                expectedCurrentUuid: uuid,
            });

            expect(mockEditor.close).toHaveBeenCalledWith({ save: false });
            expect(editorService.currentEditorUuid).toBeNull();
            expect(editorService.editorMap.get(uuid)).toBeUndefined();
        });

        it('save 到非当前资源时要求调用方使用 saveAs', async () => {
            const { SceneEditor } = require('../../scene-process/service/editors');
            const sourceUuid = 'source-uuid';
            const target = { uuid: 'target-uuid', url: 'db://assets/copied.scene', type: 'scene' };
            const mockEditor = Object.assign(Object.create(SceneEditor.prototype), {
                save: jest.fn(),
                saveAs: jest.fn(),
            });
            editorService.editorMap.set(sourceUuid, mockEditor);
            editorService.currentEditorUuid = sourceUuid;
            mockRpcRequest
                .mockResolvedValueOnce(target)
                .mockResolvedValueOnce({ uuid: sourceUuid, url: 'db://assets/source.scene', type: 'scene' });

            await expect(editorService.save({ urlOrUUID: target.url })).rejects.toThrow('请使用另存为');

            expect(mockEditor.save).not.toHaveBeenCalled();
            expect(mockEditor.saveAs).not.toHaveBeenCalled();
            expect(editorService.currentEditorUuid).toBe(sourceUuid);
            expect(editorService.editorMap.get(sourceUuid)).toBe(mockEditor);
        });

        it('save 到新资源时仅恢复已删除的源资源，并重新打开目标', async () => {
            const { SceneEditor } = require('../../scene-process/service/editors');
            const sourceUuid = 'source-uuid';
            const target = { uuid: 'target-uuid', url: 'db://assets/recovered.scene', type: 'scene' };
            const mockEditor = Object.assign(Object.create(SceneEditor.prototype), {
                saveAs: jest.fn().mockResolvedValue(target),
            });
            const openUnlocked = jest.spyOn(editorService as any, 'openUnlocked').mockResolvedValue({});
            editorService.editorMap.set(sourceUuid, mockEditor);
            editorService.currentEditorUuid = sourceUuid;
            mockRpcRequest
                .mockResolvedValueOnce(target)
                .mockResolvedValueOnce(null);

            try {
                await editorService.save({ urlOrUUID: target.url });

                expect(mockEditor.saveAs).toHaveBeenCalledWith(target);
                expect(openUnlocked).toHaveBeenCalledWith({ urlOrUUID: target.uuid });
            } finally {
                openUnlocked.mockRestore();
            }
        });

        it('saveAs 到新资源时保持当前编辑器身份和 dirty 状态', async () => {
            const { SceneEditor } = require('../../scene-process/service/editors');
            const listener = jest.fn();
            globalEventEmitter.on('editor:save', listener);
            const sourceUuid = 'source-uuid';
            const target = { uuid: 'target-uuid', url: 'db://assets/copied.scene', type: 'scene' };
            const mockEditor = Object.assign(Object.create(SceneEditor.prototype), {
                saveAs: jest.fn().mockResolvedValue(target),
            });
            const markSaved = jest.spyOn(editorService as any, '_markUndoSaved');
            editorService.editorMap.set(sourceUuid, mockEditor);
            editorService.currentEditorUuid = sourceUuid;

            mockRpcRequest.mockResolvedValueOnce(target);

            await editorService.saveAs({ urlOrUUID: target.url });

            expect(mockEditor.saveAs).toHaveBeenCalledWith(target);
            expect(editorService.currentEditorUuid).toBe(sourceUuid);
            expect(editorService.editorMap.get(sourceUuid)).toBe(mockEditor);
            expect(editorService.editorMap.get(target.uuid)).toBeUndefined();
            expect(markSaved).not.toHaveBeenCalled();
            expect(listener).not.toHaveBeenCalled();
        });

        it('saveAs requires an explicit target without changing the source editor', async () => {
            const { SceneEditor } = require('../../scene-process/service/editors');
            const sourceUuid = 'source-uuid';
            const mockEditor = Object.assign(Object.create(SceneEditor.prototype), {
                saveAs: jest.fn(),
            });
            editorService.editorMap.set(sourceUuid, mockEditor);
            editorService.currentEditorUuid = sourceUuid;

            await expect(editorService.saveAs({})).rejects.toThrow('另存为需要指定目标资源');

            expect(mockRpcRequest).not.toHaveBeenCalled();
            expect(mockEditor.saveAs).not.toHaveBeenCalled();
            expect(editorService.currentEditorUuid).toBe(sourceUuid);
            expect(editorService.editorMap.get(sourceUuid)).toBe(mockEditor);
        });

        it('saveAs rejects a missing or incompatible target without changing the source editor', async () => {
            const { SceneEditor } = require('../../scene-process/service/editors');
            const sourceUuid = 'source-uuid';
            const target = { uuid: 'target-uuid', url: 'db://assets/copied.prefab', type: 'prefab' };
            const mockEditor = Object.assign(Object.create(SceneEditor.prototype), {
                saveAs: jest.fn(),
            });
            editorService.editorMap.set(sourceUuid, mockEditor);
            editorService.currentEditorUuid = sourceUuid;

            mockRpcRequest.mockResolvedValueOnce(null);
            await expect(editorService.saveAs({ urlOrUUID: 'db://assets/missing.scene' })).rejects.toThrow('请求资源失败');

            mockRpcRequest.mockResolvedValueOnce(target);
            await expect(editorService.saveAs({ urlOrUUID: target.url })).rejects.toThrow('不能将 scene 保存到 prefab 资源');

            expect(mockEditor.saveAs).not.toHaveBeenCalled();
            expect(editorService.currentEditorUuid).toBe(sourceUuid);
            expect(editorService.editorMap.get(sourceUuid)).toBe(mockEditor);
        });

        it('saveAs rejects an inconsistent save result without changing the source editor', async () => {
            const { SceneEditor } = require('../../scene-process/service/editors');
            const sourceUuid = 'source-uuid';
            const target = { uuid: 'target-uuid', url: 'db://assets/copied.scene', type: 'scene' };
            const mockEditor = Object.assign(Object.create(SceneEditor.prototype), {
                saveAs: jest.fn().mockResolvedValue({ ...target, uuid: 'unexpected-uuid' }),
            });
            editorService.editorMap.set(sourceUuid, mockEditor);
            editorService.currentEditorUuid = sourceUuid;

            mockRpcRequest.mockResolvedValueOnce(target);
            await expect(editorService.saveAs({ urlOrUUID: target.url })).rejects.toThrow('保存目标资源标识不一致');

            expect(editorService.currentEditorUuid).toBe(sourceUuid);
            expect(editorService.editorMap.get(sourceUuid)).toBe(mockEditor);
            expect(editorService.editorMap.get(target.uuid)).toBeUndefined();
        });

        it('save 应 emit editor:save 到 ServiceEvents', async () => {
            const { PrefabEditor } = require('../../scene-process/service/editors');
            const listener = jest.fn();
            globalEventEmitter.on('editor:save', listener);

            const mockEditor = Object.assign(Object.create(PrefabEditor.prototype), {
                save: jest.fn().mockResolvedValue({ uuid: 'save-uuid' }),
            });
            const uuid = 'save-uuid';
            editorService.editorMap.set(uuid, mockEditor);
            editorService.currentEditorUuid = uuid;

            mockRpcRequest.mockResolvedValueOnce({ uuid, url: 'test.prefab', type: 'prefab' });

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

        it('setProperty(position) 成功后应 broadcast animation:property-committed', async () => {
            const listener = jest.fn();
            globalEventEmitter.on('animation:property-committed', listener);

            const nodeMgr = require('../../scene-process/service/node/index').default;
            const setPropertySpy = jest.spyOn(nodeMgr, 'setProperty').mockResolvedValueOnce(true);
            const { NodeService } = require('../../scene-process/service/node');
            const nodeService = new NodeService();

            const { Node: MockNode } = require('cc');
            const node = new MockNode();
            node.uuid = 'position-change';
            node.name = 'TestNode';

            nodeService._undo = {
                recordNodeSnapshot: jest.fn((_node: any, _opts: any, callback: any) => callback()),
            };

            const NodeMgr = (global as any).EditorExtends.Node;
            NodeMgr.getNodeByPath = jest.fn(() => node);

            try {
                await nodeService.setProperty({
                    nodePath: '/TestNode',
                    path: 'position',
                    dump: { type: 'cc.Vec3', value: { x: 1, y: 2, z: 3 } },
                });

                expect(listener).toHaveBeenCalledWith({
                    nodePath: '/TestNode',
                    propPath: 'position',
                    source: 'editor',
                });
            } finally {
                setPropertySpy.mockRestore();
            }
        });

        it('setProperty(position) record:false 不应 broadcast animation:property-committed', async () => {
            const listener = jest.fn();
            globalEventEmitter.on('animation:property-committed', listener);

            const nodeMgr = require('../../scene-process/service/node/index').default;
            const setPropertySpy = jest.spyOn(nodeMgr, 'setProperty').mockResolvedValueOnce(true);
            const { NodeService } = require('../../scene-process/service/node');
            const nodeService = new NodeService();

            const { Node: MockNode } = require('cc');
            const node = new MockNode();
            node.uuid = 'position-change-record-false';
            node.name = 'TestNode';

            nodeService._undo = {
                recordNodeSnapshot: jest.fn((_node: any, _opts: any, callback: any) => callback()),
            };

            const NodeMgr = (global as any).EditorExtends.Node;
            NodeMgr.getNodeByPath = jest.fn(() => node);

            try {
                await nodeService.setProperty({
                    nodePath: '/TestNode',
                    path: 'position',
                    dump: { type: 'cc.Vec3', value: { x: 1, y: 2, z: 3 } },
                    record: false,
                });

                expect(listener).not.toHaveBeenCalled();
            } finally {
                setPropertySpy.mockRestore();
            }
        });

        it('previewSetProperty 不应 broadcast animation:property-committed', async () => {
            const listener = jest.fn();
            globalEventEmitter.on('animation:property-committed', listener);

            const nodeMgr = require('../../scene-process/service/node/index').default;
            const previewSpy = jest.spyOn(nodeMgr, 'previewSetNodeProperty').mockResolvedValueOnce(true);
            const { NodeService } = require('../../scene-process/service/node');
            const nodeService = new NodeService();

            const { Node: MockNode } = require('cc');
            const node = new MockNode();
            node.uuid = 'preview-position-change';
            node.name = 'TestNode';

            const NodeMgr = (global as any).EditorExtends.Node;
            NodeMgr.getNodeByPath = jest.fn(() => node);

            try {
                await nodeService.previewSetProperty({
                    nodePath: '/TestNode',
                    path: 'position',
                    dump: { type: 'cc.Vec3', value: { x: 1, y: 2, z: 3 } },
                });

                expect(listener).not.toHaveBeenCalled();
            } finally {
                previewSpy.mockRestore();
            }
        });
    });

    describe('ComponentService (component.ts)', () => {
        it('setProperty(__comps__) 成功后应 broadcast animation:property-committed', async () => {
            const listener = jest.fn();
            globalEventEmitter.on('animation:property-committed', listener);

            const { ComponentService } = require('../../scene-process/service/component');
            const componentService = new ComponentService();
            componentService._recordComponentPropertySnapshot = jest.fn((_node: any, _opts: any, callback: any) => callback());

            const { Node: MockNode } = require('cc');
            const node = new MockNode();
            node.uuid = 'component-property-change';
            node.name = 'TestNode';

            const NodeMgr = (global as any).EditorExtends.Node;
            NodeMgr.getNodeByPath = jest.fn(() => node);

            await componentService.setProperty({
                nodePath: '/TestNode',
                path: '__comps__.0.enabled',
                dump: { type: 'cc.Boolean', value: false },
            });

            expect(listener).toHaveBeenCalledWith({
                nodePath: '/TestNode',
                propPath: '__comps__.0.enabled',
                source: 'editor',
            });
        });

        it('setProperty(__comps__) record:false 不应 broadcast animation:property-committed', async () => {
            const listener = jest.fn();
            globalEventEmitter.on('animation:property-committed', listener);

            const { ComponentService } = require('../../scene-process/service/component');
            const componentService = new ComponentService();
            componentService._recordComponentPropertySnapshot = jest.fn((_node: any, _opts: any, callback: any) => callback());

            const { Node: MockNode } = require('cc');
            const node = new MockNode();
            node.uuid = 'component-property-change-record-false';
            node.name = 'TestNode';

            const NodeMgr = (global as any).EditorExtends.Node;
            NodeMgr.getNodeByPath = jest.fn(() => node);

            await componentService.setProperty({
                nodePath: '/TestNode',
                path: '__comps__.0.enabled',
                dump: { type: 'cc.Boolean', value: false },
                record: false,
            });

            expect(listener).not.toHaveBeenCalled();
        });
    });

    // ── PrefabService: filterChild / filterPart / canModifySibling → ServiceEvents ──

    describe('PrefabService (prefab.ts)', () => {
        let prefabService: any;
        let prefabUtilsMock: any;

        beforeAll(() => {
            prefabUtilsMock = require('../../scene-process/service/prefab/utils').prefabUtils;
            require('../../scene-process/service/editor');
            require('../../scene-process/service/undo');
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
            mockConsumePreserveUndoHistoryForPrefabReload.mockReturnValue({ preserveUndoHistory: false, editorSession: null });
        });

        it('onAssetChanged preserves undo history when current editor is dirty', async () => {
            const { Service } = require('../../scene-process/service/core');
            const { nodeOperation } = require('../../scene-process/service/prefab/node');
            const originalHasOpen = Service.Editor.hasOpen;
            const originalIsDirty = Service.Undo.isDirty;
            nodeOperation.assetToNodesMap.clear();
            try {
                nodeOperation.assetToNodesMap.set('prefab-uuid', ['node-uuid']);
                Service.Editor.hasOpen = jest.fn().mockResolvedValue(true);
                Service.Undo.isDirty = jest.fn(() => true);

                await prefabService.onAssetChanged('prefab-uuid');

                expect(mockPrefabSoftReloadSchedule).toHaveBeenCalledWith(expect.objectContaining({
                    changedUuid: 'prefab-uuid',
                    preserveUndoHistory: true,
                }));
            } finally {
                Service.Editor.hasOpen = originalHasOpen;
                Service.Undo.isDirty = originalIsDirty;
                nodeOperation.assetToNodesMap.clear();
            }
        });

        it('filterChildOfAssetOfPrefabInstance 中 prefab 子节点应 emit node:change', () => {
            const listener = jest.fn();
            globalEventEmitter.on('node:change', listener);

            prefabUtilsMock.isOutmostPrefabInstanceMountedChildren.mockReturnValue(false);
            prefabUtilsMock.isPrefabInstanceRoot.mockReturnValue(false);
            prefabUtilsMock.isPartOfAssetInPrefabInstance.mockReturnValue(true);

            prefabService.filterChildOfAssetOfPrefabInstance(['child-uuid-1'], 'test operation');

            expect(listener).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'child-uuid-1' }));
        });

        it('filterChildOfAssetOfPrefabInstance 中非 prefab 子节点不应 emit node:change', () => {
            const listener = jest.fn();
            globalEventEmitter.on('node:change', listener);

            prefabUtilsMock.isOutmostPrefabInstanceMountedChildren.mockReturnValue(false);
            prefabUtilsMock.isPrefabInstanceRoot.mockReturnValue(false);
            prefabUtilsMock.isPartOfAssetInPrefabInstance.mockReturnValue(false);

            const result = prefabService.filterChildOfAssetOfPrefabInstance(['normal-uuid'], 'test');

            expect(listener).not.toHaveBeenCalled();
            expect(result).toContain('normal-uuid');
        });

        it('filterPartOfPrefabAsset 中 prefab 部件应 emit node:change', () => {
            const listener = jest.fn();
            globalEventEmitter.on('node:change', listener);

            prefabUtilsMock.isPartOfAssetInPrefabInstance.mockReturnValue(true);

            prefabService.filterPartOfPrefabAsset(['part-uuid'], 'test operation');

            expect(listener).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'part-uuid' }));
        });

        it('filterPartOfPrefabAsset 中非 prefab 部件不应 emit node:change', () => {
            const listener = jest.fn();
            globalEventEmitter.on('node:change', listener);

            prefabUtilsMock.isPartOfAssetInPrefabInstance.mockReturnValue(false);

            const result = prefabService.filterPartOfPrefabAsset(['normal-uuid'], 'test');

            expect(listener).not.toHaveBeenCalled();
            expect(result).toContain('normal-uuid');
        });

        it('canModifySibling 中不可移动的 prefab 子节点应 emit node:change', () => {
            const listener = jest.fn();
            globalEventEmitter.on('node:change', listener);

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

            expect(listener).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'prefab-child' }));
        });
    });
});
