// _createNode('/', ...) 在 prefab 模式下的父级归属回归测试。
//
// NodeMgr.getNodeByPath('/') 在 prefab 模式下会返回承载 prefab 的 virtualScene，
// 而不是 Service.Editor.getRootNode() 指向的预制体根。如果 _getOrCreateNodeByPath /
// _getCreatePathPreflight 不显式识别根路径，就会让 virtualScene 短路成 parent，
// 新节点最后挂在预制体根旁边而非其下（触发 "prefab 只允许一个根" 的清理）。
//
// 这里锁住入口层：调用方传 '/'（或 '//' 等前导斜杠变体）时，父级必须是
// Service.Editor.getRootNode()——也就是 currentScene，而不是 director 场景。

const mockLock = jest.fn(async () => undefined);
const mockUnlock = jest.fn();
const mockGetCurrentEditorType = jest.fn(() => 'prefab');
const mockGetRootNode = jest.fn();
const mockRemovePrefabInfoFromNode = jest.fn();
const mockCreateNodeByAsset = jest.fn();
const mockCreateShouldHideInHierarchyCanvasNode = jest.fn();
const mockLoadAny = jest.fn();
const mockQueryCanvasRequiredByAsset = jest.fn();
const mockRpcRequest = jest.fn();
const mockGetUICanvasNode = jest.fn<any, any[]>(() => null);
const mockGetUITransformParentNode = jest.fn<any, any[]>(() => null);
const mockInstantiate = jest.fn();
const mockGenerateNodeDump = jest.fn();
const mockScene = { name: 'VirtualScene', uuid: 'virtual-scene-uuid' };

class MockCanvas {}
class MockUITransform {}

class MockNode {
    uuid: string;
    name: string;
    parent: MockNode | null = null;
    children: MockNode[] = [];
    components: any[] = [];
    layer = 0;
    position = { z: 0 };
    addChild = jest.fn((node: MockNode) => {
        this.children.push(node);
        node.parent = this;
    });
    addComponent = jest.fn((component: any) => {
        const instance = component === 'cc.UITransform' ? new MockUITransform() : new component();
        this.components.push(instance);
        return instance;
    });
    setPosition = jest.fn();
    setParent = jest.fn((parent: MockNode | null) => {
        this.parent = parent;
    });
    getChildByName: (name: string) => MockNode | null = jest.fn((name: string): MockNode | null => (
        this.children.find((child: MockNode): boolean => child.name === name) ?? null
    ));
    getSiblingIndex = jest.fn(() => this.parent?.children.indexOf(this) ?? 0);

    constructor(name = 'Node') {
        this.name = name;
        this.uuid = `${name}-uuid`;
    }

    get isValid() {
        return true;
    }
}

(global as any).EditorExtends = {
    Node: {
        getNodeByPath: jest.fn(),
        getNodePath: jest.fn((node: MockNode) => `/${node.name}`),
    },
};

(global as any).cc = {
    instantiate: mockInstantiate,
    UITransform: MockUITransform,
    Node: MockNode,
};

jest.mock('cc', () => ({
    Canvas: MockCanvas,
    CCClass: { getInheritanceChain: jest.fn(() => []) },
    CCObject: { Flags: { HideInHierarchy: 1, LockedInEditor: 2 } },
    Component: class Component {},
    director: { getScene: jest.fn(() => mockScene) },
    Node: MockNode,
    Prefab: class Prefab {},
    Quat: class Quat {},
    UITransform: MockUITransform,
    Vec3: class Vec3 {},
}));

jest.mock('../../scene-process/service/core', () => ({
    BaseService: class BaseService {
        emit = jest.fn();
    },
    register: () => () => undefined,
    Service: {
        Editor: {
            lock: mockLock,
            unlock: mockUnlock,
            getCurrentEditorType: mockGetCurrentEditorType,
            getRootNode: mockGetRootNode,
        },
        Prefab: {
            removePrefabInfoFromNode: mockRemovePrefabInfoFromNode,
        },
        Undo: {
            push: jest.fn(),
        },
    },
}));

jest.mock('../../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: mockRpcRequest }) },
}));

jest.mock('../../scene-process/service/node/node-create', () => ({
    createNodeByAsset: mockCreateNodeByAsset,
    createShouldHideInHierarchyCanvasNode: mockCreateShouldHideInHierarchyCanvasNode,
    loadAny: mockLoadAny,
    queryCanvasRequiredByAsset: mockQueryCanvasRequiredByAsset,
}));

jest.mock('../../scene-process/service/node/node-utils', () => ({
    getUICanvasNode: mockGetUICanvasNode,
    getUITransformParentNode: mockGetUITransformParentNode,
    hasOneKindOfComponent: (node: MockNode, kind: any) => node.components.some((component) => component instanceof kind),
    setLayer: jest.fn(),
}));

jest.mock('../../scene-process/service/node/node-undo', () => ({
    NodeUndoHelper: jest.fn().mockImplementation(() => ({
        shouldRecordStructureCommand: jest.fn(() => false),
        collectSceneNodeUuids: jest.fn(() => new Set()),
        getCreateRootPath: jest.fn(() => null),
        recordCreateNodeCommand: jest.fn(),
    })),
}));

jest.mock('../../scene-process/service/node/index', () => ({
    __esModule: true,
    default: {
        ensureUITransformComponent: jest.fn((node: MockNode) => node.addComponent('cc.UITransform')),
    },
}));

jest.mock('../../scene-process/service/prefab/utils', () => ({
    prefabUtils: { getPrefabStateInfo: jest.fn(() => ({})) },
}));

jest.mock('../../scene-process/service/scene/utils', () => ({
    sceneUtils: { generateNodeDump: mockGenerateNodeDump },
}));

jest.mock('../../scene-process/service/undo/commands/remove-node-command', () => ({
    RemoveNodeCommand: {},
}));

jest.mock('../../scene-process/service/undo/commands/remove-component-command', () => ({
    RemoveComponentCommand: {},
}));

jest.mock('../../scene-process/service/animation/property-commit-event', () => ({
    broadcastAnimationPropertyCommitted: jest.fn(),
}));

import { NodeType } from '../../common';

describe('NodeService prefab mode root-path parent resolution', () => {
    let virtualScene: MockNode;
    let prefabRoot: MockNode;
    let capturedResultNode: MockNode | null;

    beforeEach(() => {
        jest.clearAllMocks();

        virtualScene = new MockNode('VirtualScene');
        prefabRoot = new MockNode('PrefabRoot');
        prefabRoot.parent = virtualScene;

        mockGetCurrentEditorType.mockReturnValue('prefab');
        mockGetRootNode.mockReturnValue(prefabRoot);
        mockGetUICanvasNode.mockReturnValue(null);
        mockGetUITransformParentNode.mockReturnValue(null);

        // NodeMgr.getNodeByPath('/') 恒回 virtualScene——就是实机上的 bug 输入
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation(
            (path: string) => (path === '/' || path === '//' ? virtualScene : null),
        );

        capturedResultNode = null;
        mockGenerateNodeDump.mockImplementation((node: MockNode) => {
            capturedResultNode = node;
            return { path: `/${node.name}` };
        });
    });

    it('path="/" in prefab mode places new empty node under prefab root, not the virtual scene', async () => {
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await service._createNode(null, false, false, {
            path: '/',
            nodeType: NodeType.EMPTY,
            workMode: '2d',
        });

        expect(capturedResultNode).not.toBeNull();
        expect(capturedResultNode!.setParent).toHaveBeenCalledTimes(1);
        expect(capturedResultNode!.setParent).toHaveBeenCalledWith(prefabRoot, undefined);
        expect(capturedResultNode!.parent).toBe(prefabRoot);
        expect(capturedResultNode!.parent).not.toBe(virtualScene);
    });

    it('multiple leading slashes (e.g. "//") resolve to prefab root the same way', async () => {
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await service._createNode(null, false, false, {
            path: '//',
            nodeType: NodeType.EMPTY,
            workMode: '2d',
        });

        expect(capturedResultNode!.parent).toBe(prefabRoot);
    });

    it('preflight for path="/" in prefab mode plans parent as prefab root, not virtual scene', async () => {
        prefabRoot.components.push(new MockUITransform());
        mockGetUITransformParentNode.mockReturnValue(prefabRoot);

        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'create',
            uiTransformPath: '/PrefabRoot',
        });
    });

    it('non-root paths still route through NodeMgr.getNodeByPath as before', async () => {
        const existingChild = new MockNode('ExistingChild');
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation(
            (path: string) => (path === '/ExistingChild' ? existingChild : null),
        );
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await service._createNode(null, false, false, {
            path: '/ExistingChild',
            nodeType: NodeType.EMPTY,
            workMode: '2d',
        });

        expect(capturedResultNode!.parent).toBe(existingChild);
    });
});
