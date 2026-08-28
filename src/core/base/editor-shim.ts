export function ensureEditorProjectPath(projectPath: string): any {
    const globalObject = globalThis as any;

    if (!globalObject.Editor || typeof globalObject.Editor !== 'object') {
        globalObject.Editor = {};
    }

    globalObject.Editor.Project = {
        ...(globalObject.Editor.Project ?? {}),
        path: projectPath,
    };

    return globalObject.Editor;
}
