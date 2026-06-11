import { PrefabSoftReloadScheduler } from '../scene-process/service/prefab/soft-reload';

describe('PrefabSoftReloadScheduler', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('debounces changed prefab assets and emits reload events after editor reload', async () => {
        const reload = jest.fn().mockResolvedValue(undefined);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => 'current-editor',
            500,
        );

        scheduler.schedule({
            changedUuid: 'prefab-a',
            preserveUndoHistory: true,
            editorUuid: 'scene-a',
        });

        jest.advanceTimersByTime(499);
        expect(reload).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        await flushPromises();

        expect(reload).toHaveBeenCalledWith({
            preserveUndoHistory: true,
            urlOrUUID: 'scene-a',
        });
        expect(emitAssetReload).toHaveBeenCalledWith('prefab-a');
    });

    it('resolves asset reload waiters after editor reload', async () => {
        const reload = jest.fn().mockResolvedValue(undefined);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => 'current-editor',
            500,
        );
        const onReload = jest.fn();

        scheduler.waitForAssetReload('prefab-a').promise.then(onReload);
        scheduler.schedule({
            changedUuid: 'prefab-a',
            editorUuid: 'scene-a',
        });

        jest.advanceTimersByTime(500);
        await flushPromises();

        expect(onReload).toHaveBeenCalledTimes(1);
        expect(emitAssetReload).toHaveBeenCalledWith('prefab-a');
    });

    it('can cancel asset reload waiters', async () => {
        const reload = jest.fn().mockResolvedValue(undefined);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => 'current-editor',
            500,
        );
        const onReload = jest.fn();
        const waiter = scheduler.waitForAssetReload('prefab-a');

        waiter.promise.then(onReload);
        waiter.cancel();
        scheduler.schedule({
            changedUuid: 'prefab-a',
            editorUuid: 'scene-a',
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
        const reload = jest.fn().mockResolvedValue(undefined);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => 'current-editor',
            500,
        );
        const onIdle = jest.fn();

        scheduler.schedule({
            changedUuid: 'prefab-a',
            editorUuid: 'scene-a',
        });
        scheduler.waitForIdle().then(onIdle);

        jest.advanceTimersByTime(499);
        await flushPromises();
        expect(onIdle).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        await flushPromises();

        expect(onIdle).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledWith({
            preserveUndoHistory: false,
            urlOrUUID: 'scene-a',
        });
    });

    it('resolves idle immediately when no reload is pending', async () => {
        const reload = jest.fn().mockResolvedValue(undefined);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => 'current-editor',
            500,
        );
        const onIdle = jest.fn();

        scheduler.waitForIdle().then(onIdle);
        await flushPromises();

        expect(onIdle).toHaveBeenCalledTimes(1);
        expect(reload).not.toHaveBeenCalled();
    });

    it('deleting a pending changed asset clears its reload event and preserve flag', async () => {
        const reload = jest.fn().mockResolvedValue(undefined);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => 'current-editor',
            500,
        );

        scheduler.schedule({
            changedUuid: 'prefab-a',
            preserveUndoHistory: true,
            editorUuid: 'scene-a',
        });
        scheduler.schedule({
            deletedUuid: 'prefab-a',
            editorUuid: 'scene-a',
        });

        jest.advanceTimersByTime(500);
        await flushPromises();

        expect(reload).toHaveBeenCalledWith({
            preserveUndoHistory: false,
            urlOrUUID: 'scene-a',
        });
        expect(emitAssetReload).not.toHaveBeenCalled();
    });

    it('resolves asset reload waiters by timeout when reload event is removed before flush', async () => {
        const reload = jest.fn().mockResolvedValue(undefined);
        const emitAssetReload = jest.fn();
        const scheduler = new PrefabSoftReloadScheduler(
            reload,
            emitAssetReload,
            () => 'current-editor',
            500,
            1000,
        );
        const onReload = jest.fn();

        scheduler.waitForAssetReload('prefab-a').promise.then(onReload);
        scheduler.schedule({
            changedUuid: 'prefab-a',
            editorUuid: 'scene-a',
        });
        scheduler.schedule({
            deletedUuid: 'prefab-a',
            editorUuid: 'scene-a',
        });

        jest.advanceTimersByTime(500);
        await flushPromises();

        expect(reload).toHaveBeenCalledWith({
            preserveUndoHistory: false,
            urlOrUUID: 'scene-a',
        });
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
