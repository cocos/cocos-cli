import { EventEmitter } from 'events';

const assetManager = new EventEmitter();
const scriptManager = new EventEmitter();
const assetChanged = jest.fn();
const assetDeleted = jest.fn();

jest.mock('../../assets', () => ({ assetManager }));
jest.mock('../../scripting', () => ({ __esModule: true, default: scriptManager }));
jest.mock('../main-process/proxy/asset-proxy', () => ({
    AssetProxy: { assetChanged, assetDeleted },
}));
jest.mock('../main-process/proxy/script-proxy', () => ({
    ScriptProxy: {
        investigatePackerDriver: jest.fn(),
        loadScript: jest.fn(),
        scriptChange: jest.fn(),
        removeScript: jest.fn(),
    },
}));

import { disposeModuleMessages, listenModuleMessages } from '../main-process/messages';

function asset(uuid: string) {
    return { uuid, meta: { importer: 'unknown' } } as any;
}

async function flushNotifications(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('main-process Asset DB notifications', () => {
    beforeEach(() => {
        disposeModuleMessages();
        assetManager.removeAllListeners();
        scriptManager.removeAllListeners();
        assetChanged.mockReset().mockResolvedValue(undefined);
        assetDeleted.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => {
        disposeModuleMessages();
    });

    it('does not register a listener after its session has been disposed during module loading', async () => {
        const listening = listenModuleMessages();
        disposeModuleMessages();
        await listening;

        expect(assetManager.listenerCount('asset-add')).toBe(0);
        expect(assetManager.listenerCount('asset-change')).toBe(0);
        expect(assetManager.listenerCount('asset-delete')).toBe(0);
    });

    it('serializes related events by UUID without globally blocking other assets', async () => {
        let resolveChanged!: () => void;
        assetChanged.mockReturnValueOnce(new Promise<void>((resolve) => {
            resolveChanged = resolve;
        }));
        await listenModuleMessages();

        assetManager.emit('asset-change', asset('same-uuid'));
        assetManager.emit('asset-delete', asset('same-uuid'));
        await flushNotifications();

        expect(assetChanged).toHaveBeenCalledWith('same-uuid');
        expect(assetDeleted).not.toHaveBeenCalled();

        resolveChanged();
        await flushNotifications();
        expect(assetDeleted).toHaveBeenCalledWith('same-uuid');
    });

    it('binds one listener set per Scene worker session and drops stale queued notifications on dispose', async () => {
        let resolveChanged!: () => void;
        assetChanged.mockReturnValueOnce(new Promise<void>((resolve) => {
            resolveChanged = resolve;
        }));

        await listenModuleMessages();
        await listenModuleMessages();
        expect(assetManager.listenerCount('asset-add')).toBe(1);
        expect(assetManager.listenerCount('asset-change')).toBe(1);
        expect(assetManager.listenerCount('asset-delete')).toBe(1);

        assetManager.emit('asset-change', asset('source-uuid'));
        assetManager.emit('asset-delete', asset('source-uuid'));
        await flushNotifications();
        expect(assetChanged).toHaveBeenCalledTimes(1);

        disposeModuleMessages();
        resolveChanged();
        await flushNotifications();

        expect(assetDeleted).not.toHaveBeenCalled();
        expect(assetManager.listenerCount('asset-add')).toBe(0);
        expect(assetManager.listenerCount('asset-change')).toBe(0);
        expect(assetManager.listenerCount('asset-delete')).toBe(0);
    });
});
