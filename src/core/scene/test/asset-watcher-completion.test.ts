type Listener = (...args: unknown[]) => void;

const mockLoadAny = jest.fn();
const mockRpcRequest = jest.fn();

jest.mock('cc', () => {
    class Asset {
        public uuid = '';
        public _uuid = '';
        public initDefault(uuid: string) {
            this.uuid = uuid;
            this._uuid = uuid;
        }
    }
    return {
        Asset,
        Component: class Component {},
        Node: class Node {},
        Prefab: class Prefab {},
        Material: class Material {},
        Texture2D: class Texture2D {},
        TextureCube: class TextureCube {},
        Constructor: Function,
        isValid: () => true,
        js: { getClassName: () => '', getSuper: () => null },
        CCClass: { Attr: { DELIMETER: '$' } },
        assetManager: {
            assets: new Map(),
            references: new Map(),
            loadAny: mockLoadAny,
            releaseAsset: jest.fn(),
        },
    };
});

jest.mock('../scene-process/service/asset/callbacks-invoker', () => ({
    CallbacksInvoker: class {
        private listeners = new Map<string, Listener[]>();
        on(key: string, listener: Listener) {
            this.listeners.set(key, [...(this.listeners.get(key) ?? []), listener]);
        }
        off(key: string) {
            this.listeners.delete(key);
        }
        emit(key: string, ...args: unknown[]) {
            for (const listener of this.listeners.get(key) ?? []) {
                listener(...args);
            }
        }
        hasEventListener(key: string) {
            return (this.listeners.get(key)?.length ?? 0) > 0;
        }
        removeAllListeners() {
            this.listeners.clear();
        }
    },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: mockRpcRequest }) },
}));

import { Asset, assetManager } from 'cc';
import { assetWatcherManager } from '../scene-process/service/asset/asset-watcher';

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('AssetWatcherManager completion boundary', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockLoadAny.mockReset();
        mockRpcRequest.mockReset().mockResolvedValue({ uuid: 'asset-uuid' });
        assetManager.assets.clear();
        assetManager.references!.clear();
        (assetManager.releaseAsset as jest.Mock).mockClear();
        assetManager.assetListener.removeAllListeners();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('does not resolve assetChanged until loadAny, unlock, and the deferred reference update flush complete', async () => {
        let callback!: (error: Error | null, asset: Asset) => void;
        mockLoadAny.mockImplementation((_uuid: string, next: typeof callback) => {
            callback = next;
        });
        assetManager.assetListener.on('asset-uuid', jest.fn());
        let completed = false;

        const changed = assetWatcherManager.onAssetChanged('asset-uuid').then(() => {
            completed = true;
        });
        await flush();
        expect(mockLoadAny).toHaveBeenCalledWith('asset-uuid', expect.any(Function));
        expect(completed).toBe(false);

        callback(null, new Asset());
        await flush();
        expect(completed).toBe(false);

        jest.advanceTimersByTime(400);
        await changed;
        expect(completed).toBe(true);
    });
    it('does not resolve one change before a concurrent UUID flush completes', async () => {
        const callbacks = new Map<string, (error: Error | null, asset: Asset) => void>();
        mockLoadAny.mockImplementation((uuid: string, next: (error: Error | null, asset: Asset) => void) => {
            callbacks.set(uuid, next);
        });
        assetManager.assetListener.on('asset-a', jest.fn());
        assetManager.assetListener.on('asset-b', jest.fn());

        let firstCompleted = false;
        const first = assetWatcherManager.onAssetChanged('asset-a').then(() => { firstCompleted = true; });
        await flush();
        const second = assetWatcherManager.onAssetChanged('asset-b');
        await flush();

        callbacks.get('asset-a')!(null, new Asset());
        await flush();
        expect(firstCompleted).toBe(false);

        callbacks.get('asset-b')!(null, new Asset());
        await flush();
        jest.advanceTimersByTime(400);
        await Promise.all([first, second]);
        expect(firstCompleted).toBe(true);
    });

    it('drops a queued watcher update after the editor session is invalidated', async () => {
        let callback!: (error: Error | null, asset: Asset) => void;
        const listener = jest.fn();
        mockLoadAny.mockImplementation((_uuid: string, next: typeof callback) => {
            callback = next;
        });
        assetManager.assetListener.on('asset-uuid', listener);

        const changed = assetWatcherManager.onAssetChanged('asset-uuid');
        await flush();
        (assetWatcherManager as any).invalidate();

        callback(null, new Asset());
        await flush();
        jest.advanceTimersByTime(400);
        await changed;

        expect(listener).not.toHaveBeenCalled();
    });

    it('releases a stale loaded asset after the editor session is invalidated', async () => {
        let callback!: (error: Error | null, asset: Asset) => void;
        const asset = new Asset();
        mockLoadAny.mockImplementation((_uuid: string, next: typeof callback) => {
            callback = next;
        });
        assetManager.assetListener.on('asset-uuid', jest.fn());

        const changed = assetWatcherManager.onAssetChanged('asset-uuid');
        await flush();
        (assetWatcherManager as any).invalidate();
        (assetManager.assets as unknown as Map<string, Asset>).set('asset-uuid', asset);

        callback(null, asset);
        await flush();
        jest.advanceTimersByTime(400);
        await changed;

        expect(assetManager.releaseAsset).toHaveBeenCalledWith(asset);
    });

    it('releases an asset that completes after the watcher load timeout', async () => {
        let callback!: (error: Error | null, asset: Asset) => void;
        const asset = new Asset();
        mockLoadAny.mockImplementation((_uuid: string, next: typeof callback) => {
            callback = next;
        });
        assetManager.assetListener.on('asset-uuid', jest.fn());
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const changed = assetWatcherManager.onAssetChanged('asset-uuid');
        await flush();
        jest.advanceTimersByTime(10_000);
        await flush();
        (assetManager.assets as unknown as Map<string, Asset>).set('asset-uuid', asset);
        callback(null, asset);
        jest.advanceTimersByTime(400);
        await changed;

        expect(assetManager.releaseAsset).toHaveBeenCalledWith(asset);
        error.mockRestore();
    });

    it('releases the watcher lock when loadAny never invokes its callback', async () => {
        mockLoadAny.mockImplementation(() => undefined);
        assetManager.assetListener.on('asset-uuid', jest.fn());
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        let completed = false;

        const changed = assetWatcherManager.onAssetChanged('asset-uuid').then(() => {
            completed = true;
        });
        await flush();
        jest.advanceTimersByTime(10_000);
        await flush();
        jest.advanceTimersByTime(400);
        await changed;

        expect(completed).toBe(true);
        expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Asset load timeout: asset-uuid' }));
        error.mockRestore();
    });

});
