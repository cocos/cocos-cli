import ComponentManager from '../editor-extends/manager/component';

// Minimal mock for cc.js.getClassName used by _generateUniquePath
(globalThis as any).cc = { js: { getClassName: (comp: any) => comp._className ?? 'UnknownComponent' } };

// Mock pathManager.getNodePath used by _generateUniquePath
jest.mock('../editor-extends/manager/node-path-manager', () => ({
    __esModule: true,
    default: { getNodePath: (uuid: string) => `/${uuid}` },
    NodePathManager: class {},
}));

describe('ComponentManager.changeUUID', () => {
    let manager: ComponentManager;

    beforeEach(() => {
        manager = new ComponentManager();
        manager.allow = true;
    });

    function addComponent(uuid: string, nodeUuid: string) {
        const comp = { uuid, _id: uuid, _className: 'TestComp', node: { uuid: nodeUuid } } as any;
        manager.add(uuid, comp);
        return comp;
    }

    it('updates _map to new UUID', () => {
        addComponent('comp-old', 'node-1');

        manager.changeUUID('comp-old', 'comp-new');

        expect(manager.getComponent('comp-new')).toBeTruthy();
        expect(manager.getComponent('comp-old')).toBeNull();
    });

    it('syncs _uuidToPath and _pathToUuid after UUID change', () => {
        addComponent('comp-old', 'node-1');
        const pathBefore = manager.getPathFromUuid('comp-old');
        expect(pathBefore).toBeTruthy();

        manager.changeUUID('comp-old', 'comp-new');

        expect(manager.getPathFromUuid('comp-new')).toBe(pathBefore);
        expect(manager.getPathFromUuid('comp-old')).toBe('');
        expect(manager.getComponentFromPath(pathBefore)).toBe(manager.getComponent('comp-new'));
    });
});
