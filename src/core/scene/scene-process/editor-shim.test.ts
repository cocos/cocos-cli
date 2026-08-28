import { installSceneEditorShim } from './editor-shim';

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
