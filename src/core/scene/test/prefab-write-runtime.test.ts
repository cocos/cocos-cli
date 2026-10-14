jest.mock('../../assets', () => ({ assetManager: {} }));

import { isPrefabWriteError, serializePrefabWriteError } from '../common/prefab-write';
import { PrefabWriteCoordinator, PrefabWriteError } from '../main-process/prefab-write-coordinator';
import { PrefabWriteHost } from '../main-process/prefab-write-host';
import { PrefabWriteConflict, PrefabWriteRuntime, reconcilePrefabWrite } from '../scene-process/service/prefab/write-runtime';

describe('Prefab write error validation and serialization', () => {
    const valid = { code: 'PREFAB_WRITE_FAILED', message: 'Write failed', commitState: 'committed' } as const;

    it.each([
        { label: 'DTO', error: valid },
        { label: 'Host', error: new PrefabWriteError('PREFAB_BUSY', valid.message, 'not-committed') },
        { label: 'runtime', error: new PrefabWriteConflict({ ...valid, commitState: 'unknown' }) },
        { label: 'RPC-reconstructed', error: Object.assign(new Error(valid.message), valid) },
    ])('accepts $label errors without changing their commit state', ({ error }) => {
        expect(isPrefabWriteError(error)).toBe(true);
        expect(serializePrefabWriteError(error)).toMatchObject({
            code: error.code, message: error.message, commitState: error.commitState,
        });
    });

    it.each([
        ['non-object input', null],
        ['plain Error', new Error('failure')],
        ['unknown code', { ...valid, code: 'PREFAB_NEW' }],
        ['invalid message', { ...valid, message: null }],
        ['unknown state', { ...valid, commitState: 'pending' }],
        ['invalid asset UUID', { ...valid, assetUuid: 42 }],
        ['null runtime', { ...valid, runtime: null }],
        ['incomplete runtime', { ...valid, runtime: { runtimeId: 'scene' } }],
        ['negative generation', { ...valid, runtime: { runtimeId: 'scene', generation: -1 } }],
        ['unsafe generation', { ...valid, runtime: { runtimeId: 'scene', generation: Number.MAX_SAFE_INTEGER + 1 } }],
    ])('rejects the complete payload for %s', (_label, error) => {
        expect(isPrefabWriteError(error)).toBe(false);
        expect(serializePrefabWriteError(error)).toBeUndefined();
    });

    it('copies only documented fields, including a separate runtime identity', () => {
        const runtime = { runtimeId: 'scene', generation: 0, registrationId: 'private-token' };
        const error = Object.assign(new Error(valid.message), valid, { assetUuid: 'asset', runtime, extra: 'private-data' });
        const serialized = serializePrefabWriteError(error);
        expect(serialized).toEqual({ ...valid, assetUuid: 'asset', runtime: { runtimeId: 'scene', generation: 0 } });
        expect(serialized).not.toBe(error);
        expect(serialized!.runtime).not.toBe(runtime);
        expect(error.runtime.registrationId).toBe('private-token');
    });
});

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

async function fixture() {
    let disk = 'original';
    let targetDirty = false;
    const write = jest.fn(async (_uuid: string, content: string) => {
        disk = content;
    });
    const host = new PrefabWriteHost(new PrefabWriteCoordinator({ read: async () => Buffer.from(disk), write }));
    const source = new PrefabWriteRuntime(host, () => true);
    const target = new PrefabWriteRuntime(host, () => targetDirty);
    await source.open('scene', 1);
    await target.open('prefab', 1, 'asset');
    source.loaded(await source.readSource('asset'));
    target.loaded(await target.readSource('asset'));
    return {
        source,
        target,
        host,
        write,
        disk: () => disk,
        externalWrite: (content: string) => {
            disk = content;
        },
        dirty: (value: boolean) => {
            targetDirty = value;
        },
    };
}

describe('Prefab runtime write and synchronization', () => {
    it('blocks Apply while a target recording is active and while it has unsaved edits', async () => {
        const f = await fixture();
        const input = await f.target.acquire();
        const recording = f.target.retain();
        await input();
        await expect(f.source.edit(() => f.source.commit('asset', 'applied'), true)).rejects.toMatchObject({
            code: 'PREFAB_BUSY',
            commitState: 'not-committed',
        });
        f.dirty(true);
        await recording();
        await expect(f.source.edit(() => f.source.commit('asset', 'applied'), true)).rejects.toMatchObject({
            code: 'PREFAB_DOCUMENT_DIRTY',
        });
        expect(f.write).not.toHaveBeenCalled();
        expect(f.target.baseline('asset').content).toBe('original');
    });

    it('publishes from the Scene, then replaces a clean Prefab tree and advances its loaded baseline', async () => {
        const f = await fixture();
        const receipt = await f.source.edit(() => f.source.commit('asset', 'applied'), true);
        expect(f.target.baseline('asset').content).toBe('original');
        let tree = 'original';
        await expect(
            f.target.synchronize('asset', async snapshot => {
                tree = snapshot.content;
            }),
        ).resolves.toBe(true);
        expect([f.disk(), tree, f.target.baseline('asset').fingerprint]).toEqual([
            'applied',
            'applied',
            receipt.after.fingerprint,
        ]);
        const reload = jest.fn();
        await expect(f.target.synchronize('asset', reload)).resolves.toBe(false);
        expect(reload).not.toHaveBeenCalled();
    });

    it('protects a new edit begun after publication and rejects its stale Save', async () => {
        const f = await fixture();
        await f.source.edit(() => f.source.commit('asset', 'applied'), true);
        await f.target.edit(async () => {
            f.dirty(true);
        });
        const reload = jest.fn();
        await expect(f.target.synchronize('asset', reload)).resolves.toBe(false);
        await expect(f.target.edit(() => f.target.commit('asset', 'local changes'), true)).rejects.toMatchObject({
            code: 'PREFAB_SOURCE_CHANGED',
        });
        expect(reload).not.toHaveBeenCalled();
        expect(f.disk()).toBe('applied');
    });

    it('keeps the old baseline on failed synchronization', async () => {
        const f = await fixture();
        f.externalWrite('external');
        await expect(
            f.target.synchronize('asset', async () => {
                throw new Error('load failed');
            }),
        ).rejects.toThrow('load failed');
        expect(f.target.baseline('asset').content).toBe('original');
    });

    it('reserves the target throughout an asynchronous source rebuild', async () => {
        const f = await fixture();
        f.externalWrite('external');
        const entered = deferred();
        const finish = deferred();
        const sync = f.target.synchronize('asset', async () => {
            entered.resolve();
            await finish.promise;
        });
        await entered.promise;
        await expect(f.target.acquire()).rejects.toMatchObject({ code: 'PREFAB_BUSY' });
        f.source.loaded(await f.source.readSource('asset'));
        await expect(f.source.edit(() => f.source.commit('asset', 'another'), true)).rejects.toMatchObject({
            code: 'PREFAB_BUSY',
        });
        finish.resolve();
        await sync;
    });

    it('retains pending source synchronization until Undo returns a dirty target to clean', async () => {
        const f = await fixture();
        await f.target.edit(async () => {
            f.dirty(true);
        });
        const reload = jest.fn();
        f.target.whenClean('asset', reload);
        await f.target.edit(async () => {});
        expect(reload).not.toHaveBeenCalled();
        await f.target.edit(async () => {
            f.dirty(false);
        });
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('rejects overlapping writes in the source runtime and releases occupancy after rejection', async () => {
        const f = await fixture();
        const finish = await f.source.acquire(true);
        await expect(f.source.acquire()).rejects.toMatchObject({ code: 'PREFAB_BUSY' });
        await finish();
        await expect(f.source.edit(async () => 'available', true)).resolves.toBe('available');
    });

    it('supports successive Undo/Redo source versions and rejects an intervening external save', async () => {
        const f = await fixture();
        const apply = await f.source.edit(() => f.source.commit('asset', 'applied'), true);
        const undo = await f.source.edit(
            () => f.source.commit('asset', apply.before.content, apply.after.fingerprint),
            true,
        );
        const redo = await f.source.edit(
            () => f.source.commit('asset', apply.after.content, undo.after.fingerprint),
            true,
        );
        f.externalWrite('saved by someone else');
        await expect(
            f.source.edit(() => f.source.commit('asset', apply.before.content, redo.after.fingerprint), true),
        ).rejects.toMatchObject({ code: 'PREFAB_SOURCE_CHANGED' });
        expect(f.disk()).toBe('saved by someone else');
    });

    it('keeps the original write failure when finishing the edit also fails', async () => {
        const f = await fixture();
        f.write.mockRejectedValue(new Error('import failed after writing'));
        const finish = jest.spyOn(f.host, 'finishEdit').mockRejectedValue(new Error('finish failed'));
        const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await expect(f.source.edit(() => f.source.commit('asset', 'new'), true)).rejects.toMatchObject({
                commitState: 'unknown', message: 'import failed after writing', assetUuid: 'asset',
            });
            expect(finish).toHaveBeenCalledTimes(1);
            await expect(f.source.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
            await f.source.close();
        } finally {
            finish.mockRestore();
            warning.mockRestore();
        }
    });

    it('reports committed when the final occupancy release fails after a successful write', async () => {
        const f = await fixture();
        const finish = jest.spyOn(f.host, 'finishEdit').mockRejectedValue(new Error('finish failed'));
        try {
            await expect(f.source.edit(() => f.source.commit('asset', 'new'), true)).rejects.toMatchObject({
                code: 'PREFAB_WRITE_FAILED', commitState: 'committed', assetUuid: 'asset',
            });
            expect(f.disk()).toBe('new');
            await expect(f.source.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
            await f.source.close();
        } finally {
            finish.mockRestore();
        }
    });

    it('keeps local mutation blocked when reporting unavailable to the Host also fails', async () => {
        const f = await fixture();
        const begin = jest.spyOn(f.host, 'beginEdit');
        const finish = jest.spyOn(f.host, 'finishEdit').mockRejectedValue(new Error('finish failed'));
        const unavailable = jest.spyOn(f.host, 'markRuntimeUnavailable').mockRejectedValue(new Error('Host unreachable'));
        const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await expect(f.target.edit(async () => {})).rejects.toThrow('finish failed');
            begin.mockClear();
            await expect(f.target.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
            expect(() => f.target.retain()).toThrow('unavailable');
            expect(begin).not.toHaveBeenCalled();
        } finally {
            begin.mockRestore(); finish.mockRestore(); unavailable.mockRestore(); warning.mockRestore();
        }
    });

    it('reserves a healthy document until discard finishes and removes its deferred synchronization', async () => {
        const f = await fixture();
        const entered = deferred();
        const finish = deferred();
        const callback = jest.fn();
        const discard = f.target.discard(async () => {
            f.target.whenIdle(callback);
            entered.resolve();
            await finish.promise;
            return true;
        });
        await entered.promise;
        await expect(f.target.acquire()).rejects.toMatchObject({ code: 'PREFAB_BUSY' });
        await expect(f.source.edit(() => f.source.commit('asset', 'blocked'), true)).rejects.toMatchObject({ code: 'PREFAB_BUSY' });
        finish.resolve();
        await expect(discard).resolves.toBe(true);
        expect(callback).not.toHaveBeenCalled();
        await expect(f.source.edit(() => f.source.commit('asset', 'after discard'), true)).resolves.toMatchObject({
            after: { content: 'after discard' },
        });
    });

    it('does not discard a document with an active recording', async () => {
        const f = await fixture();
        const release = await f.target.acquire();
        const close = jest.fn(async () => true);
        await expect(f.target.discard(close)).rejects.toMatchObject({ code: 'PREFAB_BUSY' });
        expect(close).not.toHaveBeenCalled();
        await release();
        await expect(f.target.discard(close)).resolves.toBe(true);
    });

    it('keeps a document registered when the editor declines to close', async () => {
        const f = await fixture();
        await expect(f.target.discard(async () => false)).resolves.toBe(false);
        expect(f.target.active).toBe(true);
        await expect(f.target.edit(async () => 'editable')).resolves.toBe('editable');
    });

    it('classifies a lost commit response as unknown and does not leak publication state into later edits', async () => {
        const f = await fixture();
        const commit = jest.spyOn(f.host, 'commit').mockRejectedValueOnce(new Error('response lost'));
        await expect(f.source.edit(() => f.source.commit('asset', 'new'), true)).rejects.toMatchObject({
            commitState: 'unknown', assetUuid: 'asset',
        });
        commit.mockRestore();
        await expect(f.source.edit(async () => { throw new Error('unrelated failure'); })).rejects.toThrow('unrelated failure');
    });

    it('treats a malformed commit error as unknown without a successful receipt', async () => {
        const f = await fixture();
        const commit = f.host.commit.bind(f.host);
        const spy = jest.spyOn(f.host, 'commit').mockImplementationOnce(async options => {
            await commit(options);
            throw Object.assign(new Error('Invalid response'), {
                code: 'PREFAB_WRITE_FAILED', commitState: 'committed',
                runtime: { runtimeId: 'scene', generation: 'invalid' },
            });
        });
        try {
            await expect(f.source.edit(() => f.source.commit('asset', 'new'), true)).rejects.toMatchObject({
                code: 'PREFAB_WRITE_FAILED', commitState: 'unknown', assetUuid: 'asset',
            });
            expect(f.disk()).toBe('new');
        } finally {
            spy.mockRestore();
        }
    });

    it('keeps a successful receipt authoritative when a later error is malformed', async () => {
        const f = await fixture();
        const receipt = await f.source.edit(() => f.source.commit('asset', 'new'), true);
        // Call reconciliation directly so outer edit handling cannot mask its outcome.
        await expect(reconcilePrefabWrite(receipt, async () => {
            throw Object.assign(new Error('Reconstruction failed'), {
                code: 'PREFAB_WRITE_FAILED', commitState: 'not-committed', assetUuid: 42,
            });
        })).rejects.toMatchObject({ code: 'PREFAB_WRITE_FAILED', commitState: 'committed', assetUuid: 'asset' });
        expect(f.disk()).toBe('new');
    });
    it.each(['before Host execution', 'after Host execution'])('isolates an uncertain edit acquisition %s and allows discard', async phase => {
        const f = await fixture();
        const begin = f.host.beginEdit.bind(f.host);
        const lost = new Error('beginEdit reply lost');
        const request = jest.spyOn(f.host, 'beginEdit').mockImplementationOnce(async options => {
            if (phase === 'after Host execution') await begin(options);
            throw lost;
        });
        const mutate = jest.fn(async () => {});
        await expect(f.target.edit(mutate)).rejects.toBe(lost);
        expect(mutate).not.toHaveBeenCalled();
        expect(f.target.editing).toBe(false);
        const registration = request.mock.calls[0][0].registration;
        await expect(f.host.queryRuntime(registration)).resolves.toMatchObject({ ok: true, value: { status: 'unavailable' } });
        await expect(f.target.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
        const close = jest.fn(async () => true);
        await expect(f.target.discard(close)).resolves.toBe(true);
        expect(close).toHaveBeenCalledTimes(1);
        expect(f.target.active).toBe(false);
        expect(request).toHaveBeenCalledTimes(1);
        await f.target.open('prefab', 2, 'asset');
        await expect(f.target.edit(async () => 'ready')).resolves.toBe('ready');
        expect(f.write).not.toHaveBeenCalled();
    });

    it('blocks locally after uncertain acquisition even when reporting unavailable also fails', async () => {
        const f = await fixture();
        const begin = f.host.beginEdit.bind(f.host);
        const lost = new Error('beginEdit reply lost');
        jest.spyOn(f.host, 'beginEdit').mockImplementationOnce(async options => { await begin(options); throw lost; });
        const mark = jest.spyOn(f.host, 'markRuntimeUnavailable').mockRejectedValue(new Error('Host disconnected'));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await expect(f.target.acquire()).rejects.toBe(lost);
            await expect(f.target.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
            await expect(f.target.discard(async () => true)).resolves.toBe(true);
            expect(mark).toHaveBeenCalledTimes(1);
        } finally { warn.mockRestore(); }
    });

    it('keeps a confirmed busy acquisition retryable without marking the working copy unavailable', async () => {
        const f = await fixture();
        jest.spyOn(f.host, 'beginEdit').mockResolvedValueOnce({ ok: false, error: {
            code: 'PREFAB_BUSY', message: 'source publication in progress', commitState: 'not-committed',
        } });
        const mark = jest.spyOn(f.host, 'markRuntimeUnavailable');
        await expect(f.target.acquire()).rejects.toMatchObject({ code: 'PREFAB_BUSY' });
        await expect(f.target.edit(async () => 'retry')).resolves.toBe('retry');
        expect(mark).not.toHaveBeenCalled();
    });

    it('allows discard after the Host invalidates the current registration', async () => {
        const f = await fixture();
        await f.host.reset();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            await expect(f.target.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
            await expect(f.target.discard(async () => true)).resolves.toBe(true);
            await f.target.open('prefab', 2, 'asset');
            await expect(f.target.edit(async () => 'reopened')).resolves.toBe('reopened');
        } finally { warn.mockRestore(); }
    });

});
