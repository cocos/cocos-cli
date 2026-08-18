import * as assetdb from '@cocos/asset-db';
import assetDBManager from '../manager/asset-db';

describe('AssetDBManager.autoRefreshAssetLazy', () => {
    const manager = assetDBManager as any;

    beforeEach(() => {
        manager.assetBusyTask.clear();
        manager.waringRefreshAsset.length = 0;
        manager.autoRefreshAssetLazyPending = false;
        manager.waringRefreshAssetPendingMap.clear();
        jest.spyOn(manager, 'step').mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('starts immediately and resolves queued calls after each refresh', async () => {
        const releases: Record<string, () => void> = {};
        let second!: Promise<boolean>;
        let third!: Promise<boolean>;
        jest.spyOn(assetdb, 'refresh').mockImplementation(async (file) => {
            if (file === 'first') {
                second = manager.autoRefreshAssetLazy('second');
                third = manager.autoRefreshAssetLazy('third');
            }
            await new Promise<void>((resolve) => {
                releases[file] = resolve;
            });
            return 0;
        });
        const refresh = assetdb.refresh as jest.Mock;

        const first = manager.autoRefreshAssetLazy('first');
        await Promise.resolve();
        expect(refresh).toHaveBeenCalledWith('first');

        releases.first();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(refresh.mock.calls.map(([file]) => file)).toEqual(['first', 'second', 'third']);

        releases.second();
        await new Promise<void>((resolve) => setImmediate(resolve));
        let secondResolved = false;
        void second.then(() => { secondResolved = true; });
        expect(secondResolved).toBe(false);

        releases.third();
        await expect(second).resolves.toBe(true);
        await expect(third).resolves.toBe(true);
        await expect(first).resolves.toBe(true);
        expect(refresh).toHaveBeenCalledTimes(3);
    });
});
