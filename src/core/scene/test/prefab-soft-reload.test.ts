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
});

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}
