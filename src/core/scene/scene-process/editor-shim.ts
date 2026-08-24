import { ensureEditorProjectPath } from '../../base/editor-shim';

export function installSceneEditorShim(projectPath: string): void {
    const editor = ensureEditorProjectPath(projectPath);

    if (!editor.__cliExtensionHost) {
        editor.__cliSceneProcess = true;
    }

    editor.I18n ??= {
        t: (key: string) => key,
    };
}
