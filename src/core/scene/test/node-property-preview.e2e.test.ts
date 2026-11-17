import { mkdtemp, remove } from 'fs-extra';
import { basename, join } from 'path';
import { NodeType } from '../common';
import { Rpc } from '../main-process/rpc';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { TestGlobalEnv } from '../../../tests/global-env';

describe('UUID property previews through scene RPC', () => {
    let directory: string;
    let sceneUrl: string;
    let rpc: any;
    const call = (method: string, options: unknown) => rpc.request('Node', method, [options]);
    const pathOf = (uuid: string): Promise<string> => call('getPathByUuid', uuid);
    const create = async (name: string, parent = '/') => {
        const node = await call('createByType', { path: parent, name, nodeType: NodeType.EMPTY });
        return { uuid: node.uuid.value as string, path: node.path as string };
    };
    const preview = (uuid: string, value: string, previewId: string) => call('previewSetProperty', {
        uuid, path: 'name', previewId, dump: { type: 'String', value },
    });
    beforeAll(async () => {
        const { globalSetup } = await import('../../test/global-setup');
        const server = await import('../../../server');
        const { getAvailablePort } = await import('../../../server/utils');
        const port = await getAvailablePort(19547);
        const startServer = server.startServer;
        const start = jest.spyOn(server, 'startServer').mockImplementationOnce(() => startServer(port, '127.0.0.1'));
        try { await globalSetup(); } finally { start.mockRestore(); }
        directory = await mkdtemp(join(TestGlobalEnv.projectRoot, 'assets/property-preview-'));
        const { assetManager } = await import('../../assets');
        await assetManager.refreshAsset(directory);
        const { loadSceneI18n } = await import('../index');
        await loadSceneI18n();
        const asset = await EditorProxy.create({ type: 'scene', baseName: 'preview', targetDirectory: 'db://assets/' + basename(directory) });
        if (!asset) throw new Error('Failed to create scene');
        sceneUrl = asset.assetUrl;
        rpc = Rpc.getInstance();
    }, 180000);
    beforeEach(async () => { await EditorProxy.open({ urlOrUUID: sceneUrl }); });
    afterAll(async () => {
        try { if (sceneUrl) await EditorProxy.close({ save: false }); }
        finally {
            const { projectManager } = await import('../../project-manager');
            await projectManager.close();
            if (directory) { await remove(directory); await remove(directory + '.meta'); }
        }
    });
    it('resolves duplicate names and descendants, then cancels after the parent is renamed', async () => {
        const parent = await create('Parent');
        const sibling = await create('Taken', parent.path);
        const node = await create('Original', parent.path);
        const child = await create('Leaf', node.path);
        const result = await preview(node.uuid, 'Taken', 'duplicate');
        expect(result.success).toBe(true);
        expect(result.previousPath).toBe(node.path);
        expect(result.path).not.toBe(sibling.path);
        expect(result.path).toBe(await pathOf(node.uuid));
        expect((await pathOf(child.uuid)).startsWith(result.path + '/')).toBe(true);
        await call('setProperty', { nodePath: parent.path, path: 'name', dump: { type: 'String', value: 'RenamedParent' } });
        const cancelled = await call('cancelPreviewSetProperty', { uuid: node.uuid, path: 'name', previewId: 'duplicate' });
        expect(cancelled.success).toBe(true);
        expect(cancelled.path).toBe((await pathOf(parent.uuid)) + '/Original');
        expect(await pathOf(child.uuid)).toBe(cancelled.path + '/Leaf');
    });
    it('commits multiple previews as one Undo entry restoring the original name and supports a second edit', async () => {
        const node = await create('Original');
        await rpc.request('Undo', 'clearHistory', []);
        await preview(node.uuid, 'First', 'commit');
        await preview(node.uuid, 'Final', 'commit');
        const committed = await call('commitPreviewSetProperty', { uuid: node.uuid, path: 'name', previewId: 'commit' });
        expect(committed.success).toBe(true);
        expect(committed.path).toBe(await pathOf(node.uuid));
        expect((await rpc.request('Undo', 'undo', [])).success).toBe(true);
        expect(await pathOf(node.uuid)).toBe(node.path);
        expect((await rpc.request('Redo', 'redo', [])).success).toBe(true);
        expect(await pathOf(node.uuid)).toBe(committed.path);
        await preview(node.uuid, 'Next', 'second-edit');
        const cancelled = await call('cancelPreviewSetProperty', { uuid: node.uuid, path: 'name', previewId: 'second-edit' });
        expect(cancelled.path).toBe(committed.path);
        await expect(call('cancelPreviewSetProperty', { uuid: node.uuid, path: 'name', previewId: 'commit' })).rejects.toThrow('PREVIEW_FINISHED');
    });
    it.each(['', '   '])('rejects blank names %p without changing paths', async name => {
        const node = await create('Original');
        await expect(preview(node.uuid, name, 'invalid')).rejects.toThrow('INVALID_NODE_NAME');
        expect(await pathOf(node.uuid)).toBe(node.path);
        await expect(call('setProperty', { nodePath: node.path, path: 'name', dump: { type: 'String', value: name } })).rejects.toThrow('Node name must not be empty');
    });
    it('returns an empty real path when a previewed node was deleted', async () => {
        const node = await create('Original');
        await preview(node.uuid, 'Draft', 'deleted');
        await call('delete', { path: await pathOf(node.uuid) });
        const result = await call('cancelPreviewSetProperty', { uuid: node.uuid, path: 'name', previewId: 'deleted' });
        expect(result.success).toBe(false);
        expect(result.path).toBe('');
    });
});
