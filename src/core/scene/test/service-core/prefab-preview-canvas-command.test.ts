const mockCreateShouldHideInHierarchyCanvasNode = jest.fn();
const mockBaseRemoveNode = jest.fn();

class MockNode {
    uuid: string;
    name: string;
    parent: MockNode | null = null;
    children: MockNode[] = [];
    components: any[] = [];
    private _valid = true;

    constructor(name = 'Node') {
        this.name = name;
        this.uuid = `${name}-${Math.random().toString(16).slice(2)}`;
    }

    get isValid() {
        return this._valid;
    }

    addChild(node: MockNode) {
        if (node.parent) {
            node.parent.children = node.parent.children.filter(child => child !== node);
        }
        this.children.push(node);
        node.parent = this;
    }

    setSiblingIndex(index: number) {
        if (!this.parent) {
            return;
        }
        this.parent.children = this.parent.children.filter(child => child !== this);
        this.parent.children.splice(index, 0, this);
    }

    isChildOf(parent: MockNode) {
        let current = this.parent;
        while (current) {
            if (current === parent) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    destroyForTest() {
        this._valid = false;
        if (this.parent) {
            this.parent.children = this.parent.children.filter(child => child !== this);
            this.parent = null;
        }
    }
}

const mockScene = new MockNode('Scene');
const nodeByUuid = new Map<string, MockNode>();
const nodeByPath = new Map<string, MockNode>();
const removedUuids: string[] = [];

function registerNode(node: MockNode, path: string) {
    nodeByUuid.set(node.uuid, node);
    nodeByPath.set(path, node);
}

jest.mock('cc', () => ({
    director: { getScene: jest.fn(() => mockScene) },
    Node: MockNode,
    Scene: MockNode,
}));

(global as any).cc = require('cc');
(global as any).EditorExtends = {
    Node: {
        getNode: jest.fn((uuid: string) => nodeByUuid.get(uuid) ?? null),
        getNodeByPath: jest.fn((path: string) => nodeByPath.get(path) ?? null),
        getNodePath: jest.fn((node: MockNode) => {
            for (const [path, current] of nodeByPath.entries()) {
                if (current === node) {
                    return path;
                }
            }
            return '';
        }),
        remove: jest.fn((uuid: string) => {
            removedUuids.push(uuid);
            nodeByUuid.delete(uuid);
        }),
    },
    Component: {
        remove: jest.fn(),
    },
};

jest.mock('../../scene-process/service/node/index', () => ({
    __esModule: true,
    default: {
        baseRemoveNode: mockBaseRemoveNode,
    },
}));

jest.mock('../../scene-process/service/node/node-create', () => ({
    createShouldHideInHierarchyCanvasNode: mockCreateShouldHideInHierarchyCanvasNode,
}));

import { PrefabPreviewCanvasCommand } from '../../scene-process/service/undo/commands/prefab-preview-canvas-command';

describe('PrefabPreviewCanvasCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        nodeByUuid.clear();
        nodeByPath.clear();
        removedUuids.length = 0;
        mockScene.children = [];
        mockScene.parent = null;
        registerNode(mockScene, '/');
        mockBaseRemoveNode.mockImplementation((node: MockNode) => node.destroyForTest());
        mockCreateShouldHideInHierarchyCanvasNode.mockImplementation(async (scene: MockNode) => {
            const preview = new MockNode('should_hide_in_hierarchy');
            scene.addChild(preview);
            registerNode(preview, '/should_hide_in_hierarchy');
            return preview;
        });
    });

    it('moves the prefab root back on undo and recreates the preview Canvas on redo', async () => {
        const root = new MockNode('PrefabRoot');
        const preview = new MockNode('should_hide_in_hierarchy');
        const camera = new MockNode('Camera');
        mockScene.addChild(preview);
        preview.addChild(camera);
        preview.addChild(root);
        registerNode(root, '/PrefabRoot');
        registerNode(preview, '/should_hide_in_hierarchy');
        registerNode(camera, '/should_hide_in_hierarchy/Camera');

        const command = new PrefabPreviewCanvasCommand({
            rootUuid: root.uuid,
            rootPath: '/PrefabRoot',
            rootParentUuid: mockScene.uuid,
            rootParentPath: '/',
            rootSiblingIndex: 0,
            previewCanvasUuid: preview.uuid,
            previewCanvasPath: '/should_hide_in_hierarchy',
            removePreviewCanvasOnUndo: true,
            workMode: '2d',
        });

        await expect(command.undo()).resolves.toMatchObject({ success: true });
        expect(root.parent).toBe(mockScene);
        expect(preview.isValid).toBe(false);
        expect(removedUuids).toContain(preview.uuid);

        await expect(command.redo()).resolves.toMatchObject({ success: true });
        expect(root.parent?.name).toBe('should_hide_in_hierarchy');
        expect(root.parent).not.toBe(preview);
        expect(mockCreateShouldHideInHierarchyCanvasNode).toHaveBeenCalledWith(mockScene, '2d');
    });

    it('keeps a pre-existing preview Canvas when undoing the root reparent', async () => {
        const root = new MockNode('PrefabRoot');
        const preview = new MockNode('should_hide_in_hierarchy');
        mockScene.addChild(preview);
        preview.addChild(root);
        registerNode(root, '/PrefabRoot');
        registerNode(preview, '/should_hide_in_hierarchy');

        const command = new PrefabPreviewCanvasCommand({
            rootUuid: root.uuid,
            rootPath: '/PrefabRoot',
            rootParentUuid: mockScene.uuid,
            rootParentPath: '/',
            rootSiblingIndex: 0,
            previewCanvasUuid: preview.uuid,
            previewCanvasPath: '/should_hide_in_hierarchy',
            removePreviewCanvasOnUndo: false,
            workMode: '2d',
        });

        await expect(command.undo()).resolves.toMatchObject({ success: true });
        expect(root.parent).toBe(mockScene);
        expect(preview.isValid).toBe(true);
        expect(mockBaseRemoveNode).not.toHaveBeenCalled();
    });
});
