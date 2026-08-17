const mockLock = jest.fn(async () => undefined);
const mockUnlock = jest.fn();
const mockGetCurrentEditorType = jest.fn(() => 'scene');
const mockGetRootNode = jest.fn();
const mockRemovePrefabInfoFromNode = jest.fn();
const mockCreateNodeByAsset = jest.fn();
const mockCreateShouldHideInHierarchyCanvasNode = jest.fn();
const mockLoadAny = jest.fn();
const mockQueryCanvasRequiredByAsset = jest.fn();
const mockRpcRequest = jest.fn();
const mockGetUICanvasNode = jest.fn();
const mockGetUITransformParentNode = jest.fn();
const mockInstantiate = jest.fn();
const mockScene = { name: 'Scene' };

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
    getChildByName = jest.fn((name: string) => this.children.find(child => child.name === name) ?? null);
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
    sceneUtils: {
        generateNodeDump: jest.fn((node: MockNode) => ({ path: `/${node.name}` })),
    },
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

describe('NodeService Canvas requirement handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCurrentEditorType.mockReturnValue('scene');
        mockGetRootNode.mockReturnValue(new MockNode('Root'));
        mockGetUICanvasNode.mockReturnValue(null);
        mockGetUITransformParentNode.mockReturnValue(null);
        mockLoadAny.mockResolvedValue({});
        mockInstantiate.mockImplementation(() => new MockNode('Canvas'));
        mockQueryCanvasRequiredByAsset.mockResolvedValue(false);
        mockRpcRequest.mockReset();
    });

    it('keeps empty nodes plain unless Canvas is explicitly requested', async () => {
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Node' });

        await service.createByType({ path: '/', nodeType: NodeType.EMPTY, workMode: '2d' });

        expect(service._createNode).toHaveBeenCalledWith(null, false, true, expect.objectContaining({
            nodeType: NodeType.EMPTY,
            workMode: '2d',
        }));
    });

    it('honors explicit Canvas requests when creating empty nodes', async () => {
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Node' });

        await service.createByType({ path: '/', nodeType: NodeType.EMPTY, workMode: '2d', canvasRequired: true });

        expect(service._createNode).toHaveBeenCalledWith(null, true, true, expect.objectContaining({
            nodeType: NodeType.EMPTY,
            workMode: '2d',
            canvasRequired: true,
        }));
    });

    it('does not create a Canvas when prefab handling is cancelled or omitted', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const parent = new MockNode('PrefabRoot');
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await expect(service.checkCanvasRequired('2d', true, parent, undefined)).resolves.toBe(parent);

        expect(mockLoadAny).not.toHaveBeenCalled();
        expect(mockInstantiate).not.toHaveBeenCalled();
        expect(mockCreateShouldHideInHierarchyCanvasNode).not.toHaveBeenCalled();
    });

    it('creates a Canvas parent when the host selects the create-canvas prefab branch', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const parent = new MockNode('PrefabRoot');
        const canvas = new MockNode('Canvas');
        mockInstantiate.mockReturnValue(canvas);
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await expect(service.checkCanvasRequired('2d', true, parent, undefined, 'create-canvas')).resolves.toBe(canvas);

        expect(mockLoadAny).toHaveBeenCalledTimes(1);
        expect(mockInstantiate).toHaveBeenCalledTimes(1);
        expect(mockRemovePrefabInfoFromNode).toHaveBeenCalledWith(canvas);
        expect(parent.addChild).toHaveBeenCalledWith(canvas);
    });

    it('adds UITransform to the prefab root when the host selects that prefab branch', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const scene = new MockNode('Scene');
        const root = new MockNode('PrefabRoot');
        const parent = new MockNode('ChildParent');
        const previewCanvas = new MockNode('PreviewCanvas');
        root.parent = scene;
        mockGetRootNode.mockReturnValue(root);
        mockCreateShouldHideInHierarchyCanvasNode.mockResolvedValue(previewCanvas);
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await expect(service.checkCanvasRequired('2d', true, parent, undefined, 'add-root-ui-transform')).resolves.toBe(parent);

        expect(root.addComponent).toHaveBeenCalledWith('cc.UITransform');
        expect(mockCreateShouldHideInHierarchyCanvasNode).toHaveBeenCalledWith(mockScene, '2d');
        expect(root.parent).toBe(previewCanvas);
        expect(mockLoadAny).not.toHaveBeenCalled();
    });

    it('reuses an existing UITransform parent in prefab mode before using host handling', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const parent = new MockNode('ChildParent');
        const uiParent = new MockNode('UIParent');
        mockGetUITransformParentNode.mockReturnValue(uiParent);
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();

        await expect(service.checkCanvasRequired('2d', true, parent, undefined, 'create-canvas')).resolves.toBe(parent);

        expect(mockLoadAny).not.toHaveBeenCalled();
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

    it('asks the host to choose prefab Canvas handling only when creation needs it', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        mockGetRootNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toEqual({
            action: 'choose-prefab-canvas-handling',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
        });
    });

    it('returns existing UI context paths when creation can proceed directly', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        root.components.push(new MockUITransform());
        mockGetRootNode.mockReturnValue(root);
        mockGetUITransformParentNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toEqual({
            action: 'create',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: '/PrefabRoot',
        });
    });

    it('returns the reusable Canvas path when Canvas context exists', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        root.components.push(new MockCanvas());
        mockGetRootNode.mockReturnValue(root);
        mockGetUICanvasNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toEqual({
            action: 'create',
            canvasRequired: true,
            canvasPath: '/PrefabRoot',
            uiTransformPath: null,
        });
    });

    it('does not prompt when a missing ordinary parent path will create UITransform', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        mockGetRootNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/PrefabRoot/NewParent',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toEqual({
            action: 'create',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
        });
    });

    it('derives Canvas requirements from assets during preflight', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        mockGetRootNode.mockReturnValue(new MockNode('PrefabRoot'));
        mockRpcRequest.mockImplementation((_service: string, method: string) => {
            if (method === 'queryUUID') return 'asset-uuid';
            if (method === 'queryAssetInfo') return { type: 'cc.BitmapFont' };
            return null;
        });
        mockQueryCanvasRequiredByAsset.mockResolvedValue(true);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            dbURL: 'db://assets/font.fnt',
            workMode: '2d',
        })).resolves.toEqual({
            action: 'choose-prefab-canvas-handling',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
        });
        expect(mockQueryCanvasRequiredByAsset).toHaveBeenCalledWith({
            uuid: 'asset-uuid',
            type: 'cc.BitmapFont',
            workMode: '2d',
        });
    });

});
