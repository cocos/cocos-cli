import { EventEmitter } from 'events';

jest.mock('cc', () => {
    class MockNode { }
    (MockNode as any).EventType = {
        TRANSFORM_CHANGED: 'transform-changed',
        SIZE_CHANGED: 'size-changed',
        ANCHOR_CHANGED: 'anchor-changed',
        CHILD_ADDED: 'child-added',
        CHILD_REMOVED: 'child-removed',
        LIGHT_PROBE_CHANGED: 'light-probe-changed',
    };
    (MockNode as any).TransformBit = {
        POSITION: 1,
        ROTATION: 2,
        SCALE: 4,
    };

    class MockComponent { }
    class MockUITransform { }
    class MockCanvas { }
    class MockScene extends MockNode { }
    class MockMissingScript extends MockComponent { }
    class MockLODGroup extends MockComponent { }
    class MockPrefab { }

    return {
        __esModule: true,
        default: {
            director: {
                getScene: jest.fn(() => null),
            },
        },
        Node: MockNode,
        Component: MockComponent,
        UITransform: MockUITransform,
        UITransformComponent: MockUITransform,
        Canvas: MockCanvas,
        Scene: MockScene,
        MissingScript: MockMissingScript,
        LODGroup: MockLODGroup,
        Prefab: MockPrefab,
        director: {
            getScene: jest.fn(() => null),
        },
        CCObject: {
            Flags: {
                HideInHierarchy: 1 << 0,
            },
        },
        Layers: {
            Enum: {
                GIZMOS: 1 << 1,
            },
        },
    };
});

jest.mock('../scene-process/service/dump', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../scene-process/service/prefab/utils', () => ({
    prefabUtils: {},
}));

jest.mock('../scene-process/service/node/node-create', () => ({
    loadAny: jest.fn(),
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: jest.fn(),
    },
}));

const mockService = {
    Editor: {
        getRootNode: jest.fn<any, []>(() => null),
    },
};

jest.mock('../scene-process/service/core/decorator', () => ({
    Service: mockService,
}));

class MockEditorNodeManager extends EventEmitter {
    private nodes: Record<string, any> = {};

    setNodes(nodes: Record<string, any>) {
        this.nodes = nodes;
    }

    getNodesInScene() {
        return this.nodes;
    }

    getNodes() {
        return this.nodes;
    }

    clear() {
        this.nodes = {};
    }

    getNode(uuid: string) {
        return this.nodes[uuid] ?? null;
    }
}

class MockEditorComponentManager extends EventEmitter {
    clear = jest.fn();
}

function createNode(uuid: string) {
    const node: any = {
        uuid,
        name: uuid,
        isValid: true,
        layer: 0,
        objFlags: 0,
        parent: null,
        children: [],
        components: [],
        on: jest.fn(),
        off: jest.fn(),
        getComponent: jest.fn(() => null),
        setParent: jest.fn((parent: any) => {
            node.parent = parent;
        }),
        isChildOf: jest.fn((parent: any) => {
            let current = node.parent;
            while (current) {
                if (current === parent) {
                    return true;
                }
                current = current.parent;
            }
            return false;
        }),
    };
    return node;
}

function appendChild(parent: any, child: any) {
    child.parent = parent;
    parent.children.push(child);
}

function loadNodeManager(editorNode: MockEditorNodeManager, editorComponent: MockEditorComponentManager) {
    jest.resetModules();
    (globalThis as any).EditorExtends = {
        Node: editorNode,
        Component: editorComponent,
        walkProperties: jest.fn(),
        UuidUtils: {
            compressUUID: jest.fn((uuid: string) => uuid),
            decompressUUID: jest.fn((uuid: string) => uuid),
        },
    };

    const { ServiceEvents } = require('../scene-process/service/core');
    const nodeMgr = require('../scene-process/service/node/index').default;
    ServiceEvents.clear();
    return { nodeMgr, ServiceEvents };
}

describe('Node manager reload event lifecycle', () => {
    afterEach(() => {
        jest.resetModules();
        delete (globalThis as any).EditorExtends;
        mockService.Editor.getRootNode.mockReturnValue(null);
    });

    it('does not forward EditorExtends.Node add events as node:added between editor close and open', () => {
        const editorNode = new MockEditorNodeManager();
        const editorComponent = new MockEditorComponentManager();
        const existingNode = createNode('existing');
        editorNode.setNodes({ existing: existingNode });

        const { nodeMgr, ServiceEvents } = loadNodeManager(editorNode, editorComponent);
        const addedListener = jest.fn();
        ServiceEvents.on('node:added', addedListener);
        const initedListener = jest.fn();
        ServiceEvents.on('node:inited', initedListener);

        nodeMgr.initWithScene(createNode('scene'));

        const liveNode = createNode('live');
        editorNode.emit('add', 'live', liveNode);
        expect(addedListener).toHaveBeenCalledTimes(1);

        nodeMgr.onEditorClosed();

        const reloadedNode = createNode('reloaded');
        editorNode.emit('add', 'reloaded', reloadedNode);
        expect(addedListener).toHaveBeenCalledTimes(1);

        editorNode.setNodes({ reloaded: reloadedNode });
        const reloadScene = createNode('reload-scene');
        mockService.Editor.getRootNode.mockReturnValue(reloadScene);
        nodeMgr.onEditorOpened();
        expect(initedListener).toHaveBeenLastCalledWith(['reloaded'], reloadScene);

        const nextLiveNode = createNode('next-live');
        editorNode.emit('add', 'next-live', nextLiveNode);
        expect(addedListener).toHaveBeenCalledTimes(2);
    });

    it('only registers nodes from EditorExtends.Node during scene initialization', () => {
        const editorNode = new MockEditorNodeManager();
        const editorComponent = new MockEditorComponentManager();
        const trackedNode = createNode('tracked');
        const sceneArgument = createNode('scene-argument');
        editorNode.setNodes({ tracked: trackedNode });

        const { nodeMgr } = loadNodeManager(editorNode, editorComponent);

        nodeMgr.initWithScene(sceneArgument);

        expect(trackedNode.on).toHaveBeenCalled();
        expect(sceneArgument.on).not.toHaveBeenCalled();
    });

    it('does not register component event forwarding from node manager initialization', () => {
        const editorNode = new MockEditorNodeManager();
        const editorComponent = new MockEditorComponentManager();
        editorNode.setNodes({});

        const { nodeMgr, ServiceEvents } = loadNodeManager(editorNode, editorComponent);
        const componentAddedListener = jest.fn();
        ServiceEvents.on('component:added', componentAddedListener);

        nodeMgr.initWithScene(createNode('scene'));
        editorComponent.emit('add', 'component-uuid', { uuid: 'component-uuid', node: createNode('node') });

        expect(componentAddedListener).not.toHaveBeenCalled();
    });
});

describe('Node manager setParent', () => {
    afterEach(() => {
        jest.resetModules();
        delete (globalThis as any).EditorExtends;
    });

    it('rejects moving a node under itself or its descendant', () => {
        const editorNode = new MockEditorNodeManager();
        const editorComponent = new MockEditorComponentManager();
        const scene = createNode('scene');
        const parent = createNode('parent');
        const child = createNode('child');
        const grandchild = createNode('grandchild');
        appendChild(scene, parent);
        appendChild(parent, child);
        appendChild(child, grandchild);
        editorNode.setNodes({ scene, parent, child, grandchild });

        const { nodeMgr } = loadNodeManager(editorNode, editorComponent);

        expect(() => nodeMgr.setParent('parent', 'parent')).toThrow(/descendant/);
        expect(() => nodeMgr.setParent('child', 'parent')).toThrow(/descendant/);
        expect(() => nodeMgr.setParent('grandchild', 'parent')).toThrow(/descendant/);
        expect(parent.setParent).not.toHaveBeenCalled();
    });

    it('keeps valid reparenting unchanged', () => {
        const editorNode = new MockEditorNodeManager();
        const editorComponent = new MockEditorComponentManager();
        const root = createNode('root');
        const child = createNode('child');
        const nextParent = createNode('next-parent');
        appendChild(root, child);
        appendChild(root, nextParent);
        editorNode.setNodes({ root, child, 'next-parent': nextParent });

        const { nodeMgr } = loadNodeManager(editorNode, editorComponent);

        expect(nodeMgr.setParent('next-parent', 'child')).toEqual(['child']);
        expect(child.setParent).toHaveBeenCalledWith(nextParent, false);
    });
});
