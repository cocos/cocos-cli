import type { IAssetMeta } from '../../src/core/assets/@types/public';
import { assetManager } from '../../src/core/assets';
import * as Assets from '../../src/lib/assets/assets';

describe('lib assets api', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('exposes saveAssetMeta and delegates to assetManager', async () => {
        const meta = {
            ver: 'ver',
            importer: 'database',
            imported: true,
            uuid: 'test-uuid',
            files: [],
            subMetas: {},
            userData: {},
        } as IAssetMeta;
        const spy = jest.spyOn(assetManager, 'saveAssetMeta').mockResolvedValue(undefined);
        const saveAssetMeta = (Assets as { saveAssetMeta?: typeof assetManager.saveAssetMeta }).saveAssetMeta;

        expect(saveAssetMeta).toEqual(expect.any(Function));

        if (!saveAssetMeta) {
            throw new Error('saveAssetMeta is not exposed from lib/assets/assets');
        }

        await expect(saveAssetMeta('test-uuid', meta)).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalledWith('test-uuid', meta);
    });
});
