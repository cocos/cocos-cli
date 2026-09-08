import { mkdtemp, remove } from 'fs-extra';
import { basename, join } from 'path';
import type { IComponent, INode, ISetPropertyOptions } from '../common';
import type { IProperty } from '../@types/public';
import { NodeType } from '../common';
import { Rpc } from '../main-process/rpc';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { TestGlobalEnv } from '../../../tests/global-env';

type Particle = { nodePath: string; path: string; index: number };

describe('particle Reset through real scene RPC', () => {
    let directory: string;
    let sceneUrl: string;

    beforeAll(async () => {
        const { globalSetup } = await import('../../test/global-setup');
        const server = await import('../../../server');
        const { getAvailablePort } = await import('../../../server/utils');
        const port = await getAvailablePort(19527);
        const startServer = server.startServer;
        // Isolate the test server from an editor already listening on localhost.
        const start = jest.spyOn(server, 'startServer').mockImplementationOnce(() => startServer(port, '127.0.0.1'));
        try {
            await globalSetup();
        } finally {
            start.mockRestore();
        }
        directory = await mkdtemp(join(TestGlobalEnv.projectRoot, 'assets/particle-reset-'));
        const { assetManager } = await import('../../assets');
        await assetManager.refreshAsset(directory);
        const { loadSceneI18n } = await import('../index');
        await loadSceneI18n();
        const asset = await EditorProxy.create({
            type: 'scene', baseName: 'reset', targetDirectory: `db://assets/${basename(directory)}`,
        });
        if (!asset) { throw new Error('Failed to create Reset test scene'); }
        sceneUrl = asset.assetUrl;
        await EditorProxy.open({ urlOrUUID: sceneUrl });
    }, 180000);

    afterAll(async () => {
        try {
            if (sceneUrl) { await EditorProxy.close({ save: false }); }
        } finally {
            const { projectManager } = await import('../../project-manager');
            await projectManager.close();
            if (directory) {
                await remove(directory);
                await remove(`${directory}.meta`);
            }
        }
    });

    async function create(name: string, type: string): Promise<Particle> {
        const rpc = Rpc.getInstance();
        expect(await rpc.request('Node', 'createByType', [{ path: '', name, nodeType: NodeType.EMPTY }])).toBeTruthy();
        expect(await rpc.request('Component', 'add', [{ nodePath: name, component: type }])).toBeTruthy();
        const node = await rpc.request('Node', 'query', [{ path: name, includeComponents: true }]) as INode;
        const index = node.__comps__.findIndex(item => item.type === type);
        expect(index).toBeGreaterThanOrEqual(0);
        return { nodePath: name, path: `${name}/${type}`, index };
    }

    async function query(p: Particle): Promise<IComponent> {
        const dump = await Rpc.getInstance().request('Component', 'query', [{ path: p.path }]);
        if (!dump) { throw new Error(`Missing ${p.path}`); }
        const node = await Rpc.getInstance().request('Node', 'query', [{ path: p.nodePath, includeComponents: true }]) as INode;
        const withoutPaths = (value: IComponent) => JSON.parse(JSON.stringify(value, (key, item) => key === 'path' ? undefined : item));
        expect(withoutPaths(node.__comps__[p.index])).toEqual(withoutPaths(dump));
        return dump;
    }

    async function field(p: Particle, path: string): Promise<IProperty> {
        let property: IProperty = await query(p);
        for (const key of path.split('.')) { property = property.value[key]; }
        return property;
    }

    async function write(p: Particle, path: string, value: IProperty['value'], reset = false, record = true): Promise<void> {
        const property = await field(p, path);
        const rpc = Rpc.getInstance() as unknown as {
            request(service: string, method: string, args: [ISetPropertyOptions]): Promise<boolean>;
        };
        expect(await rpc.request(reset ? 'Node' : 'Component', reset ? 'resetProperty' : 'setProperty', [{
            nodePath: p.nodePath, path: `__comps__.${p.index}.${path}`, dump: { ...property, value }, record,
        }])).toBe(true);
    }

    async function history(redo = false): Promise<void> {
        const rpc = Rpc.getInstance();
        const result = redo ? await rpc.request('Redo', 'redo', [{}]) : await rpc.request('Undo', 'undo', [{}]);
        if (!result.success) { throw new Error(JSON.stringify(result)); }
        expect(result).toMatchObject({ success: true });
    }

    async function reload(): Promise<void> {
        await EditorProxy.save({ urlOrUUID: sceneUrl });
        await EditorProxy.close({ save: false });
        await EditorProxy.open({ urlOrUUID: sceneUrl });
    }

    it.each([
        ['Reset3DField', 'cc.ParticleSystem', 'capacity', 37, 100],
        ['Reset2DField', 'cc.ParticleSystem2D', 'life', 2.5, 1],
        ['ResetNestedField', 'cc.ParticleSystem', 'renderer.velocityScale', 3, 1],
    ])('restores defaults and undo history for %s', async (name, type, key, modified, initial) => {
        const p = await create(name, type);
        const other = await create(`${name}Other`, type);
        const identity = (await query(p)).value.uuid.value;
        await write(other, key, modified + 1);
        for (let i = 0; i < 2; i++) {
            await write(p, key, modified);
            await write(p, key, null, true);
            expect((await field(p, key)).value).toBe(initial);
            await history();
            expect((await field(p, key)).value).toBe(modified);
            await history(true);
            expect((await field(p, key)).value).toBe(initial);
            expect((await field(other, key)).value).toBe(modified + 1);
            expect((await query(p)).value.uuid.value).toBe(identity);
        }
        await reload();
        expect((await field(p, key)).value).toBe(initial);
        expect((await field(other, key)).value).toBe(modified + 1);
    });

    it('does not record a no-op Reset or a Reset with record:false', async () => {
        const p = await create('ResetNoRecord', 'cc.ParticleSystem2D');
        await write(p, 'life', 2.5);
        await write(p, 'life', null, true);
        await write(p, 'life', null, true);
        await history();
        expect((await field(p, 'life')).value).toBe(2.5);
        await write(p, 'life', null, true, false);
        await history();
        expect((await field(p, 'life')).value).toBe(1);
    });

});
