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

    it('migrates _nodeNames to the new UUID', () => {
        manager.generateUniquePath('grandchild', 'GC', 'old-uuid');
        manager.changeUuid('old-uuid', 'new-uuid');

        expect(manager.getNameSet('new-uuid')).toBeTruthy();
        expect(manager.getNameSet('old-uuid')).toBeNull();
    });
});
