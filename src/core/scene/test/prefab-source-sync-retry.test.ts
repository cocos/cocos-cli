jest.mock('../../assets', () => ({ assetManager: {} }));
const mockRequest = jest.fn();
const mockReload = jest.fn();
const mockClearHistory = jest.fn();
const mockEmit = jest.fn();
let mockDirty = false;
let mockEditor: import('../scene-process/service/editor').EditorService;
let mockPrefab: import('../scene-process/service/prefab').PrefabService;

jest.mock('cc', () => ({ director: { getScene: () => null }, assetManager: { assets: { remove: jest.fn() } } }));
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
    ServiceEvents: { emit: mockEmit },
    Service: { get Editor() { return mockEditor; }, Undo: { isDirty: () => mockDirty, clearHistory: mockClearHistory } },
}));
jest.mock('../scene-process/service/core/decorator', () => ({ queryRegisteredService: () => ({ isDirty: () => mockDirty }) }));
jest.mock('../scene-process/service/editors', () => ({
    SceneEditor: class {
        open = async () => ({});
        reload = mockReload;
        getRootNode = () => ({ walk: (visit: (node: unknown) => void) => visit({ _prefab: { instance: {}, asset: { _uuid: 'asset' } } }) });
        close = async () => true;
    },
    PrefabEditor: class {},
}));
jest.mock('../scene-process/service/prefab/component', () => ({ componentOperation: {} }));
jest.mock('../scene-process/service/prefab/node', () => ({ nodeOperation: { assetToNodesMap: new Map([['asset', []]]) } }));
jest.mock('../scene-process/service/prefab/utils', () => ({ prefabUtils: {} }));
jest.mock('../scene-process/service/scene/utils', () => ({ sceneUtils: {} }));
jest.mock('../scene-process/service/prefab/prefab-undo', () => ({ PrefabUndoHelper: class {
    consumePreserveUndoHistoryForPrefabReload = () => ({ preserveUndoHistory: false, editorSession: null });
    clearPreserveUndoHistoryForPrefabReload = () => {};
} }));

import { PrefabWriteCoordinator } from '../main-process/prefab-write-coordinator';
import { PrefabWriteHost } from '../main-process/prefab-write-host';
import { EditorService } from '../scene-process/service/editor';
import { PrefabService } from '../scene-process/service/prefab';
import { prefabWriteSession } from '../scene-process/service/prefab/write-session';

// Real notification, scheduler, editor lifecycle and Host occupancy; only engine I/O is replaced.
describe('Prefab instance synchronization after an edit overlaps debounce', () => {
    let disk: string;
    const releases: Array<() => Promise<void>> = [];
    beforeEach(async () => {
        jest.useFakeTimers();
        disk = 'original';
        mockDirty = false;
        const host = new PrefabWriteHost(new PrefabWriteCoordinator({
            read: async () => Buffer.from(disk), write: async (_uuid, content) => { disk = content; },
        }));
        mockRequest.mockReset().mockImplementation(async (module: string, method: string, args: string[]) => {
            if (module === 'assetManager') {
                if (method === 'queryAssetDependencies') return [];
                return { uuid: args[0], type: args[0] === 'asset' ? 'cc.Prefab' : 'cc.SceneAsset', name: args[0], url: `db://assets/${args[0]}` };
            }
            return (host as unknown as Record<string, (...values: unknown[]) => unknown>)[method](...args);
        });
        mockReload.mockReset().mockResolvedValue({});
        mockEmit.mockClear();
        mockEditor = new EditorService();
        mockPrefab = new PrefabService();
        await mockEditor.open({ urlOrUUID: 'scene' });
        prefabWriteSession.loaded(await prefabWriteSession.readSource('asset'));
        mockClearHistory.mockClear();
        disk = 'updated';
    });
    afterEach(async () => {
        mockPrefab.onEditorDisposed();
        for (const release of releases.splice(0)) await release();
        await prefabWriteSession.close();
        jest.useRealTimers();
    });
    const beginEdit = async () => {
        const release = await prefabWriteSession.acquire();
        releases.push(release);
        return release;
    };

    it('retries after the edit ends and preserves history created during debounce', async () => {
        await mockPrefab.onAssetChanged('asset');
        const release = await beginEdit();
        await jest.advanceTimersByTimeAsync(500);
        expect(mockReload).not.toHaveBeenCalled();
        mockDirty = true;
        await release();
        await jest.advanceTimersByTimeAsync(500);
        expect(mockReload).toHaveBeenCalledTimes(1);
        expect(mockClearHistory).not.toHaveBeenCalled();
        expect(prefabWriteSession.baseline('asset').content).toBe('updated');
        expect(mockEmit).toHaveBeenCalledWith('prefab:asset-reload', 'asset');
    });

    it('rechecks dirty state even when the edit finishes before debounce expires', async () => {
        await mockPrefab.onAssetChanged('asset');
        await prefabWriteSession.edit(async () => { mockDirty = true; });
        await jest.advanceTimersByTimeAsync(500);
        expect(mockReload).toHaveBeenCalledTimes(1);
        expect(mockClearHistory).not.toHaveBeenCalled();
    });

    it('coalesces duplicate notifications and survives another edit before the retry', async () => {
        await mockPrefab.onAssetChanged('asset');
        const release = await beginEdit();
        await jest.advanceTimersByTimeAsync(500);
        await mockPrefab.onAssetChanged('asset');
        await release();
        const releaseAgain = await beginEdit();
        await jest.advanceTimersByTimeAsync(500);
        expect(mockReload).not.toHaveBeenCalled();
        await releaseAgain();
        await jest.advanceTimersByTimeAsync(500);
        expect(mockReload).toHaveBeenCalledTimes(1);
        expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it('does not replay a deferred notification into a replacement editor session', async () => {
        await mockPrefab.onAssetChanged('asset');
        const release = await beginEdit();
        await jest.advanceTimersByTimeAsync(500);
        mockPrefab.onEditorDisposed();
        await release();
        await mockEditor.close({ save: false });
        await mockEditor.open({ urlOrUUID: 'other-scene' });
        await jest.advanceTimersByTimeAsync(1000);
        expect(mockReload).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });
});
