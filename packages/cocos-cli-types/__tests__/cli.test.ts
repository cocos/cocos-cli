import type { ICLI, IServiceManager, GlobalEventManager } from '../cli';

describe('cocos-cli-types: cli', () => {
    it('should export ICLI interface with Scene and SceneEvents', () => {
        const cli: Partial<ICLI> = {};
        expect(cli).toBeDefined();
    });

    it('ICLI.Scene should have all 13 service modules', () => {
        const scene: Partial<IServiceManager> = {};

        const serviceKeys: (keyof IServiceManager)[] = [
            'Editor', 'Node', 'Component', 'Script',
            'Asset', 'Engine', 'Prefab', 'Selection',
            'Operation', 'Undo', 'Camera', 'Gizmo', 'SceneView',
        ];

        for (const key of serviceKeys) {
            expect(key).toBeDefined();
        }
        expect(serviceKeys).toHaveLength(13);
        expect(scene).toBeDefined();
    });

    it('IServiceManager.Editor should have core methods', () => {
        type EditorKeys = keyof IServiceManager['Editor'];
        const editorMethods: EditorKeys[] = ['open', 'close', 'save', 'reload', 'create', 'queryCurrent', 'hasOpen'];
        expect(editorMethods.length).toBeGreaterThan(0);
    });

    it('IServiceManager.Node should have CRUD methods', () => {
        type NodeKeys = keyof IServiceManager['Node'];
        const nodeMethods: NodeKeys[] = ['createNodeByType', 'createNodeByAsset', 'deleteNode', 'updateNode', 'queryNode', 'queryNodeTree'];
        expect(nodeMethods.length).toBeGreaterThan(0);
    });

    it('IServiceManager.Component should have component methods', () => {
        type CompKeys = keyof IServiceManager['Component'];
        const compMethods: CompKeys[] = ['addComponent', 'removeComponent', 'setProperty', 'queryComponent', 'queryAllComponent'];
        expect(compMethods.length).toBeGreaterThan(0);
    });

    it('GlobalEventManager should have event methods', () => {
        type EventKeys = keyof GlobalEventManager;
        const eventMethods: EventKeys[] = ['on', 'once', 'off', 'emit', 'broadcast', 'clear'];
        expect(eventMethods).toHaveLength(6);
    });

    it('ICLI should compose Scene and SceneEvents correctly', () => {
        type SceneType = ICLI['Scene'];
        type EventsType = ICLI['SceneEvents'];

        const hasEditor: keyof SceneType = 'Editor';
        const hasOn: keyof EventsType = 'on';

        expect(hasEditor).toBe('Editor');
        expect(hasOn).toBe('on');
    });
});
