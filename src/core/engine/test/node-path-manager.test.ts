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
