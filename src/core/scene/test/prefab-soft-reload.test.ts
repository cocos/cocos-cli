import { ReloadResult } from '../common';
import { PrefabSoftReloadScheduler } from '../scene-process/service/prefab/soft-reload';

describe('PrefabSoftReloadScheduler', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('debounces changed prefab assets and emits reload events after editor reload', async () => {
        const reload = jest.fn().mockResolvedValue(ReloadResult.SUCCESS);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => ({ uuid: 'scene-a', generation: 1 }),
            500,
        );

        scheduler.schedule({
            changedUuid: 'prefab-a',
            preserveUndoHistory: true,
            editorSession: { uuid: 'scene-a', generation: 1 },
        });

        jest.advanceTimersByTime(499);
        expect(reload).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        await flushPromises();

        expect(reload).toHaveBeenCalledWith(
            { preserveUndoHistory: true, urlOrUUID: 'scene-a' },
            { uuid: 'scene-a', generation: 1 },
        );
        expect(emitAssetReload).toHaveBeenCalledWith('prefab-a');
    });

    it('does not reload a different editor after the scheduled session becomes stale', async () => {
        const reload = jest.fn().mockResolvedValue(ReloadResult.SUCCESS);
        const emitAssetReload = jest.fn();
        let session: { uuid: string | null; generation: number } = { uuid: 'scene-a', generation: 1 };
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            (() => session) as any,
            500,
        );

        scheduler.schedule({
            changedUuid: 'prefab-a',
            editorSession: { uuid: 'scene-a', generation: 1 },
        });
        session = { uuid: 'prefab-b', generation: 2 };

        jest.advanceTimersByTime(500);
        await flushPromises();

        expect(reload).not.toHaveBeenCalled();
        expect(emitAssetReload).not.toHaveBeenCalled();
    });

    it('rejects reload waiters when the reload operation fails', async () => {
        const reload = jest.fn().mockRejectedValue(new Error('reload failed'));
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            jest.fn(),
            () => ({ uuid: 'scene-a', generation: 1 }),
            500,
        );
        const waiter = scheduler.waitForAssetReload('prefab-a');
        const result = waiter.promise.catch(error => error);

        scheduler.schedule({ changedUuid: 'prefab-a', editorSession: { uuid: 'scene-a', generation: 1 } });
        jest.advanceTimersByTime(500);
        await flushPromises();

        await expect(result).resolves.toEqual(expect.objectContaining({ message: 'reload failed' }));
    });

    it('rejects reload waiters for a non-success reload result', async () => {
        const reload = jest.fn().mockResolvedValue(4);
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            jest.fn(),
            () => ({ uuid: 'scene-a', generation: 1 }),
            500,
        );
        const waiter = scheduler.waitForAssetReload('prefab-a');
        const result = waiter.promise.catch(error => error);

        scheduler.schedule({ changedUuid: 'prefab-a', editorSession: { uuid: 'scene-a', generation: 1 } });
        jest.advanceTimersByTime(500);
        await flushPromises();

        await expect(result).resolves.toEqual(expect.objectContaining({ message: expect.stringContaining('Prefab reload failed') }));
    });

    it('resolves asset reload waiters after editor reload', async () => {
        const reload = jest.fn().mockResolvedValue(ReloadResult.SUCCESS);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => ({ uuid: 'scene-a', generation: 1 }),
            500,
        );
        const onReload = jest.fn();

        scheduler.waitForAssetReload('prefab-a').promise.then(onReload);
        scheduler.schedule({
            changedUuid: 'prefab-a',
            editorSession: { uuid: 'scene-a', generation: 1 },
        });

        jest.advanceTimersByTime(500);
        await flushPromises();

        expect(onReload).toHaveBeenCalledTimes(1);
        expect(emitAssetReload).toHaveBeenCalledWith('prefab-a');
    });

    it('can cancel asset reload waiters', async () => {
        const reload = jest.fn().mockResolvedValue(ReloadResult.SUCCESS);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => ({ uuid: 'scene-a', generation: 1 }),
            500,
        );
        const onReload = jest.fn();
        const waiter = scheduler.waitForAssetReload('prefab-a');

        waiter.promise.then(onReload);
        waiter.cancel();
        scheduler.schedule({
            changedUuid: 'prefab-a',
            editorSession: { uuid: 'scene-a', generation: 1 },
        });

        jest.advanceTimersByTime(500);
        await flushPromises();

        expect(onReload).not.toHaveBeenCalled();
        expect(emitAssetReload).toHaveBeenCalledWith('prefab-a');

        jest.advanceTimersByTime(10000);
        await flushPromises();

        expect(onReload).not.toHaveBeenCalled();
    });

    it('waits for pending reloads to become idle', async () => {
        const reload = jest.fn().mockResolvedValue(ReloadResult.SUCCESS);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => ({ uuid: 'scene-a', generation: 1 }),
            500,
        );
        const onIdle = jest.fn();

        scheduler.schedule({
            changedUuid: 'prefab-a',
            editorSession: { uuid: 'scene-a', generation: 1 },
        });
        scheduler.waitForIdle().then(onIdle);

        jest.advanceTimersByTime(499);
        await flushPromises();
        expect(onIdle).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        await flushPromises();

        expect(onIdle).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledWith(
            { preserveUndoHistory: false, urlOrUUID: 'scene-a' },
            { uuid: 'scene-a', generation: 1 },
        );
    });

    it('resolves idle immediately when no reload is pending', async () => {
        const reload = jest.fn().mockResolvedValue(ReloadResult.SUCCESS);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => ({ uuid: 'scene-a', generation: 1 }),
            500,
        );
        const onIdle = jest.fn();

        scheduler.waitForIdle().then(onIdle);
        await flushPromises();

        expect(onIdle).toHaveBeenCalledTimes(1);
        expect(reload).not.toHaveBeenCalled();
    });

    it('deleting a pending changed asset clears its reload event and preserve flag', async () => {
        const reload = jest.fn().mockResolvedValue(ReloadResult.SUCCESS);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => ({ uuid: 'scene-a', generation: 1 }),
            500,
        );

        scheduler.schedule({
            changedUuid: 'prefab-a',
            preserveUndoHistory: true,
            editorSession: { uuid: 'scene-a', generation: 1 },
        });
        scheduler.schedule({
            deletedUuid: 'prefab-a',
            editorSession: { uuid: 'scene-a', generation: 1 },
        });

        jest.advanceTimersByTime(500);
        await flushPromises();

        expect(reload).toHaveBeenCalledWith(
            { preserveUndoHistory: false, urlOrUUID: 'scene-a' },
            { uuid: 'scene-a', generation: 1 },
        );
        expect(emitAssetReload).not.toHaveBeenCalled();
    });

    it('resolves asset reload waiters by timeout when reload event is removed before flush', async () => {
        const reload = jest.fn().mockResolvedValue(ReloadResult.SUCCESS);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => ({ uuid: 'scene-a', generation: 1 }),
            500,
            1000,
        );
        const onReload = jest.fn();

        scheduler.waitForAssetReload('prefab-a').promise.then(onReload);
        scheduler.schedule({
            changedUuid: 'prefab-a',
            editorSession: { uuid: 'scene-a', generation: 1 },
        });
        scheduler.schedule({
            deletedUuid: 'prefab-a',
            editorSession: { uuid: 'scene-a', generation: 1 },
        });

        jest.advanceTimersByTime(500);
        await flushPromises();

        expect(reload).toHaveBeenCalledWith(
            { preserveUndoHistory: false, urlOrUUID: 'scene-a' },
            { uuid: 'scene-a', generation: 1 },
        );
        expect(emitAssetReload).not.toHaveBeenCalled();
        expect(onReload).not.toHaveBeenCalled();

        jest.advanceTimersByTime(499);
        await flushPromises();
        expect(onReload).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        await flushPromises();
        expect(onReload).toHaveBeenCalledTimes(1);
    });
});

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}
