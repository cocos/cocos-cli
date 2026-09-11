import type { Node } from 'cc';
import type { SerializedNodeData } from '../common';

class TestNode {
    name = 'Node';
    uuid: string;
    parent: TestNode | null = null;
    children: TestNode[] = [];
    _prefab: { instance: { mountedChildren: string[] } } | null = null;
    destroy = jest.fn();
    setWorldPosition = jest.fn();
    setWorldRotation = jest.fn();
    setWorldScale = jest.fn();

    constructor(uuid = 'node') { this.uuid = uuid; }

    setParent(parent: TestNode | null): void {
        if (this.parent) {
            this.parent.children.splice(this.parent.children.indexOf(this), 1);
        }
        this.parent = parent;
        parent?.children.push(this);
    }

    setSiblingIndex(index: number): void {
        const children = this.parent!.children;
        children.splice(children.indexOf(this), 1);
        children.splice(index, 0, this);
    }
}

const mockEmit = jest.fn();
const mockDispose = jest.fn((nodes: TestNode[]) => nodes.forEach(node => node.destroy()));
const mockRemove = jest.fn((node: TestNode) => node.setParent(null));

jest.mock('cc', () => ({
    Node: TestNode,
    Asset: class Asset {},
    Component: class Component {},
    Quat: class Quat {},
    Vec3: class Vec3 {},
}));
jest.mock('../scene-process/service/node/index', () => ({
    __esModule: true,
    default: {
        emit: mockEmit,
        generateAvailableName: (name: string) => name,
        baseRemoveNode: mockRemove,
    },
}));
jest.mock('../scene-process/service/node/serialized-node-data', () => ({
    disposeSerializedNodes: mockDispose,
    visitSerializedComponentReferences: jest.fn(),
}));
jest.mock('../scene-process/service/prefab/node', () => ({
    nodeOperation: { checkToAddTargetOverride: jest.fn() },
}));

import { mountSerializedNodes } from '../scene-process/service/node/serialized-node-mount';

describe('Serialized node batch mounting', () => {
    const data: SerializedNodeData = {
        version: 1,
        serialized: '{}',
        rootTransforms: [],
        externalReferences: [],
    };

    beforeEach(() => {
        mockEmit.mockReset();
        mockRemove.mockReset();
        mockRemove.mockImplementation((node: TestNode) => node.setParent(null));
        mockDispose.mockClear();
    });

    it('rolls back the entire batch and parent prefab metadata when adding the second node fails', () => {
        const parent = new TestNode('parent');
        parent._prefab = { instance: { mountedChildren: ['existing'] } };
        const existing = new TestNode('existing');
        existing.setParent(parent);
        const nodes = [new TestNode('first'), new TestNode('second')];
        const complete = jest.fn();
        mockEmit.mockImplementation((event: string, node: TestNode) => {
            if (event === 'node:add') {
                parent._prefab!.instance.mountedChildren.push(node.uuid);
                if (node === nodes[1]) {
                    throw new Error('injected second-node failure');
                }
            }
        });

        expect(() => mountSerializedNodes({
            nodes: nodes as unknown as Node[],
            parent: parent as unknown as Node,
            editorRoot: parent as unknown as Node,
            siblingIndex: 0,
            data,
            keepWorldTransform: false,
            onMounted: complete,
        })).toThrow('injected second-node failure');
        expect({
            children: parent.children.map(node => node.uuid),
            mountedChildren: parent._prefab.instance.mountedChildren,
            completed: complete.mock.calls.length,
            detached: nodes.every(node => node.parent === null),
        }).toEqual({ children: ['existing'], mountedChildren: ['existing'], completed: 0, detached: true });
        expect(mockDispose).toHaveBeenCalledWith(nodes);
    });

    it('rolls back if the Undo snapshot cannot be captured', () => {
        const parent = new TestNode('parent');
        const nodes = [new TestNode('first'), new TestNode('second')];
        expect(() => mountSerializedNodes({
            nodes: nodes as unknown as Node[],
            parent: parent as unknown as Node,
            editorRoot: parent as unknown as Node,
            siblingIndex: 0,
            data,
            keepWorldTransform: false,
            onMounted: () => {
                throw new Error('snapshot failure');
            },
        })).toThrow('snapshot failure');
        expect(parent.children).toEqual([]);
        expect(nodes.every(node => node.parent === null)).toBe(true);
    });

    it('continues cleaning the remaining roots when a removal listener throws', () => {
        const parent = new TestNode('parent');
        const nodes = [new TestNode('first'), new TestNode('second')];
        mockEmit.mockImplementation((event: string, node: TestNode) => {
            if (event === 'node:before-remove' && node === nodes[1]) {
                throw new Error('remove listener failure');
            }
        });
        expect(() => mountSerializedNodes({
            nodes: nodes as unknown as Node[],
            parent: parent as unknown as Node,
            editorRoot: parent as unknown as Node,
            siblingIndex: 0,
            data,
            keepWorldTransform: false,
            onMounted: () => {
                throw new Error('snapshot failure');
            },
        })).toThrow('failed during rollback');
        expect(parent.children).toEqual([]);
        expect(mockEmit.mock.calls.filter(([event]) => event === 'node:before-remove')).toHaveLength(2);
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('inserts a contiguous ordered batch and completes only after every root is attached', () => {
        const parent = new TestNode('parent');
        new TestNode('existing').setParent(parent);
        const nodes = [new TestNode('first'), new TestNode('second')];
        const complete = jest.fn(() => {
            expect(parent.children.map(node => node.uuid)).toEqual(['first', 'second', 'existing']);
        });
        mountSerializedNodes({
            nodes: nodes as unknown as Node[],
            parent: parent as unknown as Node,
            editorRoot: parent as unknown as Node,
            siblingIndex: 0,
            data,
            keepWorldTransform: false,
            onMounted: complete,
        });
        expect(complete).toHaveBeenCalledTimes(1);
        expect(mockDispose).not.toHaveBeenCalled();
    });
});
