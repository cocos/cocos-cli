import { ensureEditorProjectPath } from '../../base/editor-shim';
import { Rpc } from './rpc';

export function installSceneEditorShim(projectPath: string): void {
    const editor = ensureEditorProjectPath(projectPath);

    if (!editor.__cliExtensionHost) {
        editor.__cliSceneProcess = true;
    }

    editor.I18n ??= {
        t: (key: string) => key,
    };
    // Engine editor-mode asset loading queries CCON metadata through this contract.
    // Resolve it against the CLI host's own asset database, without an IDE bridge.
    editor.Message ??= {
        async request(channel: string, method: string, uuid: string) {
            if (channel !== 'asset-db' || method !== 'query-asset-info') {
                throw new Error(`Unsupported scene engine host request: ${channel}:${method}`);
            }
            return Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]);
        },
    };
}
