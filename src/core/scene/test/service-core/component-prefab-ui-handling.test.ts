const mockLock = jest.fn(async () => undefined);
const mockUnlock = jest.fn();
const mockGetRootNode = jest.fn();
const mockGetNodeByPath = jest.fn();
const mockGetNodePath = jest.fn();
const mockCreateShouldHideInHierarchyCanvasNode = jest.fn();
const mockOnComponentAddedFromEditor = jest.fn();
const mockQueryFromPath = jest.fn();
const mockDumpComponent = jest.fn(() => ({ value: {} }));
const mockCaptureMany = jest.fn(() => null);
const mockGetClassById = jest.fn(() => null);
const mockGetClassByName = jest.fn((name: string): any => {
    if (name === 'cc.UITransform') {
        return MockUITransform;
    }
    if (name === 'cc.PolygonCollider2D') {
        return MockPolygonCollider2D;
    }
    return null;
});
const mockIsChildClassOf = jest.fn(() => true);
const mockAssetRequest = jest.fn();
const mockScene = { name: 'Scene' };

class MockCanvas {}
class MockComponent {
    uuid = `component-${Math.random()}`;
    isValid = true;
    node!: MockNode;
}
class MockUITransform extends MockComponent {
    contentSize = { width: 100, height: 100 };
    anchorX = 0.5;
    anchorY = 0.5;
}
class MockVec2 {
    constructor(public x = 0, public y = 0) {}
}
class MockSprite extends MockComponent {
    spriteFrame: MockSpriteFrame | null = null;
}
class MockSpriteFrame {
    _uuid = 'texture-uuid@spriteFrame';

    getRect() {
        return { x: 0, y: 0, width: 2, height: 2 };
    }

    isRotated() {
        return false;
    }
}
class MockPolygonCollider2D extends MockComponent {
    threshold = 1;
    points = [
        new MockVec2(-1, -1),
        new MockVec2(1, -1),
        new MockVec2(1, 1),
        new MockVec2(-1, 1),
    ];
}

class MockNode {
    uuid: string;
    name: string;
    parent: MockNode | null = null;
    children: MockNode[] = [];
    components: any[] = [];
    addComponent = jest.fn((component: any) => {
        const instance = component === 'cc.UITransform' ? new MockUITransform() : new component();
        instance.node = this;
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
        getNodePath: mockGetNodePath,
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
    PolygonCollider2D: MockPolygonCollider2D,
    RigidBody: class RigidBody {},
    Scene: class Scene {},
    Sprite: MockSprite,
    UITransform: MockUITransform,
    Vec2: MockVec2,
    Physics2DUtils: {
        PolygonSeparator: {
            ForceCounterClockWise: jest.fn(),
        },
    },
    js: {
        getClassById: mockGetClassById,
        getClassByName: mockGetClassByName,
        getClassName: (ctor: { name?: string }) => ctor?.name || '',
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
    Rpc: { getInstance: () => ({ request: mockAssetRequest }) },
}));

jest.mock('../../scene-process/service/dump', () => ({
    __esModule: true,
    default: {
        dumpComponent: mockDumpComponent,
        restoreProperty: jest.fn(async () => undefined),
    },
}));

jest.mock('../../scene-process/service/component/index', () => ({
    __esModule: true,
    default: {
        onComponentAddedFromEditor: mockOnComponentAddedFromEditor,
        queryFromPath: mockQueryFromPath,
    },
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
        mockGetNodePath.mockReturnValue('/Target');
        mockCreateShouldHideInHierarchyCanvasNode.mockResolvedValue(new MockNode('PreviewCanvas'));
        mockAssetRequest.mockReset();
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

    it('notifies component creation before waiting for PolygonCollider2D points, but delays dumping', async () => {
        const target = new MockNode('Target');
        target.addComponent(MockUITransform);
        const sprite = target.addComponent(MockSprite) as MockSprite;
        sprite.spriteFrame = new MockSpriteFrame();
        mockGetNodeByPath.mockReturnValue(target);
        let rejectImageExtraction!: (reason: Error) => void;
        mockAssetRequest.mockImplementationOnce(() => new Promise((_resolve, reject) => {
            rejectImageExtraction = reject;
        }));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const { ComponentService } = require('../../scene-process/service/component');
        const service = new ComponentService();
        const adding = service.add({
            nodePath: '/Target',
            component: 'cc.PolygonCollider2D',
        });

        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(mockAssetRequest).toHaveBeenCalled();
        expect(mockOnComponentAddedFromEditor).toHaveBeenCalledWith(expect.any(MockPolygonCollider2D));
        expect(mockDumpComponent).not.toHaveBeenCalled();
        expect(mockCaptureMany).not.toHaveBeenCalled();

        rejectImageExtraction(new Error('decode failed'));
        await expect(adding).resolves.toBeDefined();

        expect(mockOnComponentAddedFromEditor).toHaveBeenCalledTimes(1);
        expect(mockDumpComponent).toHaveBeenCalledTimes(1);
        expect(mockCaptureMany).toHaveBeenCalledTimes(1);
        warn.mockRestore();
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

    describe('PolygonCollider2D regeneration', () => {
        function createColliderFixture() {
            const node = new MockNode('PolygonNode');
            const transform = new MockUITransform();
            transform.node = node;
            transform.contentSize = { width: 200, height: 80 };
            transform.anchorX = 0.25;
            transform.anchorY = 0.75;
            const collider = new MockPolygonCollider2D();
            collider.node = node;
            node.components.push(transform, collider);
            return { node, collider };
        }

        it('commits the generated points through the real component index and setProperty', async () => {
            const { node, collider } = createColliderFixture();
            mockQueryFromPath.mockReturnValue(collider);
            mockGetNodePath.mockReturnValue('/PolygonNode');
            mockDumpComponent.mockReturnValue({
                value: {
                    points: {
                        name: 'points',
                        path: '',
                        type: 'cc.Vec2',
                        isArray: true,
                        elementTypeData: {
                            name: '',
                            path: '',
                            type: 'cc.Vec2',
                            value: { x: 0, y: 0 },
                        },
                        value: [],
                    },
                },
            });

            const { ComponentService } = require('../../scene-process/service/component');
            const service = new ComponentService();
            const setProperty = jest.spyOn(service, 'setProperty').mockResolvedValue(true);

            const result = await service.regeneratePolygon2DPoints({
                path: '/PolygonNode/cc.PolygonCollider2D',
                record: false,
            });

            expect(result).toEqual({
                path: '/PolygonNode/cc.PolygonCollider2D',
                changed: true,
                pointCount: 4,
                source: 'rect-fallback',
            });
            expect(setProperty).toHaveBeenCalledWith(expect.objectContaining({
                nodePath: '/PolygonNode',
                path: '__comps__.1.points',
                record: false,
                dump: expect.objectContaining({
                    value: [
                        expect.objectContaining({ value: { x: -50, y: -60 } }),
                        expect.objectContaining({ value: { x: -50, y: 20 } }),
                        expect.objectContaining({ value: { x: 150, y: 20 } }),
                        expect.objectContaining({ value: { x: 150, y: -60 } }),
                    ],
                }),
            }));
            expect(node.components.indexOf(collider)).toBe(1);
            expect(mockLock).toHaveBeenCalled();
            expect(mockUnlock).toHaveBeenCalled();
        });

        it('does not call setProperty when the generated rectangle is unchanged', async () => {
            const { collider } = createColliderFixture();
            const transform = collider.node.components[0] as MockUITransform;
            transform.contentSize = { width: 2, height: 2 };
            transform.anchorX = 0.5;
            transform.anchorY = 0.5;
            collider.points = [
                new MockVec2(-1, -1),
                new MockVec2(-1, 1),
                new MockVec2(1, 1),
                new MockVec2(1, -1),
            ];
            mockQueryFromPath.mockReturnValue(collider);

            const { ComponentService } = require('../../scene-process/service/component');
            const service = new ComponentService();
            const setProperty = jest.spyOn(service, 'setProperty').mockResolvedValue(true);

            const result = await service.regeneratePolygon2DPoints({
                path: '/PolygonNode/cc.PolygonCollider2D',
            });

            expect(result).toMatchObject({ changed: false, pointCount: 4 });
            expect(setProperty).not.toHaveBeenCalled();
        });

        it('propagates generation errors and still releases the editor lock', async () => {
            const { node, collider } = createColliderFixture();
            const sprite = new MockSprite();
            sprite.node = node;
            sprite.spriteFrame = new MockSpriteFrame();
            node.components.splice(1, 0, sprite);
            mockQueryFromPath.mockReturnValue(collider);
            mockAssetRequest.mockRejectedValue(new Error('decode failed'));

            const { ComponentService } = require('../../scene-process/service/component');
            const service = new ComponentService();
            const setProperty = jest.spyOn(service, 'setProperty').mockResolvedValue(true);

            await expect(service.regeneratePolygon2DPoints({
                path: '/PolygonNode/cc.PolygonCollider2D',
            })).rejects.toThrow('decode failed');

            expect(setProperty).not.toHaveBeenCalled();
            expect(mockUnlock).toHaveBeenCalled();
        });
    });
});
