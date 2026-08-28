const mockLock = jest.fn(async () => undefined);
const mockUnlock = jest.fn();
const mockGetRootNode = jest.fn();
const mockGetNodeByPath = jest.fn();
const mockCreateShouldHideInHierarchyCanvasNode = jest.fn();
const mockOnComponentAddedFromEditor = jest.fn();
const mockDumpComponent = jest.fn(() => ({ value: {} }));
const mockCaptureMany = jest.fn(() => null);
const mockGetClassById = jest.fn(() => null);
const mockGetClassByName = jest.fn((name: string) => name === 'cc.UITransform' ? MockUITransform : null);
const mockIsChildClassOf = jest.fn(() => true);
const mockScene = { name: 'Scene' };

class MockCanvas {}
class MockComponent {
    uuid = `component-${Math.random()}`;
}
class MockUITransform extends MockComponent {}

class MockNode {
    uuid: string;
    name: string;
    parent: MockNode | null = null;
    children: MockNode[] = [];
    components: any[] = [];
    addComponent = jest.fn((component: any) => {
        const instance = component === 'cc.UITransform' ? new MockUITransform() : new component();
        this.components.push(instance);
        return instance;
    });
    getComponent = jest.fn((component: any) => this.components.find((item) => item instanceof component) || null);

    constructor(name = 'Node') {
        this.name = name;
        this.uuid = `${name}-uuid`;
    }
}

(global as any).cc = {
    js: {
        getClassById: mockGetClassById,
        getClassByName: mockGetClassByName,
        isChildClassOf: mockIsChildClassOf,
    },
};

(global as any).EditorExtends = {
    Node: {
        getNodeByPath: mockGetNodeByPath,
    },
};

jest.mock('cc', () => ({
    Animation: class Animation {},
    animation: { AnimationController: class AnimationController {} },
    Canvas: MockCanvas,
    Collider: class Collider {},
    Component: MockComponent,
    Constructor: Function,
    director: { getScene: jest.fn(() => mockScene) },
    ERigidBodyType: {},
    EColliderType: {},
    MeshCollider: class MeshCollider {},
    Node: MockNode,
    RigidBody: class RigidBody {},
    Scene: class Scene {},
    UITransform: MockUITransform,
    js: {
        getClassById: mockGetClassById,
        getClassByName: mockGetClassByName,
        isChildClassOf: mockIsChildClassOf,
    },
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
            getRootNode: mockGetRootNode,
        },
        Script: {
            queryScriptCid: jest.fn(),
            isCustomComponent: jest.fn(() => false),
        },
        Undo: {
            push: jest.fn(),
            isApplying: jest.fn(() => false),
        },
    },
}));

jest.mock('../../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: jest.fn() }) },
}));

jest.mock('../../scene-process/service/dump', () => ({
    __esModule: true,
    default: { dumpComponent: mockDumpComponent },
}));

jest.mock('../../scene-process/service/component/index', () => ({
    __esModule: true,
    default: { onComponentAddedFromEditor: mockOnComponentAddedFromEditor },
}));

jest.mock('../../scene-process/service/component/utils', () => ({
    __esModule: true,
    default: { isUUID: jest.fn(() => false) },
}));

jest.mock('../../scene-process/service/component/get-component-function-of-node', () => jest.fn());

jest.mock('../../scene-process/service/node/node-utils', () => ({
    hasOneKindOfComponent: (node: MockNode, kind: any) => node.components.some((component) => component instanceof kind),
    isEditorNode: jest.fn(() => false),
}));

jest.mock('../../scene-process/service/node/node-create', () => ({
    createShouldHideInHierarchyCanvasNode: mockCreateShouldHideInHierarchyCanvasNode,
}));

jest.mock('../../scene-process/service/prefab', () => ({
    __esModule: true,
    default: {
        onRemoveComponentInGeneralMode: jest.fn(),
        onComponentRemovedInGeneralMode: jest.fn(),
    },
}));

jest.mock('../../scene-process/service/undo/commands/add-component-command', () => ({
    AddComponentCommand: { captureMany: mockCaptureMany },
}));

jest.mock('../../scene-process/service/undo/commands/remove-component-command', () => ({
    RemoveComponentCommand: {},
}));

jest.mock('../../scene-process/service/undo/commands/snapshot-command', () => ({
    SnapshotCommand: {},
}));

jest.mock('../../scene-process/service/undo/commands/command-utils-shared', () => ({
    createUndoId: jest.fn(() => 'undo-id'),
    restoreComponentSnapshotDump: jest.fn(),
    snapshotMapsEqual: jest.fn(() => true),
}));

jest.mock('../../scene-process/service/undo/applying-state', () => ({
    isUndoApplying: jest.fn(() => false),
}));

jest.mock('../../scene-process/service/animation/property-commit-event', () => ({
    broadcastAnimationPropertyCommitted: jest.fn(),
}));

describe('ComponentService prefab UI handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const root = new MockNode('PrefabRoot');
        root.parent = new MockNode('Scene');
        mockGetRootNode.mockReturnValue(root);
        mockGetNodeByPath.mockReturnValue(new MockNode('Target'));
        mockCreateShouldHideInHierarchyCanvasNode.mockResolvedValue(new MockNode('PreviewCanvas'));
    });

    async function addUITransform(params: Record<string, unknown> = {}) {
        const { ComponentService } = require('../../scene-process/service/component');
        const service = new ComponentService();
        service.modeName = 'prefab';
        await service.add({
            nodePath: '/Target',
            component: 'cc.UITransform',
            ...params,
        });
        return service;
    }

    it('creates a hidden Canvas parent for prefab UI components', async () => {
        const root = mockGetRootNode();

        await addUITransform();

        expect(root.addComponent).not.toHaveBeenCalledWith('cc.UITransform');
        expect(mockCreateShouldHideInHierarchyCanvasNode).toHaveBeenCalledWith(mockScene);
        expect(root.parent?.name).toBe('PreviewCanvas');
        expect(mockOnComponentAddedFromEditor).toHaveBeenCalledTimes(1);
    });

    it('does not create a hidden Canvas when the prefab root already has Canvas', async () => {
        const root = mockGetRootNode();

        root.addComponent(MockCanvas);

        await addUITransform();

        expect(root.addComponent).not.toHaveBeenCalledWith('cc.UITransform');
        expect(mockCreateShouldHideInHierarchyCanvasNode).not.toHaveBeenCalled();
        expect(root.parent?.name).toBe('Scene');
    });

    it('keeps prefab UI component handling when adding component arrays', async () => {
        const root = mockGetRootNode();
        const { ComponentService } = require('../../scene-process/service/component');
        const service = new ComponentService();
        service.modeName = 'prefab';

        await service.add({
            nodePath: '/Target',
            component: ['cc.UITransform', 'cc.UITransform'],
        });

        expect(mockCreateShouldHideInHierarchyCanvasNode).toHaveBeenCalledTimes(2);
        expect(root.addComponent).not.toHaveBeenCalledWith('cc.UITransform');
    });
});
