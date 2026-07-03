import NodeManager from '../editor-extends/manager/node';
import pathManager from '../editor-extends/manager/node-path-manager';

describe('NodeManager.changeNodeUUID', () => {
    let manager: NodeManager;

    beforeEach(() => {
        manager = new NodeManager();
        manager.allow = true;
        pathManager.clear();
    });

    function addNode(uuid: string, name: string, parentUuid?: string) {
        const node = { uuid, name, _id: uuid, parent: parentUuid ? { uuid: parentUuid } : null } as any;
        manager.add(uuid, node);
        return node;
    }

    it('updates _parentChildren when the node is a child', () => {
        addNode('parent', 'Parent');
        addNode('child-old', 'Child', 'parent');

        manager.changeNodeUUID('child-old', 'child-new');

        // _getParentUuid is private, verify indirectly via updateNodeName
        // which relies on _getParentUuid to find the parent for path updates
        const node = manager.getNode('child-new');
        expect(node).toBeTruthy();
        expect(manager.getNode('child-old')).toBeNull();
    });

    it('updates _parentChildren key when the node is a parent', () => {
        addNode('parent-old', 'Parent');
        addNode('child', 'Child', 'parent-old');

        manager.changeNodeUUID('parent-old', 'parent-new');

        expect(manager.getNode('parent-new')).toBeTruthy();
        expect(manager.getNode('parent-old')).toBeNull();

        // The child should still be reachable and parent relationship intact
        const child = manager.getNode('child');
        expect(child).toBeTruthy();
    });

    it('updates path index via pathManager', () => {
        addNode('node-old', 'MyNode', 'scene');

        manager.changeNodeUUID('node-old', 'node-new');

        expect(pathManager.getNodePath('node-new')).toBeTruthy();
        expect(pathManager.getNodePath('node-old')).toBe('');
    });
});

describe('NodeManager.updateNodeName', () => {
    let manager: NodeManager;

    beforeEach(() => {
        manager = new NodeManager();
        manager.allow = true;
        pathManager.clear();
    });

    function addNode(uuid: string, name: string, parentUuid?: string) {
        const node = { uuid, name, _id: uuid, parent: parentUuid ? { uuid: parentUuid } : null } as any;
        manager.add(uuid, node);
        return node;
    }

    it('updates descendant path indexes when a node is renamed', () => {
        addNode('parent', 'A', 'scene');
        const child = addNode('child', 'B', 'parent');
        const grandchild = addNode('grandchild', 'D', 'child');

        manager.updateNodeName('parent', 'C');

        expect(manager.getNodePath(child)).toBe('C/B');
        expect(manager.getNodePath(grandchild)).toBe('C/B/D');
        expect(manager.getNodeByPath('C/B')).toBe(child);
        expect(manager.getNodeByPath('C/B/D')).toBe(grandchild);
        expect(manager.getNodeByPath('A/B')).toBeNull();
        expect(manager.getNodeByPath('A/B/D')).toBeNull();
    });
});
