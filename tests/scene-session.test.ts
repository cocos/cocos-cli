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

function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
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
        for (const [module, method] of [['__proto__', 'toString'], ['Editor', 'constructor'], ['Editor', 'queryRenderSnapshot'], ['Asset', 'assetChanged']]) {
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

    it.each(['assetChanged', 'assetDeleted'])('waits for an in-flight %s before snapshots and subsequent commands', async method => {
        const resource = deferred();
        let state = 'updating';
        const calls: string[] = [];
        const provider = { request: jest.fn(async (module: string, method: string) => {
            calls.push(`${module}.${method}`);
            if (module === 'Asset') { await resource.promise; state = 'ready'; }
            return state;
        }) };
        const owner = new SceneSessionCoordinator(() => provider);
        const notification = owner.request('Asset', method, ['prefab'], { timeout: 1234 });
        const read = jest.fn(async () => state);
        const snapshot = owner.read(read);
        const command = owner.request('Editor', 'queryCurrent', []);
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(read).not.toHaveBeenCalled();
        expect(calls).toEqual([`Asset.${method}`]);
        expect(provider.request).toHaveBeenCalledWith('Asset', method, ['prefab'], { timeout: 1234 });

        resource.resolve();
        await notification;
        await expect(snapshot).resolves.toBe('ready');
        await expect(command).resolves.toBe('ready');
        expect(owner.version.revision).toBe(1);
    });

    it('rejects a snapshot overlapped by a resource update instead of returning mixed state', async () => {
        const reading = deferred();
        const resource = deferred();
        const finishRead = deferred();
        const owner = new SceneSessionCoordinator(() => ({ request: async () => resource.promise }));
        const snapshot = owner.read(async () => {
            reading.resolve();
            await finishRead.promise;
            return 'partially updated snapshot';
        });
        const result = expect(snapshot).rejects.toMatchObject({ code: 'CONFLICT' });
        await reading.promise;
        const notification = owner.request('Asset', 'assetChanged', ['prefab']);
        finishRead.resolve();
        await new Promise<void>(resolve => setImmediate(resolve));
        resource.resolve();
        await notification;
        await result;
    });

    it('drains resource work before completing a command even when that command fails', async () => {
        const resource = deferred();
        const notified = deferred();
        let notification!: Promise<any>;
        const provider = { request: async (module: string) => {
            if (module === 'Asset') { notified.resolve(); await resource.promise; return; }
            notification = owner.request('Asset', 'assetChanged', ['prefab']);
            throw new Error('command failed after save');
        } };
        const owner = new SceneSessionCoordinator(() => provider);
        const command = owner.request('Prefab', 'applyPrefabChanges', []);
        const failure = expect(command).rejects.toThrow('command failed after save');
        await notified.promise;
        const read = jest.fn(async () => 'ready');
        const snapshot = owner.read(read);
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(read).not.toHaveBeenCalled();
        expect(owner.cursor).toBe(0);
        resource.resolve();
        await notification;
        await failure;
        await expect(snapshot).resolves.toBe('ready');
        expect(owner.version.revision).toBe(1);
        expect(owner.events(owner.version.epoch, 0).events[0].events)
            .toEqual(['Asset:assetChanged', 'Prefab:applyPrefabChanges']);
    });

    it('propagates notification failures, invalidates partial updates and keeps the queue usable', async () => {
        const resource = deferred();
        const owner = new SceneSessionCoordinator(() => ({ request: async () => resource.promise }));
        const notification = owner.request('Asset', 'assetChanged', ['prefab']);
        const failure = expect(notification).rejects.toThrow('resource failed');
        const snapshot = owner.read(async () => 'fresh snapshot');
        resource.reject(new Error('resource failed'));
        await failure;
        await expect(snapshot).resolves.toBe('fresh snapshot');
        expect(owner.version.revision).toBe(1);
    });

    it('rejects old resource completions after replacement without invalidating the new session', async () => {
        const resource = deferred();
        const owner = new SceneSessionCoordinator(() => ({ request: async () => resource.promise }));
        const notification = owner.request('Asset', 'assetChanged', ['prefab']);
        const failure = expect(notification).rejects.toMatchObject({ code: 'SESSION_REPLACED' });
        owner.reset();
        const version = owner.version;
        await expect(owner.read(async () => 'new session')).resolves.toBe('new session');
        resource.resolve();
        await failure;
        expect(owner.version).toEqual(version);
        expect(owner.events(version.epoch, 0).events.map(event => event.events)).toEqual([['session:reset']]);
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
