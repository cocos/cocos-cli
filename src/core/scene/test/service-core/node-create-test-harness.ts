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
export const mockBaseRemoveNode = jest.fn();
export const mockRemoveComponent = jest.fn();
export const mockUndoPush = jest.fn();
export const mockShouldRecordStructureCommand = jest.fn(() => false);
export const mockCollectSceneNodeUuids = jest.fn(() => new Set<string>());
export const mockRecordCreateNodeCommand = jest.fn();
export const mockScene = { name: 'Scene' };

export class MockCanvas {}
export class MockUITransform {
    uuid = 'ui-transform-uuid';
    isValid = true;

    constructor(public node: MockNode | null = null) {}
}

export class MockNode {
    uuid: string;
    name: string;
    parent: MockNode | null = null;
    children: MockNode[] = [];
    components: any[] = [];
    layer = 0;
    position = { z: 0 };
    private _valid = true;
    addChild = jest.fn((node: MockNode) => {
        node.setParent(this);
    });
    addComponent = jest.fn((component: any) => {
        const instance = component === 'cc.UITransform' ? new MockUITransform(this) : new component();
        this.components.push(instance);
        return instance;
    });
    removeComponent = jest.fn((component: MockUITransform) => {
        this.components = this.components.filter(current => current !== component);
        component.isValid = false;
    });
    setPosition = jest.fn();
    destroy = jest.fn(() => {
        this.setParent(null);
        this._valid = false;
    });
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
    setSiblingIndex = jest.fn((siblingIndex: number) => {
        if (!this.parent) {
            return;
        }
        const currentIndex = this.parent.children.indexOf(this);
        if (currentIndex >= 0) {
            this.parent.children.splice(currentIndex, 1);
        }
        this.parent.children.splice(siblingIndex, 0, this);
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
        return this._valid;
    }
}

(global as any).EditorExtends = {
    Node: {
        getNodeByPath: jest.fn(),
        getNodePath: jest.fn((node: MockNode) => `/${node.name}`),
        remove: jest.fn(),
    },
    Component: {
        remove: jest.fn(),
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
            push: mockUndoPush,
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

jest.mock('../../scene-process/service/component/index', () => ({
    __esModule: true,
    default: {
        removeComponent: mockRemoveComponent,
    },
}));

jest.mock('../../scene-process/service/node/node-undo', () => ({
    NodeUndoHelper: jest.fn().mockImplementation(() => ({
        shouldRecordStructureCommand: mockShouldRecordStructureCommand,
        collectSceneNodeUuids: mockCollectSceneNodeUuids,
        getCreateRootPath: jest.fn(() => null),
        recordCreateNodeCommand: mockRecordCreateNodeCommand,
    })),
}));

jest.mock('../../scene-process/service/node/index', () => ({
    __esModule: true,
    default: {
        ensureUITransformComponent: jest.fn((node: MockNode) => node.addComponent('cc.UITransform')),
        baseRemoveNode: mockBaseRemoveNode,
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
    mockShouldRecordStructureCommand.mockReturnValue(false);
    mockCollectSceneNodeUuids.mockReturnValue(new Set());
    mockRemoveComponent.mockImplementation((component: MockUITransform) => {
        component.node?.removeComponent(component);
        return true;
    });
    mockBaseRemoveNode.mockImplementation((node: MockNode) => node.destroy());
    (global as any).EditorExtends.Node.getNodeByPath.mockReturnValue(null);
}
