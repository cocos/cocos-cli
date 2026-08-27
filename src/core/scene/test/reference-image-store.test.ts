const get = jest.fn();
const set = jest.fn();
const emit = jest.fn();

jest.mock('../scene-configs', () => ({
    sceneConfigInstance: { get, set },
}));

jest.mock('../../../server/socket', () => ({
    socketService: { io: { emit } },
}));

import { ReferenceImageStore } from '../main-process/reference-image-store';

const emptyConfig = () => ({ images: [], sceneBindings: {}, desiredVisible: true });

describe('ReferenceImageStore', () => {
    let store: ReferenceImageStore;
    let persisted: any;

    beforeEach(() => {
        persisted = emptyConfig();
        get.mockReset();
        set.mockReset();
        emit.mockReset();
        get.mockImplementation(async () => persisted);
        set.mockImplementation(async (_path: string, value: unknown) => {
            persisted = JSON.parse(JSON.stringify(value));
            return true;
        });
        store = new ReferenceImageStore();
    });

    it('serializes concurrent stale-client additions without losing either shared-library record', async () => {
        await Promise.all([
            store.mutate({ type: 'add-and-select', path: 'C:\\a.png', sceneUuid: 'scene-a' }),
            store.mutate({ type: 'add-and-select', path: 'C:\\b.png', sceneUuid: 'scene-b' }),
        ]);

        const snapshot = await store.getSnapshot();
        expect(snapshot.config.images.map((image) => image.path)).toEqual(['C:\\a.png', 'C:\\b.png']);
        expect(snapshot.config.sceneBindings).toEqual({ 'scene-a': 'C:\\a.png', 'scene-b': 'C:\\b.png' });
        expect(set).toHaveBeenCalledTimes(2);
        expect(emit).toHaveBeenCalledTimes(2);
    });

    it('keeps one public library while scene bindings remain independent', async () => {
        await store.mutate({ type: 'add-and-select', path: 'C:\\shared.png', sceneUuid: 'scene-a' });
        const selected = await store.mutate({ type: 'select', path: 'C:\\shared.png', sceneUuid: 'scene-b' });
        const cleared = await store.mutate({ type: 'clear-binding', sceneUuid: 'scene-a' });

        expect(selected.config.images).toHaveLength(1);
        expect(selected.config.sceneBindings).toEqual({ 'scene-a': 'C:\\shared.png', 'scene-b': 'C:\\shared.png' });
        expect(cleared.config.images).toHaveLength(1);
        expect(cleared.config.sceneBindings).toEqual({ 'scene-b': 'C:\\shared.png' });
    });

    it('does not write or fan out an idempotent no-op', async () => {
        const snapshot = await store.mutate({ type: 'clear-binding', sceneUuid: 'scene-a' });

        expect(snapshot).toMatchObject({ instanceId: expect.any(String), revision: 0, changed: false, config: emptyConfig() });
        expect(set).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
    });

    it('deletes a library entry and clears every binding without selecting a neighbor', async () => {
        persisted = {
            desiredVisible: true,
            images: [
                { path: 'C:\\delete.png', x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 100 },
                { path: 'C:\\keep.png', x: 1, y: 2, scaleX: 2, scaleY: 2, opacity: 50 },
            ],
            sceneBindings: {
                'scene-a': 'C:\\delete.png',
                'scene-b': 'C:\\delete.png',
                'scene-c': 'C:\\keep.png',
            },
        };

        const snapshot = await store.mutate({ type: 'remove', path: 'C:\\delete.png' });

        expect(snapshot.config.images.map((image) => image.path)).toEqual(['C:\\keep.png']);
        expect(snapshot.config.sceneBindings).toEqual({ 'scene-c': 'C:\\keep.png' });
    });

    it('reads persisted state again when a new store instance is initialized', async () => {
        await store.mutate({ type: 'add-and-select', path: 'C:\\persisted.png', sceneUuid: 'scene-a' });
        const restartedStore = new ReferenceImageStore();

        const snapshot = await restartedStore.getSnapshot();
        expect(snapshot).toMatchObject({ instanceId: expect.any(String), revision: 0 });
        expect(snapshot.instanceId).not.toBe((await store.getSnapshot()).instanceId);
        expect(snapshot.config).toEqual(persisted);
    });
});
