jest.mock('../../assets', () => ({ assetManager: {} }));

const mockRequest = jest.fn();
const mockReload = jest.fn();
const mockClose = jest.fn();
const mockClearHistory = jest.fn();
let mockEditor: import('../scene-process/service/editor').EditorService;

jest.mock('cc', () => ({ director: { getScene: () => null } }));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: () => ({ request: mockRequest }) } }));
jest.mock('../scene-process/service/core', () => ({
    BaseService: class {
        protected isOpen = false;
        emit() {}
        emitInternal() {}
        broadcast() {}
    },
    register: () => () => {},
    queryRegisteredService: (name: string) => name === 'Editor' ? mockEditor : undefined,
    Service: { Undo: { isDirty: () => false, clearHistory: mockClearHistory } },
}));
jest.mock('../scene-process/service/core/decorator', () => ({
    queryRegisteredService: () => ({ isDirty: () => false }),
}));
jest.mock('../scene-process/service/editors', () => ({
    SceneEditor: class {},
    PrefabEditor: class {
        open = async () => ({});
        reloadFromSource = mockReload;
        close = mockClose;
    },
}));

import { PrefabWriteCoordinator } from '../main-process/prefab-write-coordinator';
import { PrefabWriteHost } from '../main-process/prefab-write-host';
import { EditorService } from '../scene-process/service/editor';
import { prefabWriteSession } from '../scene-process/service/prefab/write-session';

describe('Unavailable Prefab editor recovery', () => {
    let disk: string;
    let host: PrefabWriteHost;
    const asset = { uuid: 'asset', type: 'cc.Prefab', name: 'asset', url: 'db://assets/asset.prefab' };

    beforeEach(async () => {
        disk = 'original';
        host = new PrefabWriteHost(new PrefabWriteCoordinator({
            read: async () => Buffer.from(disk), write: async (_uuid, content) => { disk = content; },
        }));
        mockRequest.mockReset().mockImplementation(async (module: string, method: string, args: unknown[]) => {
            if (module === 'assetManager') return asset;
            return (host as unknown as Record<string, (...values: unknown[]) => unknown>)[method](...args);
        });
        mockReload.mockReset().mockRejectedValue(new Error('source rebuild failed'));
        mockClose.mockReset().mockResolvedValue(true);
        mockClearHistory.mockClear();
        mockEditor = new EditorService();
        await mockEditor.open({ urlOrUUID: asset.uuid });
        prefabWriteSession.loaded(await prefabWriteSession.readSource(asset.uuid));
        disk = 'updated';
        jest.spyOn(console, 'error').mockImplementation(() => {});
        await expect(mockEditor.syncPrefabSource(asset.uuid)).rejects.toThrow('source rebuild failed');
    });

    afterEach(async () => {
        await prefabWriteSession.close();
        jest.restoreAllMocks();
    });

    it('discards an unavailable editor, unregisters only after closure, and permits reopening', async () => {
        const unregister = jest.spyOn(host, 'unregisterRuntime');
        mockClose.mockImplementation(async () => {
            expect(unregister).not.toHaveBeenCalled();
            await expect(prefabWriteSession.acquire()).rejects.toMatchObject({ code: 'PREFAB_BUSY' });
            return true;
        });
        const previous = mockEditor.getEditorSession();
        await expect(mockEditor.close({ save: false })).resolves.toBe(true);
        expect(mockClose).toHaveBeenCalledWith({ save: false });
        expect(unregister).toHaveBeenCalledTimes(1);
        expect(prefabWriteSession.active).toBe(false);
        expect(prefabWriteSession.knownBaseline(asset.uuid)).toBeUndefined();
        await expect(mockEditor.open({ urlOrUUID: asset.uuid })).resolves.toEqual({});
        expect(mockEditor.getEditorSession().generation).toBeGreaterThan(previous.generation);
        await expect(prefabWriteSession.edit(async () => 'ready')).resolves.toBe('ready');
    });

    it('does not discard implicitly through a save-close or an ordinary open', async () => {
        await expect(mockEditor.close({})).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
        await expect(mockEditor.open({ urlOrUUID: asset.uuid })).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
        expect(mockClose).not.toHaveBeenCalled();
        expect(prefabWriteSession.active).toBe(true);
    });

    it('keeps the unavailable registration when local discard fails', async () => {
        const unregister = jest.spyOn(host, 'unregisterRuntime');
        mockClose.mockRejectedValue(new Error('local close failed'));
        await expect(mockEditor.close({ save: false })).rejects.toThrow('local close failed');
        expect(unregister).not.toHaveBeenCalled();
        expect(prefabWriteSession.active).toBe(true);
        await expect(prefabWriteSession.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
        mockClose.mockResolvedValue(true);
        await expect(mockEditor.close({ save: false })).resolves.toBe(true);
    });

    it('retries failed unregistration without destroying the already closed editor again', async () => {
        const unregister = jest.spyOn(host, 'unregisterRuntime').mockRejectedValueOnce(new Error('Host disconnected'));
        await expect(mockEditor.close({ save: false })).rejects.toThrow('Host disconnected');
        expect(prefabWriteSession.active).toBe(true);
        await expect(prefabWriteSession.acquire()).rejects.toMatchObject({ code: 'PREFAB_SESSION_CHANGED' });
        await expect(mockEditor.close({ save: false })).resolves.toBe(true);
        expect(mockClose).toHaveBeenCalledTimes(1);
        expect(unregister).toHaveBeenCalledTimes(2);
        expect(prefabWriteSession.active).toBe(false);
    });
    it('confirms an already completed Host unregistration after its reply is lost', async () => {
        const unregister = host.unregisterRuntime.bind(host);
        const calls = jest.spyOn(host, 'unregisterRuntime').mockImplementationOnce(async registration => {
            await unregister(registration);
            throw new Error('unregister reply lost');
        });
        await expect(mockEditor.close({ save: false })).rejects.toThrow('unregister reply lost');
        expect(prefabWriteSession.active).toBe(true);
        await expect(mockEditor.close({ save: false })).resolves.toBe(true);
        expect(calls).toHaveBeenCalledTimes(2);
        expect(mockClose).toHaveBeenCalledTimes(1);
        await expect(mockEditor.open({ urlOrUUID: asset.uuid })).resolves.toEqual({});
        await expect(prefabWriteSession.edit(async () => 'ready')).resolves.toBe('ready');
    });

    it('can explicitly close and reopen after Editor.lock loses its successful acquisition reply', async () => {
        await mockEditor.close({ save: false });
        await mockEditor.open({ urlOrUUID: asset.uuid });
        mockClose.mockClear();
        const begin = host.beginEdit.bind(host);
        jest.spyOn(host, 'beginEdit').mockImplementationOnce(async options => {
            await begin(options);
            throw new Error('beginEdit reply lost');
        });
        await expect(mockEditor.lock()).rejects.toThrow('beginEdit reply lost');
        await expect(mockEditor.close({ save: false })).resolves.toBe(true);
        expect(mockClose).toHaveBeenCalledTimes(1);
        await mockEditor.open({ urlOrUUID: asset.uuid });
        await mockEditor.lock();
        mockEditor.unlock();
    });

});
