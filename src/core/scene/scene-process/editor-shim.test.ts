import { installSceneEditorShim } from './editor-shim';
const mockRequest = jest.fn();
jest.mock('./rpc', () => ({ Rpc: { getInstance: () => ({ request: mockRequest }) } }));

describe('scene-process editor shim', () => {
    let previousEditor: any;

    beforeEach(() => {
        previousEditor = (globalThis as any).Editor;
        delete (globalThis as any).Editor;
    });

    afterEach(() => {
        if (previousEditor === undefined) {
            delete (globalThis as any).Editor;
        } else {
            (globalThis as any).Editor = previousEditor;
        }
    });

    it('installs the project path used by userland macro modules', () => {
        installSceneEditorShim('D:/project');

        expect((globalThis as any).Editor.Project.path).toBe('D:/project');
    });

    it('resolves engine asset metadata through the CLI host without an IDE', async () => {
        installSceneEditorShim('D:/project');
        const info = { uuid: 'asset', library: { '.bin': 'asset.bin' } };
        mockRequest.mockResolvedValueOnce(info);
        const message = (globalThis as any).Editor.Message;
        await expect(message.request('asset-db', 'query-asset-info', 'asset')).resolves.toEqual(info);
        expect(mockRequest).toHaveBeenCalledWith('assetManager', 'queryAssetInfo', ['asset']);
        await expect(message.request('ide', 'unknown', 'asset')).rejects.toThrow('Unsupported scene engine host request');
    });

    it('preserves an existing Editor object while refreshing Project.path', () => {
        const request = jest.fn();
        (globalThis as any).Editor = {
            Message: { request },
            Project: { path: 'D:/old-project', name: 'old-project' },
        };

        installSceneEditorShim('D:/new-project');

        expect((globalThis as any).Editor.Message.request).toBe(request);
        expect((globalThis as any).Editor.Project).toEqual({
            path: 'D:/new-project',
            name: 'old-project',
        });
    });
});
