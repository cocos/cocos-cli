const mockRemoveComponent = jest.fn();
const mockBaseRemoveNode = jest.fn();

class MockComponent {
    uuid = 'ui-transform-uuid';
    isValid = true;

    constructor(public node: MockNode) {}
}

class MockNode {
    uuid: string;
    parent: MockNode | null = null;
    children: MockNode[] = [];
    components: MockComponent[] = [];
    isValid = true;

    constructor(public name: string) {
        this.uuid = `${name}-uuid`;
    }

    addChild(node: MockNode): void {
        node.setParent(this);
    }

    setParent(parent: MockNode | null): void {
        if (this.parent) {
            this.parent.children = this.parent.children.filter(child => child !== this);
        }
        this.parent = parent;
        if (parent && !parent.children.includes(this)) {
            parent.children.push(this);
        }
    }

    setSiblingIndex(index: number): void {
        if (!this.parent) {
            return;
        }
        this.parent.children = this.parent.children.filter(child => child !== this);
        this.parent.children.splice(index, 0, this);
    }
}

const removedNodeUuids: string[] = [];
const removedComponentUuids: string[] = [];

(global as any).EditorExtends = {
    Node: {
        remove: jest.fn((uuid: string) => removedNodeUuids.push(uuid)),
    },
    Component: {
        remove: jest.fn((uuid: string) => removedComponentUuids.push(uuid)),
    },
};

(global as any).cc = { EditorExtends: (global as any).EditorExtends };

jest.mock('cc', () => ({
    Component: MockComponent,
    Node: MockNode,
}));

jest.mock('../../scene-process/service/node/index', () => ({
    __esModule: true,
    default: { baseRemoveNode: mockBaseRemoveNode },
}));

import {
    createPendingPrefabCanvasMutation,
    type IPrefabCanvasMutationEffects,
    type IPrefabCanvasUndoRecord,
} from '../../scene-process/service/node/prefab-canvas-mutation';

function createEffects(commitRecord = jest.fn()): IPrefabCanvasMutationEffects {
    return {
        commitRecord,
        removeAddedUITransform: mockRemoveComponent,
    };
}

function createMutationFixture(previewCanvasCreated: boolean) {
    const host = new MockNode('Host');
    const before = new MockNode('Before');
    const root = new MockNode('PrefabRoot');
    const after = new MockNode('After');
    const preview = new MockNode('PreviewCanvas');
    host.addChild(before);
    host.addChild(root);
    host.addChild(after);
    const originalIndex = host.children.indexOf(root);
    const uiTransform = new MockComponent(root);
    root.components.push(uiTransform);
    preview.addChild(root);

    const record: IPrefabCanvasUndoRecord = {
        rootNode: root as any,
        rootParent: host as any,
        rootParentUuid: host.uuid,
        rootParentPath: '/Host',
        rootSiblingIndex: originalIndex,
        addedUITransform: uiTransform as any,
        previewCanvasNode: preview as any,
        previewCanvasCreated,
        workMode: '2d',
    };
    return { host, before, root, after, preview, uiTransform, record };
}

describe('Prefab Canvas mutation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        removedNodeUuids.length = 0;
        removedComponentUuids.length = 0;
        mockRemoveComponent.mockImplementation((component: MockComponent) => {
            component.node.components = component.node.components.filter(current => current !== component);
            component.isValid = false;
            return true;
        });
        mockBaseRemoveNode.mockImplementation((node: MockNode) => {
            node.setParent(null);
            node.isValid = false;
        });
    });

    it('restores the Prefab root and removes changes owned by a failed mutation', () => {
        const { host, before, root, after, preview, uiTransform, record } = createMutationFixture(true);
        const commitRecord = jest.fn();
        const mutation = createPendingPrefabCanvasMutation(record, createEffects(commitRecord));

        mutation.rollback();

        expect(root.parent).toBe(host);
        expect(host.children).toEqual([before, root, after]);
        expect(preview.isValid).toBe(false);
        expect(uiTransform.isValid).toBe(false);
        expect(removedNodeUuids).toContain(preview.uuid);
        expect(commitRecord).not.toHaveBeenCalled();
    });

    it('keeps a preview Canvas that existed before the mutation', () => {
        const { host, root, preview, record } = createMutationFixture(false);
        const mutation = createPendingPrefabCanvasMutation(record, createEffects());

        mutation.rollback();

        expect(root.parent).toBe(host);
        expect(preview.isValid).toBe(true);
        expect(mockBaseRemoveNode).not.toHaveBeenCalled();
    });

    it('commits its Undo record exactly once', () => {
        const { record } = createMutationFixture(true);
        const commitRecord = jest.fn();
        const mutation = createPendingPrefabCanvasMutation(record, createEffects(commitRecord));

        mutation.commit();
        mutation.commit();

        expect(commitRecord).toHaveBeenCalledTimes(1);
        expect(commitRecord).toHaveBeenCalledWith(record);
        expect(() => mutation.rollback()).toThrow('committed');
    });

    it('attempts every cleanup step when restoring the root fails', () => {
        const { root, preview, uiTransform, record } = createMutationFixture(true);
        root.setSiblingIndex = jest.fn(() => {
            throw new Error('restore failed');
        });
        const mutation = createPendingPrefabCanvasMutation(record, createEffects());

        expect(() => mutation.rollback()).toThrow(AggregateError);

        expect(preview.isValid).toBe(false);
        expect(uiTransform.isValid).toBe(false);
    });
});
