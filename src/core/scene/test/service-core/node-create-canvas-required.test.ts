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
        if (this.parent) {
            const previousIndex = this.parent.children.indexOf(this);
            if (previousIndex >= 0) {
                this.parent.children.splice(previousIndex, 1);
            }
        }
        this.parent = parent;
        if (parent && !parent.children.includes(this)) {
            parent.children.push(this);
        }
    });
    insertChild = jest.fn((child: MockNode, siblingIndex: number) => {
        child.setParent(this);
        const currentIndex = this.children.indexOf(child);
        this.children.splice(currentIndex, 1);
        this.children.splice(siblingIndex, 0, child);
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
        (global as any).EditorExtends.Node.getNodeByPath.mockReturnValue(null);
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
        })).resolves.toMatchObject({
            action: 'choose-prefab-canvas-handling',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
            preflightToken: expect.any(String),
        });
    });

    it('resolves an existing Prefab root path before predicting missing path materialization', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('Node');
        mockGetRootNode.mockReturnValue(root);
        (global as any).EditorExtends.Node.getNodeByPath.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: 'Node',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'choose-prefab-canvas-handling',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
            preflightToken: expect.any(String),
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
        })).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: '/PrefabRoot',
            preflightToken: expect.any(String),
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
        })).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: '/PrefabRoot',
            uiTransformPath: null,
            preflightToken: expect.any(String),
        });
    });

    it('reports the same Canvas node used by the creation context', async () => {
        mockGetCurrentEditorType.mockReturnValue('prefab');
        const root = new MockNode('PrefabRoot');
        const canvasContext = new MockNode('ReusableCanvas');
        mockGetRootNode.mockReturnValue(root);
        mockGetUICanvasNode.mockReturnValue(canvasContext);
        const { NodeService } = require('../../scene-process/service/node');

        await expect(new NodeService().preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        })).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: '/ReusableCanvas',
            uiTransformPath: null,
            preflightToken: expect.any(String),
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
        })).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
            preflightToken: expect.any(String),
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
        })).resolves.toMatchObject({
            action: 'choose-prefab-canvas-handling',
            canvasRequired: true,
            canvasPath: null,
            uiTransformPath: null,
            preflightToken: expect.any(String),
        });
        expect(mockQueryCanvasRequiredByAsset).toHaveBeenCalledWith({
            uuid: 'asset-uuid',
            type: 'cc.BitmapFont',
            workMode: '2d',
        });
    });

    it('rejects a stale direct-create preflight token when prefab Canvas handling becomes required', async () => {
        const root = new MockNode('PrefabRoot');
        mockGetRootNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Node' });

        const preflight = await service.preflightCreate({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        });
        expect(preflight.action).toBe('create');

        mockGetCurrentEditorType.mockReturnValue('prefab');
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(service.createByType({
            path: '/',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
            preflightToken: preflight.preflightToken,
        })).rejects.toThrow('Canvas context changed after preflight');
        consoleError.mockRestore();
        expect(service._createNode).not.toHaveBeenCalled();
    });

    it('inserts a type-created node before the anchored sibling instead of nesting it', async () => {
        const root = new MockNode('Root');
        const parent = new MockNode('Parent');
        const before = new MockNode('Before');
        const anchor = new MockNode('Anchor');
        const after = new MockNode('After');
        root.addChild(parent);
        parent.addChild(before);
        parent.addChild(anchor);
        parent.addChild(after);
        mockGetRootNode.mockReturnValue(root);
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Parent/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        await new NodeService().createByType({
            path: '/Parent/Anchor',
            insertSide: 'before',
            name: 'Inserted',
            nodeType: NodeType.EMPTY,
        } as any);

        expect(parent.children.map(child => child.name)).toEqual(['Before', 'Inserted', 'Anchor', 'After']);
        expect(anchor.children).toEqual([]);
    });

    it('inserts a type-created node after the anchored sibling', async () => {
        const root = new MockNode('Root');
        const parent = new MockNode('Parent');
        const before = new MockNode('Before');
        const anchor = new MockNode('Anchor');
        const after = new MockNode('After');
        root.addChild(parent);
        parent.addChild(before);
        parent.addChild(anchor);
        parent.addChild(after);
        mockGetRootNode.mockReturnValue(root);
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Parent/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        await new NodeService().createByType({
            path: '/Parent/Anchor',
            insertSide: 'after',
            name: 'Inserted',
            nodeType: NodeType.EMPTY,
        } as any);

        expect(parent.children.map(child => child.name)).toEqual(['Before', 'Anchor', 'Inserted', 'After']);
    });

    it('inserts an asset-created node after the anchored sibling instead of nesting it', async () => {
        const root = new MockNode('Root');
        const parent = new MockNode('Parent');
        const before = new MockNode('Before');
        const anchor = new MockNode('Anchor');
        const after = new MockNode('After');
        root.addChild(parent);
        parent.addChild(before);
        parent.addChild(anchor);
        parent.addChild(after);
        mockGetRootNode.mockReturnValue(root);
        mockRpcRequest.mockImplementation(async (_service: string, method: string) => {
            if (method === 'queryUUID') {
                return 'asset-uuid';
            }
            if (method === 'queryAssetInfo') {
                return { type: 'cc.Prefab' };
            }
            return undefined;
        });
        mockCreateNodeByAsset.mockResolvedValue({ node: new MockNode('AssetInstance'), canvasRequired: false });
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Parent/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        await new NodeService().createByAsset({
            path: '/Parent/Anchor',
            insertSide: 'after',
            dbURL: 'db://assets/Asset.prefab',
        } as any);

        expect(parent.children.map(child => child.name)).toEqual(['Before', 'Anchor', 'AssetInstance', 'After']);
        expect(anchor.children).toEqual([]);
    });

    it('inserts an asset-created node before the anchored sibling', async () => {
        const root = new MockNode('Root');
        const parent = new MockNode('Parent');
        const before = new MockNode('Before');
        const anchor = new MockNode('Anchor');
        const after = new MockNode('After');
        root.addChild(parent);
        parent.addChild(before);
        parent.addChild(anchor);
        parent.addChild(after);
        mockGetRootNode.mockReturnValue(root);
        mockRpcRequest.mockImplementation(async (_service: string, method: string) => {
            if (method === 'queryUUID') {
                return 'asset-uuid';
            }
            if (method === 'queryAssetInfo') {
                return { type: 'cc.Prefab' };
            }
            return undefined;
        });
        mockCreateNodeByAsset.mockResolvedValue({ node: new MockNode('AssetInstance'), canvasRequired: false });
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Parent/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        await new NodeService().createByAsset({
            path: '/Parent/Anchor',
            insertSide: 'before',
            dbURL: 'db://assets/Asset.prefab',
        } as any);

        expect(parent.children.map(child => child.name)).toEqual(['Before', 'AssetInstance', 'Anchor', 'After']);
    });

    it('keeps direct-parent append behavior for type and asset creation without an insertion side', async () => {
        const root = new MockNode('Root');
        const parent = new MockNode('Parent');
        const existing = new MockNode('Existing');
        root.addChild(parent);
        parent.addChild(existing);
        mockGetRootNode.mockReturnValue(root);
        mockRpcRequest.mockImplementation(async (_service: string, method: string) => {
            if (method === 'queryUUID') {
                return 'asset-uuid';
            }
            if (method === 'queryAssetInfo') {
                return { type: 'cc.Prefab' };
            }
            return undefined;
        });
        mockCreateNodeByAsset.mockResolvedValue({ node: new MockNode('AssetInstance'), canvasRequired: false });
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Parent' ? parent : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        await service.createByType({ path: '/Parent', name: 'TypeInstance', nodeType: NodeType.EMPTY });
        await service.createByAsset({ path: '/Parent', dbURL: 'db://assets/Asset.prefab' });

        expect(parent.children.map(child => child.name)).toEqual(['Existing', 'TypeInstance', 'AssetInstance']);
    });

    it('preflights Canvas handling from the anchored sibling parent', async () => {
        const root = new MockNode('Root');
        const canvas = new MockNode('Canvas');
        const anchor = new MockNode('Anchor');
        root.addChild(canvas);
        canvas.addChild(anchor);
        mockGetRootNode.mockReturnValue(root);
        mockGetUICanvasNode.mockImplementation((node: MockNode) => node === canvas ? canvas : null);
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Canvas/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        await expect(new NodeService().preflightCreate({
            path: '/Canvas/Anchor',
            insertSide: 'before',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        } as any)).resolves.toMatchObject({
            action: 'create',
            canvasRequired: true,
            canvasPath: '/Canvas',
        });
    });

    it.each(['before', 'after'] as const)(
        'creates a Canvas wrapper at the anchored %s entry position when none exists',
        async insertSide => {
            const root = new MockNode('Root');
            const before = new MockNode('Before');
            const anchor = new MockNode('Anchor');
            const after = new MockNode('After');
            root.addChild(before);
            root.addChild(anchor);
            root.addChild(after);
            mockGetRootNode.mockReturnValue(root);
            mockCreateNodeByAsset.mockResolvedValue({
                node: new MockNode('Button'),
                canvasRequired: false,
            });
            (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
                path === '/Anchor' ? anchor : null
            ));

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            const params = {
                path: '/Anchor',
                insertSide,
                nodeType: NodeType.BUTTON,
                workMode: '2d',
                canvasRequired: true,
            } as const;
            const preflight = await service.preflightCreate(params);

            expect(preflight).toMatchObject({
                action: 'create',
                canvasRequired: true,
                canvasPath: null,
            });

            await expect(service.createByType({
                ...params,
                preflightToken: preflight.preflightToken,
            } as any)).resolves.toMatchObject({ path: expect.any(String) });

            expect(root.children.map(child => child.name)).toEqual(
                insertSide === 'before'
                    ? ['Before', 'Canvas', 'Anchor', 'After']
                    : ['Before', 'Anchor', 'Canvas', 'After'],
            );
            const canvas = root.children.find(child => child.name === 'Canvas');
            expect(canvas?.children.map(child => child.name)).toEqual(['Button']);
            expect(anchor.children).toEqual([]);
        },
    );

    it.each(['before', 'after'] as const)(
        'creates an asset-required Canvas wrapper at the anchored %s entry position when none exists',
        async insertSide => {
            const root = new MockNode('Root');
            const before = new MockNode('Before');
            const anchor = new MockNode('Anchor');
            const after = new MockNode('After');
            root.addChild(before);
            root.addChild(anchor);
            root.addChild(after);
            mockGetRootNode.mockReturnValue(root);
            mockRpcRequest.mockImplementation(async (_service: string, method: string) => {
                if (method === 'queryUUID') {
                    return 'asset-uuid';
                }
                if (method === 'queryAssetInfo') {
                    return { type: 'cc.Prefab' };
                }
                return undefined;
            });
            mockQueryCanvasRequiredByAsset.mockResolvedValue(true);
            mockCreateNodeByAsset.mockResolvedValue({
                node: new MockNode('AssetInstance'),
                canvasRequired: true,
            });
            (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
                path === '/Anchor' ? anchor : null
            ));

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            const params = {
                path: '/Anchor',
                insertSide,
                dbURL: 'db://assets/Asset.prefab',
                workMode: '2d',
            } as const;
            const preflight = await service.preflightCreate(params);

            await expect(service.createByAsset({
                ...params,
                preflightToken: preflight.preflightToken,
            } as any)).resolves.toMatchObject({ path: expect.any(String) });

            expect(root.children.map(child => child.name)).toEqual(
                insertSide === 'before'
                    ? ['Before', 'Canvas', 'Anchor', 'After']
                    : ['Before', 'Anchor', 'Canvas', 'After'],
            );
            const canvas = root.children.find(child => child.name === 'Canvas');
            expect(canvas?.children.map(child => child.name)).toEqual(['AssetInstance']);
        },
    );

    it('does not attach a new Canvas when the anchor becomes stale during Canvas loading', async () => {
        const root = new MockNode('Root');
        const before = new MockNode('Before');
        const anchor = new MockNode('Anchor');
        const after = new MockNode('After');
        const replacementParent = new MockNode('ReplacementParent');
        root.addChild(before);
        root.addChild(anchor);
        root.addChild(after);
        mockGetRootNode.mockReturnValue(root);
        mockCreateNodeByAsset.mockResolvedValue({
            node: new MockNode('Button'),
            canvasRequired: false,
        });
        let resolveCanvasAsset: (asset: object) => void;
        mockLoadAny.mockImplementation(() => new Promise<object>(resolve => {
            resolveCanvasAsset = resolve;
        }));
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        const creation = new NodeService().createByType({
            path: '/Anchor',
            insertSide: 'before',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
            canvasRequired: true,
        } as any);
        await new Promise<void>(resolve => setImmediate(resolve));
        anchor.setParent(replacementParent);
        resolveCanvasAsset!({});

        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(creation).rejects.toThrow('stale');
        consoleError.mockRestore();
        expect(root.children.map(child => child.name)).toEqual(['Before', 'After']);
        expect(root.children.some(child => child.name === 'Canvas')).toBe(false);
    });

    it.each(['before', 'after'] as const)(
        'places a Prefab Canvas wrapper at the anchored %s entry position after the host chooses create-canvas',
        async insertSide => {
            const root = new MockNode('PrefabRoot');
            const before = new MockNode('Before');
            const anchor = new MockNode('Anchor');
            const after = new MockNode('After');
            root.addChild(before);
            root.addChild(anchor);
            root.addChild(after);
            mockGetCurrentEditorType.mockReturnValue('prefab');
            mockGetRootNode.mockReturnValue(root);
            mockCreateNodeByAsset.mockResolvedValue({
                node: new MockNode('Button'),
                canvasRequired: false,
            });
            (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
                path === '/Anchor' ? anchor : null
            ));

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            const params = {
                path: '/Anchor',
                insertSide,
                nodeType: NodeType.BUTTON,
                workMode: '2d',
                canvasRequired: true,
            } as const;
            const preflight = await service.preflightCreate(params);

            expect(preflight).toMatchObject({
                action: 'choose-prefab-canvas-handling',
                canvasRequired: true,
            });

            await expect(service.createByType({
                ...params,
                preflightToken: preflight.preflightToken,
                prefabCanvasHandling: 'create-canvas',
            } as any)).resolves.toMatchObject({ path: expect.any(String) });

            expect(root.children.map(child => child.name)).toEqual(
                insertSide === 'before'
                    ? ['Before', 'Canvas', 'Anchor', 'After']
                    : ['Before', 'Anchor', 'Canvas', 'After'],
            );
            const canvas = root.children.find(child => child.name === 'Canvas');
            expect(canvas?.children.map(child => child.name)).toEqual(['Button']);
        },
    );

    it('keeps the captured anchor when add-root-ui-transform reparents the Prefab root', async () => {
        const root = new MockNode('PrefabRoot');
        const host = new MockNode('SceneHost');
        const before = new MockNode('Before');
        const anchor = new MockNode('Anchor');
        const after = new MockNode('After');
        const previewCanvas = new MockNode('PreviewCanvas');
        root.parent = host;
        root.addChild(before);
        root.addChild(anchor);
        root.addChild(after);
        mockGetCurrentEditorType.mockReturnValue('prefab');
        mockGetRootNode.mockReturnValue(root);
        mockCreateNodeByAsset.mockResolvedValue({
            node: new MockNode('Button'),
            canvasRequired: false,
        });
        let anchorPathIsResolvable = true;
        mockCreateShouldHideInHierarchyCanvasNode.mockImplementation(async () => {
            anchorPathIsResolvable = false;
            return previewCanvas;
        });
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Anchor' && anchorPathIsResolvable ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        const params = {
            path: '/Anchor',
            insertSide: 'before',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
            canvasRequired: true,
        } as const;
        const preflight = await service.preflightCreate(params);

        await expect(service.createByType({
            ...params,
            preflightToken: preflight.preflightToken,
            prefabCanvasHandling: 'add-root-ui-transform',
        } as any)).resolves.toMatchObject({ path: expect.any(String) });

        expect(root.children.map(child => child.name)).toEqual(['Before', 'Button', 'Anchor', 'After']);
        expect(root.components.some(component => component instanceof MockUITransform)).toBe(true);
    });

    it.each(['before', 'after'] as const)(
        'keeps an anchored %s create beside its anchor inside an existing Canvas ancestor',
        async insertSide => {
            const root = new MockNode('Root');
            const canvas = new MockNode('Canvas');
            const container = new MockNode('Container');
            const before = new MockNode('Before');
            const anchor = new MockNode('Anchor');
            const after = new MockNode('After');
            root.addChild(canvas);
            canvas.addChild(container);
            container.addChild(before);
            container.addChild(anchor);
            container.addChild(after);
            mockGetRootNode.mockReturnValue(root);
            // getUICanvasNode returns the requested node when one of its ancestors is a Canvas.
            mockGetUICanvasNode.mockImplementation((node: MockNode) =>
                node === container ? container : null,
            );
            mockCreateNodeByAsset.mockResolvedValue({
                node: new MockNode('Button'),
                canvasRequired: false,
            });
            (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
                path === '/Canvas/Container/Anchor' ? anchor : null
            ));

            const { NodeService } = require('../../scene-process/service/node');
            const service = new NodeService();
            const params = {
                path: '/Canvas/Container/Anchor',
                insertSide,
                nodeType: NodeType.BUTTON,
                workMode: '2d',
            } as const;
            const preflight = await service.preflightCreate(params);

            await expect(service.createByType({
                ...params,
                preflightToken: preflight.preflightToken,
            } as any)).resolves.toMatchObject({ path: expect.any(String) });

            expect(container.children.map(child => child.name)).toEqual(
                insertSide === 'before'
                    ? ['Before', 'Button', 'Anchor', 'After']
                    : ['Before', 'Anchor', 'Button', 'After'],
            );
            expect(anchor.children).toEqual([]);
        },
    );

    it('reuses an existing Canvas child instead of creating a second wrapper', async () => {
        const root = new MockNode('Root');
        const parent = new MockNode('Parent');
        const before = new MockNode('Before');
        const anchor = new MockNode('Anchor');
        const after = new MockNode('After');
        const canvas = new MockNode('Canvas');
        root.addChild(parent);
        parent.addChild(before);
        parent.addChild(anchor);
        parent.addChild(after);
        parent.addChild(canvas);
        mockGetRootNode.mockReturnValue(root);
        mockGetUICanvasNode.mockImplementation((node: MockNode) => node === parent ? canvas : null);
        mockCreateNodeByAsset.mockResolvedValue({
            node: new MockNode('Button'),
            canvasRequired: false,
        });
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Parent/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        const params = {
            path: '/Parent/Anchor',
            insertSide: 'before',
            nodeType: NodeType.BUTTON,
            workMode: '2d',
        } as const;
        const preflight = await service.preflightCreate(params);

        await expect(service.createByType({
            ...params,
            preflightToken: preflight.preflightToken,
        } as any)).resolves.toMatchObject({ path: expect.any(String) });

        expect(parent.children.map(child => child.name)).toEqual(['Before', 'Anchor', 'After', 'Canvas']);
        expect(canvas.children.map(child => child.name)).toEqual(['Button']);
        expect(mockInstantiate).not.toHaveBeenCalled();
    });

    it('rejects an anchored request when the sibling is missing without materializing a fallback path', async () => {
        const root = new MockNode('Root');
        mockGetRootNode.mockReturnValue(root);
        const { NodeService } = require('../../scene-process/service/node');
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(new NodeService().createByType({
            path: '/MissingAnchor',
            insertSide: 'before',
            nodeType: NodeType.EMPTY,
        } as any)).rejects.toThrow('anchor');

        consoleError.mockRestore();
        expect(root.children).toEqual([]);
    });

    it('binds insertion side to the preflight token', async () => {
        const root = new MockNode('Root');
        const parent = new MockNode('Parent');
        const anchor = new MockNode('Anchor');
        root.addChild(parent);
        parent.addChild(anchor);
        mockGetRootNode.mockReturnValue(root);
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Parent/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Parent/Inserted' });
        const preflight = await service.preflightCreate({
            path: '/Parent/Anchor',
            insertSide: 'before',
            nodeType: NodeType.EMPTY,
            prefabCanvasHandling: 'create-canvas',
        } as any);
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(service.createByType({
            path: '/Parent/Anchor',
            insertSide: 'after',
            nodeType: NodeType.EMPTY,
            prefabCanvasHandling: 'add-root-ui-transform',
            preflightToken: preflight.preflightToken,
        } as any)).rejects.toThrow('does not match the request');

        consoleError.mockRestore();
        expect(service._createNode).not.toHaveBeenCalled();
    });

    it('rejects a preflight token when its anchored node was replaced at the same path', async () => {
        const root = new MockNode('Root');
        const parent = new MockNode('Parent');
        const originalAnchor = new MockNode('Anchor');
        root.addChild(parent);
        parent.addChild(originalAnchor);
        mockGetRootNode.mockReturnValue(root);
        let anchor = originalAnchor;
        (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((path: string) => (
            path === '/Parent/Anchor' ? anchor : null
        ));

        const { NodeService } = require('../../scene-process/service/node');
        const service = new NodeService();
        service._createNode = jest.fn().mockResolvedValue({ path: '/Parent/Inserted' });
        const preflight = await service.preflightCreate({
            path: '/Parent/Anchor',
            insertSide: 'before',
            nodeType: NodeType.EMPTY,
        } as any);
        anchor = new MockNode('ReplacementAnchor');
        parent.addChild(anchor);
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(service.createByType({
            path: '/Parent/Anchor',
            insertSide: 'before',
            nodeType: NodeType.EMPTY,
            preflightToken: preflight.preflightToken,
        } as any)).rejects.toThrow('stale anchor');

        consoleError.mockRestore();
        expect(service._createNode).not.toHaveBeenCalled();
    });

});
