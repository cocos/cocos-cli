import { SceneSessionCoordinator } from '../src/core/scene/session/coordinator';
import { createSceneSessionServer, type SceneSessionServer } from '../src/core/scene/session/server';
import { SceneSessionClient } from '../src/core/scene/session/client';
import type { ISceneCommandProvider } from '../src/core/scene/main-process/scene-command-provider';

function backend() {
    let name = 'saved';
    let saved = name;
    const history: string[] = [];
    const redo: string[] = [];
    const request = jest.fn(async (module: string, method: string, args: any[] = []) => {
        if (module === 'Editor' && method === 'queryCurrent') return { name };
        if (module === 'Editor' && method === 'queryRenderSnapshot') return { serializedScene: JSON.stringify({ name }) };
        if (module === 'Node' && method === 'setProperty') { history.push(name); name = args[0]; redo.length = 0; return true; }
        if (method === 'save') { saved = name; return true; }
        if (method === 'isDirty') return name !== saved;
        if (method === 'canUndo') return history.length > 0;
        if (method === 'canRedo') return redo.length > 0;
        if (method === 'undo') { redo.push(name); name = history.pop()!; return { success: true }; }
        if (method === 'redo') { history.push(name); name = redo.pop()!; return { success: true }; }
        throw new Error(`Unknown method ${module}.${method}`);
    });
    return { request } satisfies ISceneCommandProvider;
}

describe('shared scene ownership', () => {
    let server: SceneSessionServer | undefined;
    afterEach(async () => { await server?.close(); server = undefined; });

    it('shares unsaved changes, dirty/save and one undo history across two remote clients and local MCP dispatch', async () => {
        const provider = backend();
        const owner = new SceneSessionCoordinator(() => provider);
        server = await createSceneSessionServer(owner, { project: 'project-A' });
        const a = new SceneSessionClient(server.descriptor);
        const b = new SceneSessionClient(server.descriptor);
        const before = await a.snapshot();
        const command = { module: 'Node', method: 'setProperty', args: ['editor edit'], source: 'editor', operationId: '1', expected: before.version };
        const first = await a.command(command);
        expect(await a.command(command)).toEqual(first);
        expect(provider.request.mock.calls.filter(call => call[1] === 'setProperty')).toHaveLength(1);
        expect(await b.snapshot()).toMatchObject({ current: { name: 'editor edit' }, dirty: true, canUndo: true });
        await owner.request('Node', 'setProperty', ['MCP edit']);
        await expect(a.command({ ...command, operationId: '2' })).rejects.toMatchObject({ code: 'CONFLICT' });
        const current = await b.snapshot();
        await b.command({ module: 'Undo', method: 'undo', source: 'editor', operationId: '3', expected: current.version });
        expect(await a.snapshot()).toMatchObject({ current: { name: 'editor edit' }, dirty: true, canRedo: true });
        await owner.request('Editor', 'save', []);
        expect(await a.snapshot()).toMatchObject({ current: { name: 'editor edit' }, dirty: false });
        const events = await b.events(before.version, before.sequence);
        expect(events.events[0]).toMatchObject({ source: 'editor', operationId: '1' });
    });

    it('rejects unauthenticated callers and prototype/internal methods', async () => {
        const owner = new SceneSessionCoordinator(() => backend());
        server = await createSceneSessionServer(owner, { project: 'project-A' });
        expect((await fetch(`${server.descriptor.url}/snapshot`)).status).toBe(401);
        const client = new SceneSessionClient(server.descriptor);
        for (const [module, method] of [['__proto__', 'toString'], ['Editor', 'constructor'], ['Editor', 'queryRenderSnapshot']]) {
            await expect(client.command({ module, method, source: 'x', operationId: '1', expected: owner.version }))
                .rejects.toMatchObject({ code: 'METHOD_NOT_ALLOWED' });
        }
    });

    it('serializes writes, survives failures and does not block bake cancellation', async () => {
        let release!: () => void;
        const calls: string[] = [];
        const provider = { request: jest.fn(async (_module: string, method: string) => {
            calls.push(method);
            if (method === 'bake') await new Promise<void>(resolve => { release = resolve; });
            if (method === 'fail') throw new Error('partially mutated');
        }) };
        const owner = new SceneSessionCoordinator(() => provider);
        const bake = owner.request('LightmapBake', 'bake', []);
        await Promise.resolve();
        const write = owner.request('Node', 'setProperty', []);
        await owner.request('LightmapBake', 'cancel', []);
        expect(calls).toEqual(['bake', 'cancel']);
        release();
        await Promise.all([bake, write]);
        await expect(owner.request('Node', 'fail', [])).rejects.toThrow('partially mutated');
        await owner.request('Editor', 'queryCurrent', []);
        expect(owner.version.revision).toBe(3);
    });

    it('resynchronizes after worker replacement or an event log gap and rejects queued stale operations', async () => {
        const provider = backend();
        const owner = new SceneSessionCoordinator(() => provider);
        const previous = owner.version;
        const queued = owner.command({ module: 'Node', method: 'setProperty', args: ['stale'], source: 'x', operationId: '1', expected: previous });
        owner.reset();
        await expect(queued).rejects.toMatchObject({ code: 'SESSION_REPLACED' });
        expect(owner.events(previous.epoch, 0).resync).toBe(true);
        for (let i = 0; i < 300; i++) owner.invalidate('node:change');
        expect(owner.events(owner.version.epoch, 0).resync).toBe(true);
        expect(provider.request).not.toHaveBeenCalled();
    });

    it('wakes event polling on mutation and closes pending polls on shutdown', async () => {
        const owner = new SceneSessionCoordinator(() => backend());
        server = await createSceneSessionServer(owner, { project: 'project-A' });
        const client = new SceneSessionClient(server.descriptor);
        const snapshot = await client.snapshot();
        const events = client.events(snapshot.version, snapshot.sequence);
        await owner.request('Node', 'setProperty', ['change']);
        expect((await events).events).toHaveLength(1);
        const abort = new AbortController();
        const pending = client.events(owner.version, owner.cursor, abort.signal);
        abort.abort();
        await expect(pending).rejects.toThrow();
    });
});
