export const mockLock = jest.fn(async () => undefined);
export const mockUnlock = jest.fn();
export const mockGetCurrentEditorType = jest.fn(() => 'scene');
export const mockGetRootNode = jest.fn();
export const mockRemovePrefabInfoFromNode = jest.fn();
export const mockCreateNodeByAsset = jest.fn();
export const mockCreateShouldHideInHierarchyCanvasNode = jest.fn();
export const mockLoadAny = jest.fn();
export const mockQueryCanvasRequiredByAsset = jest.fn();
export const mockRpcRequest = jest.fn();
export const mockGetUICanvasNode = jest.fn();
export const mockGetUITransformParentNode = jest.fn();
export const mockInstantiate = jest.fn();
export const mockScene = { name: 'Scene' };

export class MockCanvas {}
export class MockUITransform {}

export class MockNode {
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
    destroy = jest.fn();
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
    getChildByName: (name: string) => MockNode | null = jest.fn(
        (name: string): MockNode | null =>
            this.children.find((child: MockNode): boolean => child.name === name) ?? null,
    );
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
    hasOneKindOfComponent: (node: MockNode, kind: any) => node.components.some(component => component instanceof kind),
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

export interface IAnchoredTree {
    root: MockNode;
    parent: MockNode;
    before: MockNode;
    anchor: MockNode;
    after: MockNode;
}

export function createAnchoredTree(parentName?: string, rootName = 'Root'): IAnchoredTree {
    const root = new MockNode(rootName);
    const parent = parentName ? new MockNode(parentName) : root;
    const before = new MockNode('Before');
    const anchor = new MockNode('Anchor');
    const after = new MockNode('After');
    if (parent !== root) {
        root.addChild(parent);
    }
    parent.addChild(before);
    parent.addChild(anchor);
    parent.addChild(after);
    return { root, parent, before, anchor, after };
}

export function mockNodeAtPath(path: string, node: MockNode): void {
    (global as any).EditorExtends.Node.getNodeByPath.mockImplementation((candidate: string) =>
        candidate === path ? node : null,
    );
}

export function mockPrefabAsset(nodeName = 'AssetInstance', canvasRequired = false): void {
    mockRpcRequest.mockImplementation(async (_service: string, method: string) => {
        if (method === 'queryAssetInfo') {
            return {
                uuid: 'asset-uuid',
                type: 'cc.Prefab',
                imported: true,
                invalid: false,
            };
        }
        return undefined;
    });
    mockCreateNodeByAsset.mockResolvedValue({
        node: new MockNode(nodeName),
        canvasRequired,
    });
}

export function resetNodeCreateMocks(): void {
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
}
