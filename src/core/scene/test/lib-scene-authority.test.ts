jest.mock('../index', () => ({ init: jest.fn().mockResolvedValue(undefined) }));

import { bindIdeSceneAuthority, bindIdeSceneAuthorityRpc } from '../../../lib/scene/scene';
import { pinkSceneAuthority } from '../main-process/pink-scene-authority';

describe('lib Scene authority integration', () => {
    it('binds an in-process IDE authority', async () => {
        const binding = bindIdeSceneAuthority({
            getActiveScene: jest.fn(),
            queryOpenedScenes: jest.fn(),
            open: jest.fn(),
        });

        expect(pinkSceneAuthority.isHostedByPink()).toBe(true);

        binding.dispose();
        expect(pinkSceneAuthority.isHostedByPink()).toBe(false);
    });

    it('accepts the cross-process authority RPC adapter', async () => {
        const request = jest.fn();
        const binding = bindIdeSceneAuthorityRpc({ request });

        expect(pinkSceneAuthority.isHostedByPink()).toBe(true);

        binding.dispose();
        expect(pinkSceneAuthority.isHostedByPink()).toBe(false);
    });
});
