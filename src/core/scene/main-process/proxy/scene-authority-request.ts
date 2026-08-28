import { Rpc } from '../rpc';
import { pinkSceneAuthority } from '../pink-scene-authority';

/**
 * In PinK, always use its active SceneInstance, which is bound to the WebView
 * displayed by the hierarchy. Only standalone CLI runs use the Node worker.
 */
export async function requestSceneService<T = unknown>(module: string, method: string, args: unknown[] = []): Promise<T> {
    if (pinkSceneAuthority.isHostedByPink()) {
        return pinkSceneAuthority.request<T>(module, method, args);
    }

    if (pinkSceneAuthority.requiresIdeAuthority()) {
        throw new Error(
            '[Cocos CLI] IDE scene authority is unavailable. '
            + 'The cocos-code utility process must bind a Scene authority RPC before MCP scene operations.',
        );
    }

    return (Rpc.getInstance() as any).request(module, method, args) as Promise<T>;
}
