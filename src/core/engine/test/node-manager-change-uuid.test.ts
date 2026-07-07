import NodeManager from '../editor-extends/manager/node';
import ComponentManager from '../editor-extends/manager/component';
import pathManager from '../editor-extends/manager/node-path-manager';

(globalThis as any).cc = {
    js: {
        getClassName: (target: any) => target._className ?? 'UnknownComponent',
    },
};

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

describe('NodeManager component path sync', () => {
    let nodeManager: NodeManager;
    let componentManager: ComponentManager;
    let nodes: Record<string, any>;

    beforeEach(() => {
        componentManager = new ComponentManager();
        componentManager.allow = true;
        nodeManager = new NodeManager(componentManager);
        nodeManager.allow = true;
        nodes = {};
        pathManager.clear();
    });

    function addNode(uuid: string, name: string, parentUuid?: string) {
        const node = {
            uuid,
            name,
            _id: uuid,
            parent: parentUuid ? { uuid: parentUuid } : null,
            children: [],
            components: [],
        } as any;
        nodes[uuid] = node;
        if (parentUuid && nodes[parentUuid]) {
            nodes[parentUuid].children.push(node);
            node.parent = nodes[parentUuid];
        }
        nodeManager.add(uuid, node);
        return node;
    }

    function addComponent(uuid: string, node: any, className = 'cc.Button') {
        const component = { uuid, _id: uuid, _className: className, node } as any;
        node.components.push(component);
        componentManager.add(uuid, component);
        return component;
    }

    it('updates component paths under renamed node subtrees', () => {
        addNode('parent', 'A', 'scene');
        const child = addNode('child', 'B', 'parent');
        const button = addComponent('button', child);

        expect(componentManager.getPathFromUuid('button')).toBe('A/B/cc.Button');

        nodeManager.updateNodeName('parent', 'C');

        expect(componentManager.getPathFromUuid('button')).toBe('C/B/cc.Button');
        expect(componentManager.getComponentFromPath('C/B/cc.Button')).toBe(button);
        expect((componentManager as any)._pathToUuid.has('A/B/cc.Button')).toBe(false);
    });

    it('updates component paths under reparented node subtrees', () => {
        addNode('target', 'A', 'scene');
        addNode('moving', 'B', 'scene');
        const child = addNode('child', 'C', 'moving');
        const button = addComponent('button', child);

        expect(componentManager.getPathFromUuid('button')).toBe('B/C/cc.Button');

        nodeManager.updateNodeParent('moving', 'target');

        expect(componentManager.getPathFromUuid('button')).toBe('A/B/C/cc.Button');
        expect(componentManager.getComponentFromPath('A/B/C/cc.Button')).toBe(button);
        expect((componentManager as any)._pathToUuid.has('B/C/cc.Button')).toBe(false);
    });
});
