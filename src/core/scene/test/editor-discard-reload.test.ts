const mockRpcRequest = jest.fn();

jest.mock('cc', () => ({
    __esModule: true,
    default: { director: { getScene: jest.fn(() => null) } },
}));
jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: mockRpcRequest }) },
}));
jest.mock('../scene-process/service/core', () => ({
    BaseService: class {
        protected isOpen = false;
        protected emit() {}
        protected emitInternal() {}
        protected broadcast() {}
    },
    register: () => (target: unknown) => target,
    queryRegisteredService: () => undefined,
    Service: { Undo: { clearHistory: jest.fn(), markSaved: jest.fn() } },
}));
jest.mock('../scene-process/service/editors', () => ({
    SceneEditor: class SceneEditor {},
    PrefabEditor: class PrefabEditor {},
}));

import { EditorService } from '../scene-process/service/editor';
import { SceneEditor, PrefabEditor } from '../scene-process/service/editors';
import { Service } from '../scene-process/service/core';
import { ReloadResult } from '../common/editor/type';

const source = { uuid: 'source-uuid', url: 'db://assets/source.scene', type: 'scene' };

function editorStub(Editor: { prototype: object } = SceneEditor) {
    return Object.assign(Object.create(Editor.prototype), {
        save: jest.fn(),
        close: jest.fn().mockResolvedValue(true),
        open: jest.fn().mockResolvedValue({ name: 'disk content' }),
        reload: jest.fn().mockResolvedValue({ name: 'live content' }),
    });
}

describe('EditorService explicit discard and reload from disk', () => {
    let service: any;
    let original: ReturnType<typeof editorStub>;
    let replacement: ReturnType<typeof editorStub>;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new EditorService();
        original = editorStub();
        replacement = editorStub();
        service.currentEditorUuid = source.uuid;
        service.isOpen = true;
        service.editorMap.set(source.uuid, original);
        jest.spyOn(service, 'createEditor').mockReturnValue(replacement);
        mockRpcRequest.mockReset().mockImplementation(async (_module, method, [uuid]) => {
            if (method === 'queryAssetInfo') return uuid === source.uuid || uuid === source.url ? source : null;
            if (method === 'reimportAsset') return source;
            throw new Error(`Unexpected write or RPC: ${method}`);
        });
    });

    it.each(['discard', 'reloadFromDisk'])('%s rejects missing/false consent without touching live state', async method => {
        for (const options of [undefined, {}, { discardChanges: false }]) {
            await expect(service[method](options)).rejects.toThrow('discardChanges: true');
        }
        expect(original.close).not.toHaveBeenCalled();
        expect(mockRpcRequest).not.toHaveBeenCalled();
        expect(Service.Undo.clearHistory).not.toHaveBeenCalled();
        expect(service.editorMap.get(source.uuid)).toBe(original);
    });

    it('discards without saving, including when the source file has been deleted', async () => {
        mockRpcRequest.mockResolvedValue(null);
        const session = service.getEditorSession();
        await expect(service.discard({ discardChanges: true })).resolves.toBe(true);
        expect(original.close).toHaveBeenCalledWith({ save: false });
        expect(original.save).not.toHaveBeenCalled();
        expect(service.isCurrentEditorSession(session)).toBe(false);
        expect(service.currentEditorUuid).toBeNull();
        expect(service.editorMap.size).toBe(0);
        expect(Service.Undo.clearHistory).toHaveBeenCalledTimes(1);
        expect(mockRpcRequest.mock.calls.every((call: any[]) => call[1] === 'queryAssetInfo')).toBe(true);
    });

    it('discards before reimporting and opens a new editor with no stale auto-save', async () => {
        const order: string[] = [];
        mockRpcRequest.mockImplementation(async (_module, method, [uuid]) => {
            if (method === 'queryAssetInfo') return source;
            if (method === 'reimportAsset') {
                expect(uuid).toBe(source.uuid);
                expect(service.editorMap.has(source.uuid)).toBe(false);
                expect(service.isOpen).toBe(false);
                order.push('reimport');
                return source;
            }
            throw new Error(`Unexpected write: ${method}`);
        });
        original.close.mockImplementation(async ({ save }: { save: boolean }) => {
            expect(save).toBe(false);
            order.push('discard');
            return true;
        });
        replacement.open.mockImplementation(async () => {
            expect(service.currentEditorUuid).toBeNull();
            order.push('open');
            return { name: 'fresh disk content' };
        });
        const oldSession = service.getEditorSession();
        await expect(service.reloadFromDisk({ discardChanges: true, includeChildren: false }))
            .resolves.toEqual({ name: 'fresh disk content' });
        expect(order).toEqual(['discard', 'reimport', 'open']);
        expect(original.save).not.toHaveBeenCalled();
        expect(original.close).toHaveBeenCalledTimes(1);
        expect(original.reload).not.toHaveBeenCalled();
        expect(service.editorMap.get(source.uuid)).toBe(replacement);
        expect(service.isCurrentEditorSession(oldSession)).toBe(false);
        expect(service.isOpen).toBe(true);
        expect(replacement.open).toHaveBeenCalledWith(source, expect.objectContaining({ includeChildren: false }));
    });

    it('preserves the editor and undo history when the source preflight fails', async () => {
        const session = service.getEditorSession();
        mockRpcRequest.mockResolvedValue(null);
        await expect(service.reloadFromDisk({ discardChanges: true })).rejects.toThrow();
        expect(original.close).not.toHaveBeenCalled();
        expect(original.save).not.toHaveBeenCalled();
        expect(Service.Undo.clearHistory).not.toHaveBeenCalled();
        expect(service.editorMap.get(source.uuid)).toBe(original);
        expect(service.isCurrentEditorSession(session)).toBe(true);
    });

    it.each(['import failure', 'changed identity'])('leaves the editor closed on %s after the confirmed discard', async failure => {
        mockRpcRequest.mockImplementation(async (_module, method) => {
            if (method === 'queryAssetInfo') return source;
            if (failure === 'import failure') throw new Error('import failed');
            return { ...source, uuid: 'another-source' };
        });
        await expect(service.reloadFromDisk({ discardChanges: true })).rejects.toThrow();
        expect(original.close).toHaveBeenCalledWith({ save: false });
        expect(original.save).not.toHaveBeenCalled();
        expect(replacement.open).not.toHaveBeenCalled();
        expect(service.currentEditorUuid).toBeNull();
        expect(service.editorMap.size).toBe(0);
        expect(service.isOpen).toBe(false);
    });

    it('leaves the editor closed if opening fails after the confirmed discard', async () => {
        replacement.open.mockRejectedValue(new Error('Cannot instantiate imported scene'));
        await expect(service.reloadFromDisk({ discardChanges: true })).rejects.toThrow('Cannot instantiate');
        expect(original.close).toHaveBeenCalledWith({ save: false });
        expect(original.save).not.toHaveBeenCalled();
        expect(service.currentEditorUuid).toBeNull();
        expect(service.editorMap.size).toBe(0);
        expect(service.isOpen).toBe(false);
    });

    it('treats discard as a no-op but rejects reload when no editor is open', async () => {
        service.currentEditorUuid = null;
        service.isOpen = false;
        service.editorMap.clear();
        await expect(service.discard({ discardChanges: true })).resolves.toBe(true);
        await expect(service.reloadFromDisk({ discardChanges: true })).rejects.toThrow('No scene/prefab');
        expect(mockRpcRequest).not.toHaveBeenCalled();
    });

    it.each(['discard', 'reloadFromDisk'])('%s does not discard a replacement session while queued', async method => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const switching = service.runLifecycle(async () => {
            await gate;
            service.invalidateEditorSession();
            service.editorMap.set(source.uuid, replacement);
        });
        const recovery = service[method]({ discardChanges: true });
        release();
        await switching;
        await expect(recovery).rejects.toThrow('session changed');
        expect(original.close).not.toHaveBeenCalled();
        expect(replacement.close).not.toHaveBeenCalled();
        expect(mockRpcRequest).not.toHaveBeenCalled();
    });

    it('supports prefab sources with the same explicit discard contract', async () => {
        const prefab = { ...source, type: 'prefab', url: 'db://assets/source.prefab' };
        original = editorStub(PrefabEditor);
        service.editorMap.set(source.uuid, original);
        mockRpcRequest.mockResolvedValue(prefab);
        await service.reloadFromDisk({ discardChanges: true });
        expect(original.close).toHaveBeenCalledWith({ save: false });
        expect(service.createEditor).toHaveBeenCalledWith('prefab');
        expect(original.save).not.toHaveBeenCalled();
    });

    it('keeps the legacy reload on the current in-memory editor without reimporting or closing', async () => {
        await expect(service.reload({ preserveUndoHistory: true })).resolves.toBe(ReloadResult.SUCCESS);
        expect(original.reload).toHaveBeenCalledTimes(1);
        expect(original.close).not.toHaveBeenCalled();
        expect(replacement.open).not.toHaveBeenCalled();
        expect(Service.Undo.clearHistory).not.toHaveBeenCalled();
        expect(mockRpcRequest).toHaveBeenCalledTimes(1);
        expect(mockRpcRequest).toHaveBeenCalledWith('assetManager', 'queryAssetInfo', [source.uuid]);
    });
});
