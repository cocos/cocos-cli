import { EventEmitter } from 'events';

const mockQueryAssetInfo = jest.fn((uuid: string) => ({ uuid }));
const mockProgrammingCall = jest.fn(async (value: string) => `programming:${value}`);
const mockConfigGet = jest.fn(async (key: string) => `config:${key}`);
const mockGetBundle = jest.fn(async () => ({ lang: 'en', data: {} }));

jest.mock('../../assets', () => ({
    assetManager: {
        queryAssetInfo: (uuid: string) => mockQueryAssetInfo(uuid),
    },
}));

jest.mock('../../scripting', () => ({
    __esModule: true,
    default: {
        testCall: (value: string) => mockProgrammingCall(value),
    },
}));

jest.mock('../scene-configs', () => ({
    sceneConfigInstance: {
        get: (key: string) => mockConfigGet(key),
    },
}));

jest.mock('../../base/i18n', () => ({
    __esModule: true,
    default: {
        getBundle: () => mockGetBundle(),
    },
}));

import type { ISceneCommandProvider } from '../main-process/rpc';
import { RpcProxy } from '../main-process/rpc';

interface FakeProcess extends EventEmitter {
    connected: boolean;
    send: jest.Mock;
}

function createFakeProcess(): FakeProcess {
    const process = new EventEmitter() as FakeProcess;
    process.connected = true;
    process.send = jest.fn();
    return process;
}

async function flushEvents(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('main-process Scene RPC providers', () => {
    let rpc: RpcProxy;
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        rpc = new RpcProxy();
        mockQueryAssetInfo.mockClear();
        mockProgrammingCall.mockClear();
        mockConfigGet.mockClear();
        mockGetBundle.mockClear();
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        rpc.dispose();
        logSpy.mockRestore();
        warnSpy.mockRestore();
    });

    it('preserves getInstance startup and detached Webview reverse-call behavior', async () => {
        expect(() => rpc.getInstance()).toThrow('[Node] Rpc instance is not started!');

        await rpc.startup();
        const facade = rpc.getInstance();

        await expect(facade.executeLocal('assetManager', 'queryAssetInfo', ['asset-uuid']))
            .resolves.toEqual({ uuid: 'asset-uuid' });
        await expect(facade.executeLocal('programming', 'testCall', ['value']))
            .resolves.toBe('programming:value');
        await expect(facade.executeLocal('sceneConfigInstance', 'get', ['camera']))
            .resolves.toBe('config:camera');
        await expect(facade.executeLocal('i18n', 'getBundle'))
            .resolves.toEqual({ lang: 'en', data: {} });

        expect(facade.isConnect()).toBeUndefined();
        await expect(facade.request('Editor', 'hasOpen'))
            .rejects.toThrow('[Node] No Scene command provider is installed');
    });

    it('uses the Worker Provider by default and registers host modules for reverse calls', async () => {
        const workerProcess = createFakeProcess();
        workerProcess.send.mockImplementation((message: any) => {
            if (message?.type === 'request') {
                setImmediate(() => workerProcess.emit('message', {
                    id: message.id,
                    type: 'response',
                    result: true,
                }));
            }
        });

        await rpc.startup(workerProcess as any);
        const facade = rpc.getInstance();

        await expect(facade.request('Editor', 'hasOpen')).resolves.toBe(true);
        expect(facade.isConnect()).toBe(true);
        expect(workerProcess.send).toHaveBeenCalledWith(expect.objectContaining({
            type: 'request',
            module: 'Editor',
            method: 'hasOpen',
            args: [],
        }));

        workerProcess.emit('message', {
            id: 91,
            type: 'request',
            module: 'assetManager',
            method: 'queryAssetInfo',
            args: ['reverse-call-uuid'],
        });
        await flushEvents();

        expect(mockQueryAssetInfo).toHaveBeenCalledWith('reverse-call-uuid');
        expect(workerProcess.send).toHaveBeenCalledWith({
            id: 91,
            type: 'response',
            result: { uuid: 'reverse-call-uuid' },
        });
    });

    it('installs an explicit Provider and never falls back after its request fails', async () => {
        const workerProcess = createFakeProcess();
        await rpc.startup(workerProcess as any);
        const facade = rpc.getInstance();
        const providerFailure = new Error('Host runtime rejected the command');
        const hostProvider: ISceneCommandProvider = {
            request: jest.fn().mockRejectedValue(providerFailure),
            isConnect: jest.fn(() => true),
            dispose: jest.fn(),
        };

        workerProcess.send.mockClear();
        rpc.setCommandProvider(hostProvider);

        await expect(facade.request('Editor', 'hasOpen')).rejects.toBe(providerFailure);
        expect(hostProvider.request).toHaveBeenCalledWith('Editor', 'hasOpen', [], undefined);
        expect(workerProcess.send).not.toHaveBeenCalled();
        expect(workerProcess.listenerCount('message')).toBe(0);
    });

    it('can install a host Provider before startup while keeping local execution available', async () => {
        const hostProvider: ISceneCommandProvider = {
            request: jest.fn(async (_module, _method, args) => args?.[0]),
            dispose: jest.fn(),
        };

        rpc.setCommandProvider(hostProvider);
        const facade = rpc.getInstance();

        await expect(facade.request('Editor', 'open', [{ urlOrUUID: 'db://assets/main.scene' }]))
            .resolves.toEqual({ urlOrUUID: 'db://assets/main.scene' });
        await expect(facade.executeLocal('assetManager', 'queryAssetInfo', ['local-uuid']))
            .resolves.toEqual({ uuid: 'local-uuid' });
    });

    it('disposes an explicitly installed Provider with the Rpc lifecycle', () => {
        const hostProvider: ISceneCommandProvider = {
            request: jest.fn(),
            dispose: jest.fn(),
        };
        rpc.setCommandProvider(hostProvider);

        rpc.dispose();

        expect(hostProvider.dispose).toHaveBeenCalledTimes(1);
        expect(() => rpc.getInstance()).toThrow('[Node] Rpc instance is not started!');
    });

    it('switches to the new Provider before disposing the previous Provider', () => {
        const firstProvider: ISceneCommandProvider = {
            request: jest.fn(),
            isConnect: jest.fn(() => false),
            dispose: jest.fn(() => {
                expect(rpc.isConnect()).toBe(true);
            }),
        };
        const nextProvider: ISceneCommandProvider = {
            request: jest.fn(),
            isConnect: jest.fn(() => true),
        };

        rpc.setCommandProvider(firstProvider);
        rpc.setCommandProvider(nextProvider);

        expect(firstProvider.dispose).toHaveBeenCalledTimes(1);
        expect(rpc.isConnect()).toBe(true);
    });

    it('returns the same registration when installing the current Provider again', () => {
        const provider: ISceneCommandProvider = {
            request: jest.fn(),
            dispose: jest.fn(),
        };

        const firstRegistration = rpc.setCommandProvider(provider);
        const nextRegistration = rpc.setCommandProvider(provider);

        expect(nextRegistration).toBe(firstRegistration);
        expect(provider.dispose).not.toHaveBeenCalled();

        firstRegistration.dispose();
        firstRegistration.dispose();

        expect(provider.dispose).toHaveBeenCalledTimes(1);
    });

    it('does not let a stale registration clear a later Provider', async () => {
        const workerProvider: ISceneCommandProvider = {
            request: jest.fn(async () => 'worker'),
            dispose: jest.fn(),
        };
        const hostProvider: ISceneCommandProvider = {
            request: jest.fn(async () => 'host'),
            dispose: jest.fn(),
        };

        const workerRegistration = rpc.setCommandProvider(workerProvider);
        rpc.setCommandProvider(hostProvider);
        workerRegistration.dispose();

        await expect(rpc.request('Editor', 'hasOpen')).resolves.toBe('host');
        expect(workerProvider.dispose).toHaveBeenCalledTimes(1);
        expect(hostProvider.dispose).not.toHaveBeenCalled();
    });

    it('keeps old registrations stale when the same Provider object is installed again', async () => {
        const sharedProvider: ISceneCommandProvider = {
            request: jest.fn(async () => true),
            dispose: jest.fn(),
        };
        const intermediateProvider: ISceneCommandProvider = {
            request: jest.fn(async () => false),
            dispose: jest.fn(),
        };

        const oldRegistration = rpc.setCommandProvider(sharedProvider);
        rpc.setCommandProvider(intermediateProvider);
        const currentRegistration = rpc.setCommandProvider(sharedProvider);
        oldRegistration.dispose();

        await expect(rpc.request('Editor', 'hasOpen')).resolves.toBe(true);

        currentRegistration.dispose();
        currentRegistration.dispose();

        await expect(rpc.request('Editor', 'hasOpen'))
            .rejects.toThrow('[Node] No Scene command provider is installed');
        expect(sharedProvider.dispose).toHaveBeenCalledTimes(2);
        expect(intermediateProvider.dispose).toHaveBeenCalledTimes(1);
    });

    it('resets the current Provider idempotently', async () => {
        const provider: ISceneCommandProvider = {
            request: jest.fn(async () => true),
            dispose: jest.fn(),
        };
        rpc.setCommandProvider(provider);

        rpc.resetCommandProvider();
        rpc.resetCommandProvider();

        expect(provider.dispose).toHaveBeenCalledTimes(1);
        await expect(rpc.request('Editor', 'hasOpen'))
            .rejects.toThrow('[Node] No Scene command provider is installed');
    });

    it('forwards request options unchanged and rejects notify when unsupported', async () => {
        const provider: ISceneCommandProvider = {
            request: jest.fn(async () => true),
        };
        rpc.setCommandProvider(provider);

        await expect(rpc.request('Editor', 'hasOpen', [], { timeout: 1234 })).resolves.toBe(true);
        expect(provider.request).toHaveBeenCalledWith('Editor', 'hasOpen', [], { timeout: 1234 });
        expect(() => rpc.notify('Editor', 'hasOpen')).toThrow(
            '[Node] Scene command provider does not support notify()',
        );
    });
});
