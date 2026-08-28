const mockRpcRequest = jest.fn();

jest.mock('cc', () => ({
    __esModule: true,
    default: { director: { getScene: jest.fn(() => null) } },
    director: { getScene: jest.fn(() => null) },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: mockRpcRequest }) },
}));

jest.mock('../scene-process/service/core', () => ({
    BaseService: class {
        protected isOpen = false;
        protected emit() { }
        protected emitInternal() { }
        protected broadcast() { }
    },
    register: () => (target: unknown) => target,
    Service: {
        Undo: {
            clearHistory: jest.fn(),
            markSaved: jest.fn(),
        },
    },
}));

jest.mock('../scene-process/service/editors', () => ({
    SceneEditor: class SceneEditor {},
    PrefabEditor: class PrefabEditor {},
}));

import { globalEventEmitter } from '../scene-process/service/core/global-events';

const { EditorService } = require('../scene-process/service/editor');
const { SceneEditor } = require('../scene-process/service/editors');

describe('EditorService Save As', () => {
    let editorService: any;

    beforeEach(() => {
        editorService = new EditorService();
        mockRpcRequest.mockReset();
        mockRpcRequest.mockResolvedValue({});
        globalEventEmitter.removeAllListeners();
    });

    afterEach(() => {
        globalEventEmitter.removeAllListeners();
    });

    it('requires Save As for a target other than the existing source asset', async () => {
        const sourceUuid = 'source-uuid';
        const target = { uuid: 'target-uuid', url: 'db://assets/copied.scene', type: 'scene' };
        const editor = Object.assign(Object.create(SceneEditor.prototype), {
            save: jest.fn(),
            saveAs: jest.fn(),
        });
        editorService.editorMap.set(sourceUuid, editor);
        editorService.currentEditorUuid = sourceUuid;
        mockRpcRequest
            .mockResolvedValueOnce(target)
            .mockResolvedValueOnce({ uuid: sourceUuid, url: 'db://assets/source.scene', type: 'scene' });

        await expect(editorService.save({ urlOrUUID: target.url })).rejects.toThrow('请使用另存为');

        expect(editor.save).not.toHaveBeenCalled();
        expect(editor.saveAs).not.toHaveBeenCalled();
        expect(editorService.currentEditorUuid).toBe(sourceUuid);
    });

    it('uses Save As only to recover a deleted source and then reopens the target', async () => {
        const sourceUuid = 'source-uuid';
        const target = { uuid: 'target-uuid', url: 'db://assets/recovered.scene', type: 'scene' };
        const editor = Object.assign(Object.create(SceneEditor.prototype), {
            saveAs: jest.fn().mockResolvedValue(target),
        });
        const openUnlocked = jest.spyOn(editorService as any, 'openUnlocked').mockResolvedValue({});
        editorService.editorMap.set(sourceUuid, editor);
        editorService.currentEditorUuid = sourceUuid;
        mockRpcRequest
            .mockResolvedValueOnce(target)
            .mockResolvedValueOnce(null);

        try {
            await editorService.save({ urlOrUUID: target.url });

            expect(editor.saveAs).toHaveBeenCalledWith(target);
            expect(openUnlocked).toHaveBeenCalledWith({ urlOrUUID: target.uuid });
        } finally {
            openUnlocked.mockRestore();
        }
    });

    it('keeps the source editor identity and dirty state after Save As', async () => {
        const listener = jest.fn();
        globalEventEmitter.on('editor:save', listener);
        const sourceUuid = 'source-uuid';
        const target = { uuid: 'target-uuid', url: 'db://assets/copied.scene', type: 'scene' };
        const editor = Object.assign(Object.create(SceneEditor.prototype), {
            saveAs: jest.fn().mockResolvedValue(target),
        });
        const markSaved = jest.spyOn(editorService as any, '_markUndoSaved');
        editorService.editorMap.set(sourceUuid, editor);
        editorService.currentEditorUuid = sourceUuid;
        mockRpcRequest.mockResolvedValueOnce(target);

        await editorService.saveAs({ urlOrUUID: target.url });

        expect(editor.saveAs).toHaveBeenCalledWith(target);
        expect(editorService.currentEditorUuid).toBe(sourceUuid);
        expect(editorService.editorMap.get(sourceUuid)).toBe(editor);
        expect(editorService.editorMap.get(target.uuid)).toBeUndefined();
        expect(markSaved).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
    });

    it('requires an explicit target without changing the source editor', async () => {
        const sourceUuid = 'source-uuid';
        const editor = Object.assign(Object.create(SceneEditor.prototype), {
            saveAs: jest.fn(),
        });
        editorService.editorMap.set(sourceUuid, editor);
        editorService.currentEditorUuid = sourceUuid;

        await expect(editorService.saveAs({})).rejects.toThrow('另存为需要指定目标资源');

        expect(mockRpcRequest).not.toHaveBeenCalled();
        expect(editor.saveAs).not.toHaveBeenCalled();
        expect(editorService.currentEditorUuid).toBe(sourceUuid);
    });

    it('rejects a missing or incompatible target without changing the source editor', async () => {
        const sourceUuid = 'source-uuid';
        const target = { uuid: 'target-uuid', url: 'db://assets/copied.prefab', type: 'prefab' };
        const editor = Object.assign(Object.create(SceneEditor.prototype), {
            saveAs: jest.fn(),
        });
        editorService.editorMap.set(sourceUuid, editor);
        editorService.currentEditorUuid = sourceUuid;

        mockRpcRequest.mockResolvedValueOnce(null);
        await expect(editorService.saveAs({ urlOrUUID: 'db://assets/missing.scene' })).rejects.toThrow('请求资源失败');

        mockRpcRequest.mockResolvedValueOnce(target);
        await expect(editorService.saveAs({ urlOrUUID: target.url })).rejects.toThrow('不能将 scene 保存到 prefab 资源');

        expect(editor.saveAs).not.toHaveBeenCalled();
        expect(editorService.currentEditorUuid).toBe(sourceUuid);
    });

    it('rejects an inconsistent Save As result without changing the source editor', async () => {
        const sourceUuid = 'source-uuid';
        const target = { uuid: 'target-uuid', url: 'db://assets/copied.scene', type: 'scene' };
        const editor = Object.assign(Object.create(SceneEditor.prototype), {
            saveAs: jest.fn().mockResolvedValue({ ...target, uuid: 'unexpected-uuid' }),
        });
        editorService.editorMap.set(sourceUuid, editor);
        editorService.currentEditorUuid = sourceUuid;
        mockRpcRequest.mockResolvedValueOnce(target);

        await expect(editorService.saveAs({ urlOrUUID: target.url })).rejects.toThrow('保存目标资源标识不一致');

        expect(editorService.currentEditorUuid).toBe(sourceUuid);
        expect(editorService.editorMap.get(sourceUuid)).toBe(editor);
        expect(editorService.editorMap.get(target.uuid)).toBeUndefined();
    });
});
