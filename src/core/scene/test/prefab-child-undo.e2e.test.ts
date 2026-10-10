import { mkdtemp, remove } from 'fs-extra';
import { basename, join } from 'path';
import { NodeType, PrefabState } from '../common';
import { Rpc } from '../main-process/rpc';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { TestGlobalEnv } from '../../../tests/global-env';

describe('plain children of prefab instances through scene RPC', () => {
    let directory: string;
    let sceneUrl: string;

    beforeAll(async () => {
        const { globalSetup } = await import('../../test/global-setup');
        const server = await import('../../../server');
        const { getAvailablePort } = await import('../../../server/utils');
        const port = await getAvailablePort(19537);
        const startServer = server.startServer;
        const start = jest.spyOn(server, 'startServer').mockImplementationOnce(() => startServer(port, '127.0.0.1'));
        try {
            await globalSetup();
        } finally {
            start.mockRestore();
        }
        directory = await mkdtemp(join(TestGlobalEnv.projectRoot, 'assets/prefab-child-undo-'));
        const { assetManager } = await import('../../assets');
        await assetManager.refreshAsset(directory);
        const { loadSceneI18n } = await import('../index');
        await loadSceneI18n();
        const asset = await EditorProxy.create({
            type: 'scene', baseName: 'undo', targetDirectory: `db://assets/${basename(directory)}`,
        });
        if (!asset) throw new Error('Failed to create test scene');
        sceneUrl = asset.assetUrl;
        await EditorProxy.open({ urlOrUUID: sceneUrl });
    }, 180000);

    afterAll(async () => {
        try {
            if (sceneUrl) await EditorProxy.close({ save: false });
        } finally {
            const { projectManager } = await import('../../project-manager');
            await projectManager.close();
            if (directory) {
                await remove(directory);
                await remove(`${directory}.meta`);
            }
        }
    });

    it.each([NodeType.EMPTY, NodeType.BUTTON])('preserves added children when undoing and redoing Prefab Revert: %s', async nodeType => {
        await EditorProxy.open({ urlOrUUID: sceneUrl });
        const rpc = Rpc.getInstance();
        const name = `Prefab${nodeType}`;
        const root = await rpc.request('Node', 'createByType', [{ path: '/', name, nodeType: NodeType.EMPTY }]);
        expect(root).toBeTruthy();
        await rpc.request('Component', 'add', [{ nodePath: name, component: 'cc.Canvas' }]);
        await rpc.request('Prefab', 'createPrefabFromNode', [{
            nodePath: name, dbURL: `db://assets/${basename(directory)}/${name}.prefab`, overwrite: true,
        }]);
        await rpc.request('Undo', 'clearHistory', []);
        const child = await rpc.request('Node', 'createByType', [{ path: name, name: 'Added', nodeType }]);
        expect(child).toBeTruthy();
        const path = `${name}/Added`;
        const before = await rpc.request('Node', 'queryNodeTree', [{ path }]);
        expect(before).toBeTruthy();
        expect(before?.prefab.state).toBe(PrefabState.NotAPrefab);
        expect(before?.prefab.isAddedChild).toBe(true);
        expect(await rpc.request('Prefab', 'revertToPrefab', [{ nodePath: name }])).toBe(true);
        expect(await rpc.request('Node', 'queryNodeTree', [{ path }])).toBeNull();
        for (let cycle = 0; cycle < 2; cycle++) {
            expect((await rpc.request('Undo', 'undo', [])).success).toBe(true);
            const after = await rpc.request('Node', 'queryNodeTree', [{ path }]);
            expect(after?.prefab).toEqual(before?.prefab);
            expect((await rpc.request('Undo', 'undo', [])).success).toBe(true);
            expect(await rpc.request('Node', 'queryNodeTree', [{ path }])).toBeNull();
            expect((await rpc.request('Redo', 'redo', [])).success).toBe(true);
            expect((await rpc.request('Node', 'queryNodeTree', [{ path }]))?.prefab).toEqual(before?.prefab);
            expect((await rpc.request('Redo', 'redo', [])).success).toBe(true);
            expect(await rpc.request('Node', 'queryNodeTree', [{ path }])).toBeNull();
        }
    });
});
