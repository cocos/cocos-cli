const assetManager = {
    assets: {
        has: jest.fn(() => true),
        remove: jest.fn(),
    },
    loadAny: jest.fn((uuid: string, optionsOrCallback: any, callback?: Function) => {
        const done = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
        done(null, { uuid, loaded: true });
    }),
};

jest.mock('cc', () => ({
    assetManager,
}), { virtual: true });

import { loadPreviewAsset } from '../scene-process/service/preview/asset-reload';

describe('preview asset reload', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (globalThis as any).cc = { assetManager };
        (globalThis as any).WebEnv = { serverURL: 'http://localhost:7456' };
    });

    it('loads the requested preview asset through the engine asset manager', async () => {
        await expect(loadPreviewAsset('material-uuid', 'material')).resolves.toEqual({ uuid: 'material-uuid', loaded: true });

        expect(assetManager.assets.remove).not.toHaveBeenCalled();
        expect(assetManager.loadAny).toHaveBeenCalledWith(
            'material-uuid',
            expect.any(Function),
        );
    });

    it('reloads the requested preview asset when required', async () => {
        await expect(loadPreviewAsset('model-prefab-uuid', 'model', { reloadAsset: true })).resolves.toEqual({ uuid: 'model-prefab-uuid', loaded: true });

        expect(assetManager.assets.remove).toHaveBeenCalledWith('model-prefab-uuid');
        expect(assetManager.loadAny).toHaveBeenCalledWith(
            'model-prefab-uuid',
            { reloadAsset: true },
            expect.any(Function),
        );
    });
});
