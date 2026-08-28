import { init as sceneInit } from '../../core/scene';
import { GlobalPaths } from '../../global';
import { pinkSceneAuthority, type IPinkSceneApi, type ISceneAuthorityRpc } from '../../core/scene/main-process/pink-scene-authority';
import { createPinkSceneAuthorityRpc } from '../../core/scene/main-process/pink-scene-authority-bridge';

let ideSceneAuthorityDispose: { dispose(): void } | undefined;

/**
 * Bind the scene API exposed by the IDE runtime.
 *
 * `src/lib` is loaded by the cocos-code utility process. In that process the
 * PinK scene API already routes to the WebView used by Hierarchy, so it is the
 * only valid authority for MCP scene operations. This is intentionally a
 * facade API, not an extension activation hook.
 */
export function bindIdeSceneAuthority(sceneApi: IPinkSceneApi): { dispose(): void } {
    return replaceIdeSceneAuthority(pinkSceneAuthority.attach(sceneApi));
}

/**
 * Bind the authority RPC supplied by PinK's cocos-code utility host.
 *
 * The utility process cannot receive a SceneInstance object directly. The
 * adapter must forward each request to the IDE process that owns Hierarchy's
 * Scene WebView.
 */
export function bindIdeSceneAuthorityRpc(authorityRpc: ISceneAuthorityRpc): { dispose(): void } {
    return replaceIdeSceneAuthority(pinkSceneAuthority.attachRpc(authorityRpc));
}

function replaceIdeSceneAuthority(registration: { dispose(): void }): { dispose(): void } {
    ideSceneAuthorityDispose?.dispose();
    const handle = {
        dispose: () => {
            if (ideSceneAuthorityDispose === handle) {
                ideSceneAuthorityDispose = undefined;
            }
            registration.dispose();
        },
    };
    ideSceneAuthorityDispose = handle;
    console.info('[Cocos CLI] IDE scene authority attached through lib facade.');
    return handle;
}

/**
 * Initialize the scene module.
 * Registers the scene middleware and initializes scene config.
 */
export async function init(): Promise<void> {
    pinkSceneAuthority.expectIdeAuthority();
    await sceneInit();
}

/**
 * Start the scene worker process.
 *
 * @param projectPath Path to the project directory
 */
export async function startupWorker(_projectPath: string): Promise<void> {
    if (!pinkSceneAuthority.isHostedByPink()) {
        bindIdeSceneAuthorityRpc(createPinkSceneAuthorityRpc(_projectPath));
        console.info('[Cocos CLI] PinK scene authority RPC bridge configured.');
    }

    // The worker remains necessary for the scene WebView's bootstrap services
    // (i18n, asset and engine RPC). It must not be used as the MCP authority:
    // requestSceneService is already bound above and routes scene operations
    // to Hierarchy's SceneInstance instead.
    const { sceneWorker } = await import('../../core/scene/main-process/scene-worker');
    await sceneWorker.start(GlobalPaths.enginePath, _projectPath);
    console.info('[Cocos CLI] Scene worker started for Scene WebView infrastructure; MCP uses the PinK authority bridge.');
}
