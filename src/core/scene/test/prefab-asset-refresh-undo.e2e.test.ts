import { mkdtemp, readFile, remove } from 'fs-extra';
import { basename, join } from 'path';
import { NodeType, PrefabState } from '../common';
import { Rpc } from '../main-process/rpc';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { TestGlobalEnv } from '../../../tests/global-env';

describe('prefab asset updates through scene undo and redo', () => {
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
        directory = await mkdtemp(join(TestGlobalEnv.projectRoot, 'assets/prefab-asset-refresh-undo-'));
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

    it('keeps newly saved prefab children when redoing an instance created before the asset update', async () => {
        const rpc = Rpc.getInstance();
        const { assetManager } = await import('../../assets');
        const prefabUrl = `db://assets/${basename(directory)}/Updated.prefab`;
        await rpc.request('Node', 'createByType', [{ path: '/', name: 'Source', nodeType: NodeType.EMPTY }]);
        await rpc.request('Prefab', 'createPrefabFromNode', [{ nodePath: 'Source', dbURL: prefabUrl }]);
        await rpc.request('Undo', 'clearHistory', []);
        await rpc.request('Node', 'createByAsset', [{ path: '/', name: 'Instance', dbURL: prefabUrl }]);

        // Save the same node data produced by adding a child in the prefab editor.
        const graph = JSON.parse(await readFile(join(directory, 'Updated.prefab'), 'utf8'));
        const rootIndex = graph[0].data.__id__;
        const root = graph[rootIndex];
        const childIndex = graph.length;
        graph.push({
            ...root, _name: 'SavedChild', _children: [], _components: [],
            _parent: { __id__: rootIndex }, _prefab: { __id__: childIndex + 1 }, _id: 'saved-child',
        });
        graph.push({
            ...graph[root._prefab.__id__], root: { __id__: rootIndex }, fileId: 'saved-child',
        });
        root._children.push({ __id__: childIndex });
        await assetManager.saveAsset(prefabUrl, JSON.stringify(graph));

        let synced = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await rpc.request('Node', 'queryNodeTree', [{ path: 'Instance/SavedChild' }])) {
                synced = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        expect(synced).toBe(true);
        expect(await rpc.request('Undo', 'canUndo', [])).toBe(true);
        expect((await rpc.request('Undo', 'undo', [])).success).toBe(true);
        expect(await rpc.request('Node', 'queryNodeTree', [{ path: 'Instance' }])).toBeNull();
        expect((await rpc.request('Redo', 'redo', [])).success).toBe(true);
        const child = await rpc.request('Node', 'queryNodeTree', [{ path: 'Instance/SavedChild' }]);
        expect(child).not.toBeNull();
        expect(child?.prefab.state).toBe(PrefabState.PrefabChild);
        expect(child?.prefab.isAddedChild).toBe(false);

        const beforeResave = await rpc.request('Node', 'queryNodeTree', [{ path: '/' }]);
        for (let cycle = 0; cycle < 4; cycle++) {
            expect((await rpc.request('Undo', 'undo', [])).success).toBe(true);
            expect((await rpc.request('Redo', 'redo', [])).success).toBe(true);
        }
        graph[childIndex]._name = 'ResavedChild';
        await assetManager.saveAsset(prefabUrl, JSON.stringify(graph));
        let resynced = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await rpc.request('Node', 'queryNodeTree', [{ path: 'Instance/ResavedChild' }])) {
                resynced = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        expect(resynced).toBe(true);
        const afterResave = await rpc.request('Node', 'queryNodeTree', [{ path: '/' }]);
        expect(afterResave?.children.map(node => node.name)).toEqual(beforeResave?.children.map(node => node.name));
        const instance = await rpc.request('Node', 'queryNodeTree', [{ path: 'Instance' }]);
        expect(instance?.children.map(node => node.name)).toEqual(['ResavedChild']);

        await EditorProxy.save({});
        const prefab = await EditorProxy.open({ urlOrUUID: prefabUrl });
        expect(prefab).toBeTruthy();
        const prefabPath = prefab!.name;
        await rpc.request('Node', 'createByType', [{ path: prefabPath, name: 'EditedChild', nodeType: NodeType.EMPTY }]);
        await EditorProxy.save({});
        for (let cycle = 0; cycle < 4; cycle++) {
            expect((await rpc.request('Undo', 'undo', [])).success).toBe(true);
            expect((await rpc.request('Redo', 'redo', [])).success).toBe(true);
        }
        await EditorProxy.save({});
        const savedGraph = JSON.parse(await readFile(join(directory, 'Updated.prefab'), 'utf8'));
        expect(savedGraph.filter((item: any) => item.__type__ === 'cc.Node').map((item: any) => item._name).sort())
            .toEqual([prefabPath, 'ResavedChild', 'EditedChild'].sort());
        await EditorProxy.open({ urlOrUUID: sceneUrl });
        const finalTree = await rpc.request('Node', 'queryNodeTree', [{ path: '/' }]);
        expect(finalTree?.children.map(node => node.name)).toEqual(beforeResave?.children.map(node => node.name));
        const updatedInstance = await rpc.request('Node', 'queryNodeTree', [{ path: 'Instance' }]);
        expect(updatedInstance?.children.map(node => node.name)).toEqual(['ResavedChild', 'EditedChild']);
    });

});
