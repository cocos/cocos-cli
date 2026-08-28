const rpcRequest = jest.fn();

jest.mock('../main-process/rpc', () => ({
    Rpc: {
        getInstance: () => ({ request: rpcRequest }),
    },
}));

import { requestSceneService } from '../main-process/proxy/scene-authority-request';
import { pinkSceneAuthority } from '../main-process/pink-scene-authority';

describe('scene authority request routing', () => {
    let dispose: { dispose(): void } | undefined;

    beforeEach(() => {
        rpcRequest.mockReset();
    });

    afterEach(() => {
        dispose?.dispose();
        dispose = undefined;
    });

    it('uses the Node worker only outside the PinK extension host', async () => {
        rpcRequest.mockResolvedValue({ source: 'worker' });

        await expect(requestSceneService('Editor', 'queryCurrent')).resolves.toEqual({ source: 'worker' });
        expect(rpcRequest).toHaveBeenCalledWith('Editor', 'queryCurrent', []);
    });

    it('uses the active PinK SceneInstance instead of the Node worker', async () => {
        const scene = {
            query: jest.fn().mockResolvedValue({ source: 'pink-webview' }),
        };
        dispose = pinkSceneAuthority.attach({
            getActiveScene: jest.fn().mockResolvedValue(scene),
            queryOpenedScenes: jest.fn().mockResolvedValue([scene]),
            open: jest.fn(),
        });

        await expect(requestSceneService('Editor', 'queryCurrent')).resolves.toEqual({ source: 'pink-webview' });
        expect(scene.query).toHaveBeenCalledWith({ path: '', includeChildren: undefined, includeComponents: undefined });
        expect(rpcRequest).not.toHaveBeenCalled();
    });

    it('returns no partial asset metadata after saving through PinK', async () => {
        const scene = {
            save: jest.fn().mockResolvedValue(undefined),
        };
        dispose = pinkSceneAuthority.attach({
            getActiveScene: jest.fn().mockResolvedValue(scene),
            queryOpenedScenes: jest.fn().mockResolvedValue([scene]),
            open: jest.fn(),
        });

        await expect(requestSceneService('Editor', 'save', [{}])).resolves.toBeUndefined();
        expect(scene.save).toHaveBeenCalledTimes(1);
        expect(rpcRequest).not.toHaveBeenCalled();
    });

    it('uses the authority RPC adapter supplied by the IDE utility host', async () => {
        const request = jest.fn().mockResolvedValue({ source: 'hierarchy-webview' });
        dispose = pinkSceneAuthority.attachRpc({ request });

        await expect(requestSceneService('Node', 'query', [{ path: '' }])).resolves.toEqual({ source: 'hierarchy-webview' });
        expect(request).toHaveBeenCalledWith('Node', 'query', [{ path: '' }]);
        expect(rpcRequest).not.toHaveBeenCalled();
    });

    it('does not fall back to the worker when PinK has no active scene', async () => {
        dispose = pinkSceneAuthority.attach({
            getActiveScene: jest.fn().mockResolvedValue(undefined),
            queryOpenedScenes: jest.fn().mockResolvedValue([]),
            open: jest.fn(),
        });

        await expect(requestSceneService('Editor', 'queryCurrent')).resolves.toBeNull();
        await expect(requestSceneService('Node', 'query', [{ path: '' }])).rejects.toThrow('No active PinK scene editor');
        expect(rpcRequest).not.toHaveBeenCalled();
    });

    it('uses the only hierarchy scene when a non-scene editor has focus', async () => {
        const scene = {
            openEditor: true,
            query: jest.fn().mockResolvedValue({ source: 'opened-hierarchy-scene' }),
        };
        dispose = pinkSceneAuthority.attach({
            getActiveScene: jest.fn().mockResolvedValue(undefined),
            queryOpenedScenes: jest.fn().mockResolvedValue([scene]),
            open: jest.fn(),
        });

        await expect(requestSceneService('Editor', 'queryCurrent')).resolves.toEqual({ source: 'opened-hierarchy-scene' });
        expect(rpcRequest).not.toHaveBeenCalled();
    });
});
