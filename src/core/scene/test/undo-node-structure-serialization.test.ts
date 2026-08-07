const mockPrefabSerialize = jest.fn();
const mockGetNodePath = jest.fn((node: MockNode) => node.path);
const mockAssetToNodesMap = new Map<string, any[]>();
const mockCcRuntime: Record<string, any> = {};
const mockSceneUtilsLoadAny = jest.fn();

class MockNode {
    isValid = true;
    components: Array<{ uuid: string; __prefab?: unknown }> = [];
    children: MockNode[] = [];
    parent: MockNode | null = null;
    path = '';

    constructor(public uuid: string, public name = uuid) { }

    getSiblingIndex(): number {
        return this.parent ? this.parent.children.indexOf(this) : 0;
    }

    setSiblingIndex(_index: number): void { }
}

jest.mock('cc', () => new Proxy(
    { editorExtrasTag: Symbol('editorExtrasTag'), Node: MockNode },
    { get: (t, p) => (p in t ? (t as any)[p] : mockCcRuntime[p as string]) },
));

jest.mock('../scene-process/service/node/index', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../scene-process/service/prefab/prefab-editor-utils', () => ({
    editorPrefabUtils: {
        serialize: mockPrefabSerialize,
    },
}));

jest.mock('../scene-process/service/prefab/node', () => ({
    nodeOperation: {
        assetToNodesMap: mockAssetToNodesMap,
        checkToAddPrefabAssetMap: jest.fn((node: any) => {
            const prefabInfo = node._prefab;
            if (!prefabInfo?.instance || !prefabInfo.asset?._uuid) return;
            const uuid = prefabInfo.asset._uuid;
            let nodes = mockAssetToNodesMap.get(uuid);
            if (!nodes) { nodes = []; mockAssetToNodesMap.set(uuid, nodes); }
            if (!nodes.includes(node)) nodes.push(node);
        }),
    },
}));

jest.mock('../scene-process/service/scene/utils', () => ({
    sceneUtils: {
        loadAny: mockSceneUtilsLoadAny,
    },
}));

jest.mock('../scene-process/service/undo/commands/command-utils-shared', () => ({
    createUndoId: jest.fn((type: string) => `${type}:id`),
    success: jest.fn((meta: unknown) => ({ success: true, meta })),
    failure: jest.fn((meta: unknown, reason: string) => ({ success: false, meta, reason })),
    isNodeInCurrentScene: jest.fn(() => false),
    getEditorNodeManager: jest.fn(() => null),
    getEditorExtends: jest.fn(() => null),
    getNodePath: mockGetNodePath,
}));

import { editorExtrasTag } from 'cc';
import { captureNodeStructureSnapshot } from '../scene-process/service/undo/commands/node-structure-command-utils';

describe('captureNodeStructureSnapshot serialization', () => {
    let mockEditorSerialize: jest.Mock;

    beforeEach(() => {
        mockPrefabSerialize.mockReset();
        mockPrefabSerialize.mockReturnValue(JSON.stringify({ __type__: 'cc.Prefab' }));
        mockGetNodePath.mockClear();
        mockAssetToNodesMap.clear();
        mockEditorSerialize = jest.fn((node: MockNode) => JSON.stringify({
            __type__: 'cc.Node',
            uuid: node.uuid,
            name: node.name,
        }));
        (global as any).EditorExtends = {
            serialize: mockEditorSerialize,
        };
    });

    it('serializes a plain node with reserveContentsForSyncablePrefab', () => {
        const node = new MockNode('plain-node', 'PlainNode');
        node.path = '/PlainNode';

        const snapshot = captureNodeStructureSnapshot(node as any);

        expect(snapshot).not.toBeNull();
        expect(mockEditorSerialize).toHaveBeenCalledWith(node, { reserveContentsForSyncablePrefab: true });
        expect(mockPrefabSerialize).not.toHaveBeenCalled();
        expect(JSON.parse(snapshot!.serializedJson)).toMatchObject({
            __type__: 'cc.Node',
            uuid: 'plain-node',
        });
    });

    it('uses node serialization with reserveContentsForSyncablePrefab for prefab-related nodes in auto mode', () => {
        const node = new MockNode('prefab-node', 'PrefabNode') as MockNode & { _prefab?: unknown };
        node.path = '/PrefabNode';
        node._prefab = { instance: {} };

        const snapshot = captureNodeStructureSnapshot(node as any);

        expect(snapshot).not.toBeNull();
        expect(mockEditorSerialize).toHaveBeenCalledWith(node, { reserveContentsForSyncablePrefab: true });
        expect(mockPrefabSerialize).not.toHaveBeenCalled();
        expect(JSON.parse(snapshot!.serializedJson)).toMatchObject({
            __type__: 'cc.Node',
            uuid: 'prefab-node',
        });
    });

    it('serializes mounted plain nodes with reserveContentsForSyncablePrefab', () => {
        const prefabRoot = new MockNode('prefab-root', 'PrefabRoot');
        const node = new MockNode('mounted-button', 'Button') as MockNode & {
            [editorExtrasTag]?: { mountedRoot?: MockNode };
        };
        node.path = '/PrefabRoot/Button';
        node[editorExtrasTag] = { mountedRoot: prefabRoot };
        node.components.push({ uuid: 'button-comp', __prefab: { fileId: 'button-comp-file-id' } });

        const snapshot = captureNodeStructureSnapshot(node as any);

        expect(snapshot).not.toBeNull();
        expect(mockEditorSerialize).toHaveBeenCalledWith(node, { reserveContentsForSyncablePrefab: true });
        expect(mockPrefabSerialize).not.toHaveBeenCalled();
        expect(JSON.parse(snapshot!.serializedJson)).toMatchObject({
            __type__: 'cc.Node',
            uuid: 'mounted-button',
        });
    });

    it('uses prefab serialization only when explicitly requested', () => {
        const node = new MockNode('plain-prefab-editor-root', 'PlainPrefabRoot');
        node.path = '/PlainPrefabRoot';

        const snapshot = captureNodeStructureSnapshot(node as any, '', { serialization: 'prefab' });

        expect(snapshot).not.toBeNull();
        expect(mockPrefabSerialize).toHaveBeenCalledWith(node);
        expect(mockEditorSerialize).not.toHaveBeenCalled();
    });

    it('captures prefabAssetUuid only for nodes with _prefab.instance', () => {
        const childNode = new MockNode('child', 'Child') as MockNode & { _prefab?: unknown };
        childNode.path = '/Child';
        childNode._prefab = { root: {}, asset: { _uuid: 'some-uuid' } };

        const snapshot = captureNodeStructureSnapshot(childNode as any);

        expect(snapshot!.prefabAssetUuid).toBeUndefined();
    });

    it('returns null for invalid nodes', () => {
        const node = new MockNode('invalid');
        node.isValid = false;

        expect(captureNodeStructureSnapshot(node as any)).toBeNull();
    });

    it('returns null when serialization produces empty output', () => {
        const node = new MockNode('empty', 'Empty');
        node.path = '/Empty';
        mockEditorSerialize.mockReturnValue('');

        expect(captureNodeStructureSnapshot(node as any)).toBeNull();
    });

    it('captures uuid tree for subtree restoration', () => {
        const parent = new MockNode('parent', 'Parent');
        parent.path = '/Parent';
        const child = new MockNode('child', 'Child');
        child.components = [{ uuid: 'comp-1' }];
        parent.children = [child];
        child.parent = parent;

        const snapshot = captureNodeStructureSnapshot(parent as any);

        expect(snapshot!.uuidTree).toEqual({
            uuid: 'parent',
            componentUuids: [],
            children: [{
                uuid: 'child',
                componentUuids: ['comp-1'],
                children: [],
            }],
        });
    });
});

describe('restoreNodeStructureSnapshot asset map registration', () => {
    let mockLoadWithJson: jest.Mock;

    beforeEach(() => {
        mockAssetToNodesMap.clear();

        mockSceneUtilsLoadAny.mockReset();
        mockSceneUtilsLoadAny.mockResolvedValue({ _uuid: 'prefab-asset-uuid' });

        mockLoadWithJson = jest.fn((_json: any, _opts: any, cb: (err: Error | null, asset: any) => void) => {
            const node = new MockNode('restored-node', 'Restored') as MockNode & { _prefab?: any };
            node._prefab = { instance: {}, root: node, asset: null };
            cb(null, node);
        });

        mockCcRuntime.assetManager = {
            loadWithJson: mockLoadWithJson,
        };
        mockCcRuntime.director = { getScene: () => null };

        (global as any).cc = mockCcRuntime;

        (global as any).EditorExtends = {
            serialize: jest.fn(() => '{}'),
        };

        const shared = require('../scene-process/service/undo/commands/command-utils-shared');
        shared.getEditorNodeManager.mockReturnValue({
            getNode: jest.fn(() => null),
            getNodeByPath: jest.fn(() => null),
        });
        shared.isNodeInCurrentScene.mockReturnValue(false);
    });

    afterEach(() => {
        delete mockCcRuntime.assetManager;
        delete mockCcRuntime.director;
        delete (global as any).cc;
    });

    it('registers prefab instance root in assetToNodesMap after relinkPrefabAsset', async () => {
        const parentNode = new MockNode('parent', 'Parent') as any;
        parentNode.addChild = jest.fn((child: any) => {
            child.parent = parentNode;
            parentNode.children.push(child);
        });
        parentNode.isValid = true;

        const shared = require('../scene-process/service/undo/commands/command-utils-shared');
        shared.getEditorNodeManager.mockReturnValue({
            getNode: jest.fn((uuid: string) => uuid === 'parent' ? parentNode : null),
            getNodeByPath: jest.fn(() => null),
            changeNodeUUID: jest.fn(),
        });
        shared.isNodeInCurrentScene.mockImplementation((node: any) => node === parentNode);

        const nodeMgrMod = require('../scene-process/service/node/index');
        nodeMgrMod.default.emit = jest.fn();

        const { restoreNodeStructureSnapshot } = require('../scene-process/service/undo/commands/node-structure-command-utils');

        const snapshot = {
            uuid: 'restored-node',
            path: '/Parent/Restored',
            parentUuid: 'parent',
            parentPath: '/Parent',
            siblingIndex: 0,
            serializedJson: JSON.stringify({ __type__: 'cc.Node' }),
            prefabAssetUuid: 'prefab-asset-uuid',
            uuidTree: { uuid: 'restored-node', componentUuids: [], children: [] },
        };
        const meta = { id: 'test:id', label: 'test', type: 'test', scope: {}, timestamp: 1 };

        await restoreNodeStructureSnapshot(snapshot, meta);

        expect(mockAssetToNodesMap.has('prefab-asset-uuid')).toBe(true);
        const registered = mockAssetToNodesMap.get('prefab-asset-uuid')!;
        expect(registered).toHaveLength(1);
        expect(registered[0]._prefab.asset._uuid).toBe('prefab-asset-uuid');
    });

    it('does not register in assetToNodesMap when prefabAssetUuid is absent', async () => {
        const parentNode = new MockNode('parent', 'Parent') as any;
        parentNode.addChild = jest.fn((child: any) => {
            child.parent = parentNode;
            parentNode.children.push(child);
        });
        parentNode.isValid = true;

        mockLoadWithJson.mockImplementation((_json: any, _opts: any, cb: any) => {
            const node = new MockNode('child-node', 'Child') as MockNode & { _prefab?: any };
            node._prefab = { root: {}, asset: null };
            cb(null, node);
        });

        const shared = require('../scene-process/service/undo/commands/command-utils-shared');
        shared.getEditorNodeManager.mockReturnValue({
            getNode: jest.fn((uuid: string) => uuid === 'parent' ? parentNode : null),
            getNodeByPath: jest.fn(() => null),
            changeNodeUUID: jest.fn(),
        });
        shared.isNodeInCurrentScene.mockImplementation((node: any) => node === parentNode);

        const nodeMgrMod = require('../scene-process/service/node/index');
        nodeMgrMod.default.emit = jest.fn();

        const { restoreNodeStructureSnapshot } = require('../scene-process/service/undo/commands/node-structure-command-utils');

        const snapshot = {
            uuid: 'child-node',
            path: '/Parent/Child',
            parentUuid: 'parent',
            parentPath: '/Parent',
            siblingIndex: 0,
            serializedJson: JSON.stringify({ __type__: 'cc.Node' }),
            uuidTree: { uuid: 'child-node', componentUuids: [], children: [] },
        };
        const meta = { id: 'test:id', label: 'test', type: 'test', scope: {}, timestamp: 1 };

        await restoreNodeStructureSnapshot(snapshot, meta);

        expect(mockAssetToNodesMap.size).toBe(0);
    });

    it('still restores node successfully when prefab asset loading fails', async () => {
        mockSceneUtilsLoadAny.mockRejectedValue(new Error('加载资源超时: prefab-asset-uuid'));

        const parentNode = new MockNode('parent', 'Parent') as any;
        parentNode.addChild = jest.fn((child: any) => {
            child.parent = parentNode;
            parentNode.children.push(child);
        });
        parentNode.isValid = true;

        const shared = require('../scene-process/service/undo/commands/command-utils-shared');
        shared.getEditorNodeManager.mockReturnValue({
            getNode: jest.fn((uuid: string) => uuid === 'parent' ? parentNode : null),
            getNodeByPath: jest.fn(() => null),
            changeNodeUUID: jest.fn(),
        });
        shared.isNodeInCurrentScene.mockImplementation((node: any) => node === parentNode);

        const nodeMgrMod = require('../scene-process/service/node/index');
        nodeMgrMod.default.emit = jest.fn();

        const { restoreNodeStructureSnapshot } = require('../scene-process/service/undo/commands/node-structure-command-utils');

        const snapshot = {
            uuid: 'restored-node',
            path: '/Parent/Restored',
            parentUuid: 'parent',
            parentPath: '/Parent',
            siblingIndex: 0,
            serializedJson: JSON.stringify({ __type__: 'cc.Node' }),
            prefabAssetUuid: 'prefab-asset-uuid',
            uuidTree: { uuid: 'restored-node', componentUuids: [], children: [] },
        };
        const meta = { id: 'test:id', label: 'test', type: 'test', scope: {}, timestamp: 1 };

        const result = await restoreNodeStructureSnapshot(snapshot, meta);

        expect(result.success).toBe(true);
        expect(parentNode.children).toHaveLength(1);
        expect(mockAssetToNodesMap.size).toBe(0);
    });
});
