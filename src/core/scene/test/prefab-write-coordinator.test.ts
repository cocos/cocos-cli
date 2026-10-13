import type { IPrefabEditLease, IRegisterPrefabRuntimeOptions } from '../common/prefab-write';
import { PrefabWriteCoordinator, type IPrefabSourceStore } from '../main-process/prefab-write-coordinator';

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

function setup() {
    const contents = new Map([
        ['prefab-a', 'version-a'],
        ['prefab-b', 'other-prefab'],
    ]);
    const read = jest.fn(async (uuid: string) => {
        const content = contents.get(uuid);
        if (content === undefined) throw new Error('Source not found');
        return Buffer.from(content);
    });
    const write = jest.fn(async (uuid: string, content: string) => {
        contents.set(uuid, content);
    });
    const store: IPrefabSourceStore = { read, write };
    const coordinator = new PrefabWriteCoordinator(store);
    const register = (runtimeId: string, options: Partial<IRegisterPrefabRuntimeOptions> = {}) =>
        coordinator.registerRuntime({
            runtime: { runtimeId, generation: 1 },
            editVersion: 0,
            state: { status: 'ready', dirty: false },
            ...options,
        });
    const edit = (runtimeId: string, options: Partial<IRegisterPrefabRuntimeOptions> = {}) => {
        const registration = register(runtimeId, options);
        return coordinator.beginEdit({ registration, expectedEditVersion: options.editVersion ?? 0 });
    };
    const commit = async (source: IPrefabEditLease, content = 'version-b', assetUuid = 'prefab-a') => {
        const baseline = await coordinator.readSource(assetUuid);
        return coordinator.commit({ source, assetUuid, expectedFingerprint: baseline.fingerprint, content });
    };
    return { coordinator, contents, read, write, register, edit, commit };
}

describe('Prefab write arbitration contract', () => {
    it('rejects another dirty Prefab working copy without changing the file or either runtime', async () => {
        const h = setup();
        const source = h.edit('scene');
        const target = h.register('prefab', { prefabUuid: 'prefab-a', state: { status: 'ready', dirty: true } });
        const before = [h.coordinator.queryRuntime(source.registration), h.coordinator.queryRuntime(target)];

        await expect(h.commit(source)).rejects.toMatchObject({
            code: 'PREFAB_DOCUMENT_DIRTY',
            commitState: 'not-committed',
            assetUuid: 'prefab-a',
            runtime: { runtimeId: 'prefab', generation: 1 },
        });

        expect({
            file: h.contents.get('prefab-a'),
            states: [h.coordinator.queryRuntime(source.registration), h.coordinator.queryRuntime(target)],
        }).toEqual({ file: 'version-a', states: before });
        expect(h.write).not.toHaveBeenCalled();
    });

    it('allows the owning dirty Prefab to save and ignores dirty ordinary Scenes and unrelated Prefabs', async () => {
        const h = setup();
        const source = h.edit('owner', { prefabUuid: 'prefab-a', state: { status: 'ready', dirty: true } });
        h.register('other-scene', { state: { status: 'ready', dirty: true } });
        h.register('other-prefab', { prefabUuid: 'prefab-b', state: { status: 'ready', dirty: true } });
        const receipt = await h.commit(source);

        expect([
            receipt.before.content,
            receipt.after.content,
            receipt.source,
            h.coordinator.queryRuntime(source.registration).status,
        ]).toEqual(['version-a', 'version-b', source.registration, 'editing']);
        // Publication alone does not mark an in-memory working copy saved or release its edit lease.
        expect(h.coordinator.queryRuntime(source.registration).dirty).toBe(true);
        h.coordinator.finishEdit({ lease: source, dirty: false });
        expect(h.coordinator.queryRuntime(source.registration)).toMatchObject({
            status: 'ready',
            dirty: false,
            editVersion: 1,
        });
    });

    it('detects a stale source baseline even without an asset-change notification', async () => {
        const h = setup();
        const source = h.edit('scene');
        const baseline = await h.coordinator.readSource('prefab-a');
        h.contents.set('prefab-a', 'external-edit');
        await expect(
            h.coordinator.commit({
                source,
                assetUuid: 'prefab-a',
                expectedFingerprint: baseline.fingerprint,
                content: 'stale-apply',
            }),
        ).rejects.toMatchObject({ code: 'PREFAB_SOURCE_CHANGED', commitState: 'not-committed' });
        expect(h.contents.get('prefab-a')).toBe('external-edit');
        expect(h.write).not.toHaveBeenCalled();
    });

    it.each(['unavailable', 'editing'] as const)('does not interpret a %s target as clean', async status => {
        const h = setup();
        const source = h.edit('scene');
        if (status === 'unavailable') h.register('prefab', { prefabUuid: 'prefab-a', state: { status } });
        else h.edit('prefab', { prefabUuid: 'prefab-a' });
        await expect(h.commit(source)).rejects.toMatchObject({
            code: status === 'unavailable' ? 'PREFAB_SESSION_CHANGED' : 'PREFAB_BUSY',
        });
        expect(h.write).not.toHaveBeenCalled();
    });

    it('keeps edit versions monotonic across dirty edits, save and undo', () => {
        const h = setup();
        const registration = h.register('prefab', { prefabUuid: 'prefab-a', editVersion: 10 });
        const versions: number[] = [];
        for (const dirty of [true, true, false, true]) {
            const expectedEditVersion = h.coordinator.queryRuntime(registration).editVersion;
            const lease = h.coordinator.beginEdit({ registration, expectedEditVersion });
            versions.push(lease.editVersion);
            h.coordinator.finishEdit({ lease, dirty });
        }
        expect(versions).toEqual([11, 12, 13, 14]);
        expect(() => h.coordinator.beginEdit({ registration, expectedEditVersion: 10 })).toThrow(
            expect.objectContaining({ code: 'PREFAB_SESSION_CHANGED' }),
        );
    });

    it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid edit version %s', editVersion => {
        const h = setup();
        expect(() => h.register('scene', { editVersion })).toThrow(
            expect.objectContaining({ code: 'PREFAB_INVALID_REQUEST' }),
        );
    });

    it('rejects version exhaustion without wrapping or reserving the runtime', () => {
        const h = setup();
        const registration = h.register('scene', { editVersion: Number.MAX_SAFE_INTEGER });
        expect(() => h.coordinator.beginEdit({ registration, expectedEditVersion: Number.MAX_SAFE_INTEGER })).toThrow(
            expect.objectContaining({ code: 'PREFAB_SESSION_CHANGED' }),
        );
        expect(h.coordinator.queryRuntime(registration)).toMatchObject({
            editVersion: Number.MAX_SAFE_INTEGER,
            status: 'ready',
        });
    });

    it('rejects stale leases, repeated generation registration and delayed close after reopen', async () => {
        const h = setup();
        const old = h.edit('scene');
        h.coordinator.unregisterRuntime(old.registration);
        expect(() => h.register('scene')).toThrow(expect.objectContaining({ code: 'PREFAB_SESSION_CHANGED' }));
        const current = h.register('scene', { runtime: { runtimeId: 'scene', generation: 2 } });
        expect(() => h.coordinator.unregisterRuntime(old.registration)).toThrow(
            expect.objectContaining({ code: 'PREFAB_SESSION_CHANGED' }),
        );
        await expect(h.commit(old)).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
        expect(h.coordinator.queryRuntime(current)).toMatchObject({ status: 'ready', editVersion: 0 });
        expect(h.write).not.toHaveBeenCalled();
    });

    it('serializes competing writes and rechecks the queued baseline', async () => {
        const h = setup();
        const first = h.edit('scene-a');
        const second = h.edit('scene-b');
        const baseline = await h.coordinator.readSource('prefab-a');
        const entered = deferred();
        const release = deferred();
        h.write.mockImplementationOnce(async (uuid, content) => {
            entered.resolve();
            await release.promise;
            h.contents.set(uuid, content);
        });
        const one = h.coordinator.commit({
            source: first,
            assetUuid: 'prefab-a',
            expectedFingerprint: baseline.fingerprint,
            content: 'first',
        });
        await entered.promise;
        const two = h.coordinator.commit({
            source: second,
            assetUuid: 'prefab-a',
            expectedFingerprint: baseline.fingerprint,
            content: 'second',
        });
        const rejected = expect(two).rejects.toMatchObject({ code: 'PREFAB_SOURCE_CHANGED' });
        expect(() => h.coordinator.finishEdit({ lease: second, dirty: false })).toThrow(
            expect.objectContaining({ code: 'PREFAB_BUSY' }),
        );
        release.resolve();
        await one;
        await rejected;
        expect(h.write.mock.calls).toEqual([['prefab-a', 'first']]);
    });

    it('reserves clean targets during publication and queues source reads behind import', async () => {
        const h = setup();
        const source = h.edit('scene');
        const target = h.register('prefab', { prefabUuid: 'prefab-a' });
        const entered = deferred();
        const release = deferred();
        h.write.mockImplementationOnce(async (uuid, content) => {
            h.contents.set(uuid, 'import-in-progress');
            entered.resolve();
            await release.promise;
            h.contents.set(uuid, content);
        });
        const operation = h.commit(source);
        await entered.promise;
        expect(() => h.coordinator.beginEdit({ registration: target, expectedEditVersion: 0 })).toThrow(
            expect.objectContaining({ code: 'PREFAB_BUSY' }),
        );
        expect(() => h.register('late-prefab', { prefabUuid: 'prefab-a' })).toThrow(
            expect.objectContaining({ code: 'PREFAB_BUSY' }),
        );
        const read = h.coordinator.readSource('prefab-a');
        release.resolve();
        await operation;
        await expect(read).resolves.toMatchObject({ content: 'version-b' });
        expect(h.coordinator.beginEdit({ registration: target, expectedEditVersion: 0 }).editVersion).toBe(1);
    });

    it.each(['close', 'disconnect'] as const)(
        'aborts before writing when a target becomes stale through %s during baseline I/O',
        async action => {
            const h = setup();
            const source = h.edit('scene');
            const target = h.register('prefab', { prefabUuid: 'prefab-a' });
            const baseline = await h.coordinator.readSource('prefab-a');
            const entered = deferred();
            const release = deferred();
            h.read.mockImplementationOnce(async () => {
                entered.resolve();
                await release.promise;
                return Buffer.from('version-a');
            });
            const operation = h.coordinator.commit({
                source,
                assetUuid: 'prefab-a',
                expectedFingerprint: baseline.fingerprint,
                content: 'version-b',
            });
            const rejected = expect(operation).rejects.toMatchObject({
                code: 'PREFAB_SESSION_CHANGED',
                commitState: 'not-committed',
            });
            await entered.promise;
            if (action === 'close') h.coordinator.unregisterRuntime(target);
            else h.coordinator.markRuntimeUnavailable(target);
            release.resolve();
            await rejected;
            expect(h.write).not.toHaveBeenCalled();
        },
    );

    it('keeps a disconnected target as a blocker until confirmed closure', async () => {
        const h = setup();
        const source = h.edit('scene');
        const target = h.register('prefab', { prefabUuid: 'prefab-a' });
        h.coordinator.markRuntimeUnavailable(target);
        await expect(h.commit(source)).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
        h.coordinator.unregisterRuntime(target);
        await expect(h.commit(source)).resolves.toMatchObject({ after: { content: 'version-b' } });
    });

    it('allows different resources to publish independently', async () => {
        const h = setup();
        const first = h.edit('scene-a');
        const second = h.edit('scene-b');
        const entered = deferred();
        const release = deferred();
        h.write.mockImplementationOnce(async (uuid, content) => {
            entered.resolve();
            await release.promise;
            h.contents.set(uuid, content);
        });
        const pending = h.commit(first);
        await entered.promise;
        await expect(h.commit(second, 'changed-b', 'prefab-b')).resolves.toMatchObject({
            after: { content: 'changed-b' },
        });
        release.resolve();
        await pending;
    });

    it('reports an uncertain write/import failure without claiming rollback and releases reservations', async () => {
        const h = setup();
        const source = h.edit('scene');
        const target = h.register('prefab', { prefabUuid: 'prefab-a' });
        h.write.mockImplementationOnce(async (uuid, content) => {
            h.contents.set(uuid, content);
            throw new Error('Import failed');
        });
        await expect(h.commit(source)).rejects.toMatchObject({ code: 'PREFAB_WRITE_FAILED', commitState: 'unknown' });
        expect(h.contents.get('prefab-a')).toBe('version-b');
        h.coordinator.finishEdit({ lease: source, dirty: true });
        expect(h.coordinator.beginEdit({ registration: target, expectedEditVersion: 0 })).toMatchObject({
            editVersion: 1,
        });
    });

    it('reports a committed publication when final source verification fails', async () => {
        const h = setup();
        const source = h.edit('scene');
        const baseline = await h.coordinator.readSource('prefab-a');
        h.read.mockResolvedValueOnce(Buffer.from('version-a')).mockRejectedValueOnce(new Error('Read failed'));
        await expect(
            h.coordinator.commit({
                source,
                assetUuid: 'prefab-a',
                expectedFingerprint: baseline.fingerprint,
                content: 'version-b',
            }),
        ).rejects.toMatchObject({ code: 'PREFAB_WRITE_FAILED', commitState: 'committed' });
        expect(h.contents.get('prefab-a')).toBe('version-b');
    });

    it('does not claim no write when the source closes after publication starts', async () => {
        const h = setup();
        const source = h.edit('scene');
        const entered = deferred();
        const release = deferred();
        h.write.mockImplementationOnce(async (uuid, content) => {
            entered.resolve();
            await release.promise;
            h.contents.set(uuid, content);
        });
        const operation = h.commit(source);
        await entered.promise;
        h.coordinator.unregisterRuntime(source.registration);
        release.resolve();
        await expect(operation).resolves.toMatchObject({
            source: source.registration,
            after: { content: 'version-b' },
        });
    });

    it('snapshots caller-owned input and does not leak mutable runtime records', async () => {
        const h = setup();
        const source = h.edit('scene');
        const baseline = await h.coordinator.readSource('prefab-a');
        const options = {
            source,
            assetUuid: 'prefab-a',
            expectedFingerprint: baseline.fingerprint,
            content: 'intended',
        };
        const pending = h.coordinator.commit(options);
        options.content = 'changed-after-dispatch';
        source.registration.generation = 99;
        await expect(pending).resolves.toMatchObject({ after: { content: 'intended' }, source: { generation: 1 } });
    });

    it('invalidates old ownership at reset and drains active writes before accepting a new Host epoch', async () => {
        const h = setup();
        const source = h.edit('scene');
        const entered = deferred();
        const release = deferred();
        h.write.mockImplementationOnce(async (uuid, content) => {
            entered.resolve();
            await release.promise;
            h.contents.set(uuid, content);
        });
        const operation = h.commit(source);
        await entered.promise;
        const reset = h.coordinator.reset();
        expect(() => h.register('new')).toThrow(expect.objectContaining({ code: 'PREFAB_SESSION_CHANGED' }));
        release.resolve();
        await operation;
        await reset;
        const next = h.register('scene');
        expect(next.registrationId).not.toBe(source.registration.registrationId);
        expect(() => h.coordinator.finishEdit({ lease: source, dirty: false })).toThrow(
            expect.objectContaining({ code: 'PREFAB_SESSION_CHANGED' }),
        );
    });
});
