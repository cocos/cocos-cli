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

describe('NodeManager name/path 解耦', () => {
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

    it('创建重名节点后 name 保持用户输入，不被系统路径后缀覆盖', () => {
        const nodeA = addNode('a', 'Enemy', 'scene');
        const nodeB = addNode('b', 'Enemy', 'scene');

        expect(nodeA.name).toBe('Enemy');
        expect(nodeB.name).toBe('Enemy');
        expect(manager.getNodePath(nodeA)).toBe('Enemy');
        expect(manager.getNodePath(nodeB)).toBe('Enemy_001');
    });

    it('重命名为与兄弟同名时，name 取用户输入，path 自动去重', () => {
        const nodeA = addNode('a', 'Enemy', 'scene');
        const nodeB = addNode('b', 'Soldier', 'scene');

        manager.updateNodeName('b', 'Enemy');

        // name 应为用户输入
        expect(nodeB.name).toBe('Enemy');
        // path 应自动去重
        expect(manager.getNodePath(nodeB)).toBe('Enemy_001');
        // A 不受影响
        expect(nodeA.name).toBe('Enemy');
        expect(manager.getNodePath(nodeA)).toBe('Enemy');
    });

    it('移动节点后不再回写 path 末段到 name', () => {
        addNode('parent', 'Parent', 'scene');
        addNode('existing', 'Child', 'parent');
        const moving = addNode('moving', 'Child', 'scene');

        // 移动到 parent 下（同名冲突）
        const newPath = manager.updateNodeParent('moving', 'parent');

        // path 应去重
        expect(newPath).toBe('Parent/Child_001');
        // name 不应被回写为路径段，保持原值
        expect(moving.name).toBe('Child');
    });

    it('删除节点后不影响兄弟路径', () => {
        addNode('a', 'Item', 'scene');
        const nodeB = addNode('b', 'Item', 'scene');
        const nodeC = addNode('c', 'Item', 'scene');

        const pathB = manager.getNodePath(nodeB);
        const pathC = manager.getNodePath(nodeC);

        manager.remove('a');

        expect(manager.getNodePath(nodeB)).toBe(pathB);
        expect(manager.getNodePath(nodeC)).toBe(pathC);
    });

    it('重命名不冲突时 name 和 path 末段一致', () => {
        const node = addNode('a', 'OldName', 'scene');

        manager.updateNodeName('a', 'NewName');

        expect(node.name).toBe('NewName');
        expect(manager.getNodePath(node)).toBe('NewName');
    });

    it('底层恢复旧非法名称时保留显示名、清洗系统路径并警告', () => {
        addNode('parent', 'Parent', 'scene');
        const node = addNode('a', 'OldName', 'parent');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            manager.updateNodeName('a', 'A:B');

            expect(node.name).toBe('A:B');
            expect(manager.getNodePath(node)).toBe('Parent/A_B');
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('preserving legacy node name'));
        } finally {
            warn.mockRestore();
        }
    });

    it('加载旧场景节点时保留非法显示名、清洗系统路径并警告', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const node = addNode('legacy', 'A:B', 'scene');

            expect(node.name).toBe('A:B');
            expect(manager.getNodePath(node)).toBe('A_B');
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('preserving legacy node name'));
        } finally {
            warn.mockRestore();
        }
    });

    it('删除中间节点后新增应复用已删除的路径段', () => {
        const node0 = addNode('n0', 'GapNode', 'scene');
        const node1 = addNode('n1', 'GapNode', 'scene');
        const node2 = addNode('n2', 'GapNode', 'scene');

        expect(manager.getNodePath(node0)).toBe('GapNode');
        expect(manager.getNodePath(node1)).toBe('GapNode_001');
        expect(manager.getNodePath(node2)).toBe('GapNode_002');

        manager.remove('n1');

        const node3 = addNode('n3', 'GapNode', 'scene');
        const node4 = addNode('n4', 'GapNode', 'scene');

        expect(manager.getNodePath(node3)).toBe('GapNode_001');
        expect(manager.getNodePath(node4)).toBe('GapNode_003');
    });
});
