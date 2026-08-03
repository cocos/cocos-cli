import { NodePathManager } from '../editor-extends/manager/node-path-manager';

describe('NodePathManager parent updates', () => {
    let manager: NodePathManager;

    beforeEach(() => {
        manager = new NodePathManager();
    });

    it('updates the moved node and descendant paths when the parent changes', () => {
        expect(manager.generateUniquePath('parent', 'A', 'scene')).toBe('A');
        expect(manager.generateUniquePath('child', 'B', 'scene')).toBe('B');
        expect(manager.generateUniquePath('grandchild', 'C', 'child')).toBe('B/C');

        const movedPath = manager.move('child', 'B', 'parent', 'scene');

        expect(movedPath).toBe('A/B');
        expect(manager.getNodePath('child')).toBe('A/B');
        expect(manager.getNodePath('grandchild')).toBe('A/B/C');
        expect(manager.getNodeUuid('A/B')).toBe('child');
        expect(manager.getNodeUuid('A/B/C')).toBe('grandchild');
        expect(manager.getNodeResult('B').error).toBe('Not found');
    });

    it('frees the old parent name and uniquifies collisions under the new parent', () => {
        expect(manager.generateUniquePath('parent', 'A', 'scene')).toBe('A');
        expect(manager.generateUniquePath('existing', 'B', 'parent')).toBe('A/B');
        expect(manager.generateUniquePath('moving', 'B', 'scene')).toBe('B');

        const movedPath = manager.move('moving', 'B', 'parent', 'scene');

        expect(movedPath).toBe('A/B_001');
        expect(manager.getNodePath('moving')).toBe('A/B_001');
        expect(manager.getNodeUuid('A/B_001')).toBe('moving');
        expect(manager.getNodeResult('B').error).toBe('Not found');

        expect(manager.generateUniquePath('newRootChild', 'B', 'scene')).toBe('B');
    });
});

describe('NodePathManager name updates', () => {
    let manager: NodePathManager;

    beforeEach(() => {
        manager = new NodePathManager();
    });

    it('updates descendant paths when a node is renamed', () => {
        expect(manager.generateUniquePath('parent', 'A', 'scene')).toBe('A');
        expect(manager.generateUniquePath('child', 'B', 'parent')).toBe('A/B');
        expect(manager.generateUniquePath('grandchild', 'D', 'child')).toBe('A/B/D');

        manager.updateUuid('parent', 'C', 'scene');

        expect(manager.getNodePath('parent')).toBe('C');
        expect(manager.getNodePath('child')).toBe('C/B');
        expect(manager.getNodePath('grandchild')).toBe('C/B/D');
        expect(manager.getNodeUuid('C/B')).toBe('child');
        expect(manager.getNodeUuid('C/B/D')).toBe('grandchild');
        expect(manager.getNodeResult('A/B').error).toBe('Not found');
        expect(manager.getNodeResult('A/B/D').error).toBe('Not found');
    });

    it('uniquifies the new name against siblings and keeps descendants attached', () => {
        expect(manager.generateUniquePath('a', 'A', 'scene')).toBe('A');
        expect(manager.generateUniquePath('b', 'B', 'scene')).toBe('B');
        expect(manager.generateUniquePath('bChild', 'C', 'b')).toBe('B/C');

        manager.updateUuid('b', 'A', 'scene');

        expect(manager.getNodePath('b')).toBe('A_001');
        expect(manager.getNodePath('bChild')).toBe('A_001/C');
        expect(manager.getNodeUuid('A_001/C')).toBe('bChild');
        expect(manager.getNodeResult('B').error).toBe('Not found');
        expect(manager.getNodeResult('B/C').error).toBe('Not found');
    });
});

describe('NodePathManager.changeUuid', () => {
    let manager: NodePathManager;

    beforeEach(() => {
        manager = new NodePathManager();
        manager.generateUniquePath('scene', 'Scene', undefined as any);
        manager.generateUniquePath('old-uuid', 'Child', 'scene');
    });

    it('updates all path indexes to the new UUID', () => {
        manager.changeUuid('old-uuid', 'new-uuid');

        expect(manager.getNodePath('new-uuid')).toBe('Child');
        expect(manager.getNodePath('old-uuid')).toBe('');
        expect(manager.getNodeUuid('Child')).toBe('new-uuid');
    });

    it('does not leave stale UUID in case-insensitive index', () => {
        manager.changeUuid('old-uuid', 'new-uuid');

        const result = manager.getNodeResult('child');
        expect(result.uuid).toBe('new-uuid');
        expect(result.error).toBeUndefined();
    });

    it('migrates _nodeNames to the new UUID so new children under the moved node get unique names', () => {
        manager.generateUniquePath('grandchild', 'GC', 'old-uuid');
        manager.changeUuid('old-uuid', 'new-uuid');

        // 验证迁移后在新 UUID 下创建同名子节点会自动去重
        // generateUniquePath 返回完整路径，parent 'new-uuid' 的 path 是 'Child'
        const path = manager.generateUniquePath('grandchild2', 'GC', 'new-uuid');
        expect(path).toBe('Child/GC_001');
    });
});

describe('NodePathManager name/path 解耦', () => {
    let manager: NodePathManager;

    beforeEach(() => {
        manager = new NodePathManager();
    });

    it('重命名为与兄弟同名时，路径段自动去重，兄弟路径不变', () => {
        manager.generateUniquePath('a', 'Enemy', 'scene');
        manager.generateUniquePath('b', 'Soldier', 'scene');

        // b 重命名为 Enemy（与 a 同名）
        manager.updateUuid('b', 'Enemy', 'scene');

        // a 的路径不变
        expect(manager.getNodePath('a')).toBe('Enemy');
        // b 获得去重路径
        expect(manager.getNodePath('b')).toBe('Enemy_001');
        // 两个路径都能正确查到 UUID
        expect(manager.getNodeUuid('Enemy')).toBe('a');
        expect(manager.getNodeUuid('Enemy_001')).toBe('b');
    });

    it('重命名为同名后再次重命名为不冲突名称，路径正确更新', () => {
        manager.generateUniquePath('a', 'Enemy', 'scene');
        manager.generateUniquePath('b', 'Soldier', 'scene');

        // b → Enemy（冲突）
        manager.updateUuid('b', 'Enemy', 'scene');
        expect(manager.getNodePath('b')).toBe('Enemy_001');

        // b → Ally（不冲突）
        manager.updateUuid('b', 'Ally', 'scene');
        expect(manager.getNodePath('b')).toBe('Ally');
        // 旧路径失效
        expect(manager.getNodeResult('Enemy_001').error).toBe('Not found');
        // a 不受影响
        expect(manager.getNodePath('a')).toBe('Enemy');
    });

    it('删除节点后释放路径段，新节点可复用', () => {
        // 注册 scene 节点使 _getParentUuid 能找到父节点
        manager.add('scene', 'Scene');
        manager.generateUniquePath('a', 'Enemy', 'scene');
        manager.generateUniquePath('b', 'Enemy', 'scene'); // → Scene/Enemy_001

        expect(manager.getNodePath('b')).toBe('Scene/Enemy_001');

        // 删除 a，释放 "Enemy" 路径段
        manager.remove('a');
        expect(manager.getNodeResult('Scene/Enemy').error).toBe('Not found');

        // 新节点可以获得 "Enemy" 路径段
        const path = manager.generateUniquePath('c', 'Enemy', 'scene');
        expect(path).toBe('Scene/Enemy');
        // b 的路径不变
        expect(manager.getNodePath('b')).toBe('Scene/Enemy_001');
    });

    it('兄弟增删不影响已有节点路径', () => {
        manager.generateUniquePath('a', 'Item', 'scene');   // Item
        manager.generateUniquePath('b', 'Item', 'scene');   // Item_001
        manager.generateUniquePath('c', 'Item', 'scene');   // Item_002

        const pathA = manager.getNodePath('a');
        const pathB = manager.getNodePath('b');
        const pathC = manager.getNodePath('c');

        // 删除 a
        manager.remove('a');

        // b 和 c 的路径不变
        expect(manager.getNodePath('b')).toBe(pathB);
        expect(manager.getNodePath('c')).toBe(pathC);
    });

    it('移动到同名兄弟所在的父节点，路径自动去重', () => {
        manager.generateUniquePath('parent', 'Parent', 'scene');
        manager.generateUniquePath('existing', 'Child', 'parent');   // Parent/Child
        manager.generateUniquePath('moving', 'Child', 'scene');      // Child

        const movedPath = manager.move('moving', 'Child', 'parent', 'scene');

        // 移入后路径自动去重
        expect(movedPath).toBe('Parent/Child_001');
        // 已有节点路径不变
        expect(manager.getNodePath('existing')).toBe('Parent/Child');
    });

    it('父节点重命名后子树路径全部级联更新', () => {
        manager.generateUniquePath('parent', 'OldParent', 'scene');
        manager.generateUniquePath('child', 'ChildA', 'parent');
        manager.generateUniquePath('grandchild', 'GC', 'child');

        manager.updateUuid('parent', 'NewParent', 'scene');

        expect(manager.getNodePath('parent')).toBe('NewParent');
        expect(manager.getNodePath('child')).toBe('NewParent/ChildA');
        expect(manager.getNodePath('grandchild')).toBe('NewParent/ChildA/GC');
        // 旧路径全部失效
        expect(manager.getNodeResult('OldParent').error).toBe('Not found');
        expect(manager.getNodeResult('OldParent/ChildA').error).toBe('Not found');
        expect(manager.getNodeResult('OldParent/ChildA/GC').error).toBe('Not found');
    });

    it('连续冲突重命名不会导致路径段泄漏', () => {
        manager.generateUniquePath('a', 'X', 'scene');
        manager.generateUniquePath('b', 'Y', 'scene');
        manager.generateUniquePath('c', 'Z', 'scene');

        // b → X（冲突）→ 获得 X_001
        manager.updateUuid('b', 'X', 'scene');
        expect(manager.getNodePath('b')).toBe('X_001');

        // c → X（冲突）→ 获得 X_002
        manager.updateUuid('c', 'X', 'scene');
        expect(manager.getNodePath('c')).toBe('X_002');

        // a 不受影响
        expect(manager.getNodePath('a')).toBe('X');

        // 旧路径全部释放
        expect(manager.getNodeResult('Y').error).toBe('Not found');
        expect(manager.getNodeResult('Z').error).toBe('Not found');
    });

    it('同名父节点下的子节点路径各自独立，不会互相去重', () => {
        // A 下有两个 name="B" 的节点
        manager.generateUniquePath('a', 'A', 'scene');
        manager.generateUniquePath('b1', 'B', 'a');           // A/B
        manager.generateUniquePath('b2', 'B', 'a');           // A/B_001（自动去重）

        // 各自下面创建 name="C" 的子节点
        manager.generateUniquePath('c1', 'C', 'b1');          // A/B/C
        manager.generateUniquePath('c2', 'C', 'b2');          // A/B_001/C

        // 两个 C 的路径段都是 "C"，不需要 _001
        expect(manager.getNodePath('c1')).toBe('A/B/C');
        expect(manager.getNodePath('c2')).toBe('A/B_001/C');

        // 两条路径各自能查到正确 UUID
        expect(manager.getNodeUuid('A/B/C')).toBe('c1');
        expect(manager.getNodeUuid('A/B_001/C')).toBe('c2');

        // b1、b2 路径不变
        expect(manager.getNodePath('b1')).toBe('A/B');
        expect(manager.getNodePath('b2')).toBe('A/B_001');
    });

    it('重命名父节点为同名后，子树路径级联且子节点不互相干扰', () => {
        manager.generateUniquePath('a', 'A', 'scene');
        manager.generateUniquePath('b1', 'B', 'a');
        manager.generateUniquePath('b2', 'X', 'a');
        manager.generateUniquePath('c1', 'C', 'b1');          // A/B/C
        manager.generateUniquePath('c2', 'C', 'b2');          // A/X/C

        // 把 b2 重命名为 "B"（与 b1 同名）
        manager.updateUuid('b2', 'B', 'a');

        // b2 路径段去重
        expect(manager.getNodePath('b2')).toBe('A/B_001');
        // b1 不变
        expect(manager.getNodePath('b1')).toBe('A/B');
        // c2 路径跟着 b2 级联
        expect(manager.getNodePath('c2')).toBe('A/B_001/C');
        // c1 不受影响
        expect(manager.getNodePath('c1')).toBe('A/B/C');

        // 各路径查到正确 UUID
        expect(manager.getNodeUuid('A/B/C')).toBe('c1');
        expect(manager.getNodeUuid('A/B_001/C')).toBe('c2');
    });

    it('含非法字符的节点名经内部清洗后路径自动去重', () => {
        manager.generateUniquePath('a', 'A:B', 'scene');
        manager.generateUniquePath('b', 'A:B', 'scene');

        expect(manager.getNodePath('a')).toBe('A_B');
        expect(manager.getNodePath('b')).toBe('A_B_001');
        expect(manager.getNodeUuid('A_B')).toBe('a');
        expect(manager.getNodeUuid('A_B_001')).toBe('b');
    });
});
