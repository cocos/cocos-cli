type Listener = (...args: unknown[]) => void;

const mockLoadAny = jest.fn();
const mockRpcRequest = jest.fn();
const mockQueryService = jest.fn();
const mockProxyRequest = jest.fn();

jest.mock('../main-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: mockProxyRequest }) },
}));

jest.mock('../scene-process/service/core', () => ({
    BaseService: class { public emit = jest.fn(); },
    register: () => (ctor: unknown) => ctor,
    queryRegisteredService: mockQueryService,
    ServiceEvents: { emit: jest.fn() },
}));

jest.mock('../scene-process/service/node/node-utils', () => ({ isEditorNode: () => false }));

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
import { AssetService } from '../scene-process/service/asset';
import { AssetProxy } from '../main-process/proxy/asset-proxy';

class TestAssetService extends AssetService {
    get emitted() { return this.emit; }
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('AssetWatcherManager completion boundary', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockLoadAny.mockReset();
        mockQueryService.mockReset();
        mockProxyRequest.mockReset();
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

    it('explicit refresh rejects load failures while ordinary notifications retain log-and-continue behavior', async () => {
        const failure = new Error('image loading failed');
        mockLoadAny.mockImplementation((_uuid: string, callback: (error: Error) => void) => callback(failure));
        assetManager.assetListener.on('asset-uuid', jest.fn());
        const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const service = new TestAssetService();
            mockProxyRequest.mockImplementation((_service: string, _method: string, [uuid]: string[]) => service.refreshAsset(uuid));
            const rejected = expect(AssetProxy.refreshAsset('asset-uuid')).rejects.toThrow('image loading failed');
            await flush();
            await jest.advanceTimersByTimeAsync(400);
            await rejected;
            expect(mockProxyRequest).toHaveBeenCalledWith('Asset', 'refreshAsset', ['asset-uuid']);
            expect(service.emitted).not.toHaveBeenCalled();
            const notified = service.assetChanged('asset-uuid');
            await flush();
            await jest.advanceTimersByTimeAsync(400);
            await notified;
            expect(log).toHaveBeenCalledWith(failure);
            expect(service.emitted).toHaveBeenCalledWith('asset:change', 'asset-uuid');
        } finally { log.mockRestore(); }
    });

    it('explicit refresh rejects timeout and permits a successful explicit retry after the lock is released', async () => {
        mockLoadAny.mockImplementation(() => undefined);
        const listener = jest.fn();
        assetManager.assetListener.on('asset-uuid', listener);
        const service = new TestAssetService();
        const rejected = expect(service.refreshAsset('asset-uuid')).rejects.toThrow('Asset load timeout');
        await flush();
        await jest.advanceTimersByTimeAsync(10_000);
        await rejected;
        expect(service.emitted).not.toHaveBeenCalled();

        mockLoadAny.mockImplementation((_uuid: string, callback: (error: null, asset: Asset) => void) => callback(null, new Asset()));
        let completed = false;
        const retried = service.refreshAsset('asset-uuid').then(() => { completed = true; });
        await flush();
        expect(completed).toBe(false);
        await jest.advanceTimersByTimeAsync(400);
        await retried;
        expect(listener).toHaveBeenCalledTimes(1);
        expect(service.emitted).toHaveBeenCalledTimes(1);
    });

    it('explicit refresh rejects missing assets, but completes without loading an unused asset', async () => {
        const service = new TestAssetService();
        mockRpcRequest.mockResolvedValueOnce(null);
        await expect(service.refreshAsset('missing')).rejects.toThrow('Asset is unavailable');
        expect(service.emitted).not.toHaveBeenCalled();
        await service.refreshAsset('unused');
        expect(mockLoadAny).not.toHaveBeenCalled();
        expect(service.emitted).toHaveBeenCalledWith('asset:change', 'unused');
    });

    it('explicit refresh rejects Scene invalidation during loading instead of acknowledging a discarded update', async () => {
        let callback!: (error: Error | null, asset: Asset) => void;
        mockLoadAny.mockImplementation((_uuid: string, next: typeof callback) => { callback = next; });
        assetManager.assetListener.on('asset-uuid', jest.fn());
        const service = new TestAssetService();
        const rejected = expect(service.refreshAsset('asset-uuid')).rejects.toThrow('Scene changed');
        await flush();
        assetWatcherManager.invalidate();
        callback(null, new Asset());
        await rejected;
        expect(service.emitted).not.toHaveBeenCalled();
    });

    it('explicit refresh rejects a stale editor session before changing caches', async () => {
        mockQueryService.mockImplementation(name => name === 'Editor'
            ? { getEditorSession: () => ({ generation: 1 }), isCurrentEditorSession: () => false }
            : undefined);
        await expect(new AssetService().refreshAsset('asset-uuid')).rejects.toThrow('Scene changed before');
        expect(mockRpcRequest).not.toHaveBeenCalled();
    });

});
