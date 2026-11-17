import { globalSetup } from '../../test/global-setup';
import { optionalEngineModule } from '../../engine/optional-module';

describe('effect pipeline capability', () => {
    beforeAll(async () => { await globalSetup(); });
    it('keeps classic imports usable and rejects explicit unavailable layout compilation', async () => {
        const effects = require('../asset-handler/assets/effect');
        const pipeline = optionalEngineModule<any>('cc/editor/custom-pipeline');
        await expect(effects.afterImport()).resolves.toBeUndefined();
        if (!pipeline?.LayoutGraphInfo) {
            await expect(effects.afterImport(true)).rejects.toMatchObject({ code: 'ENGINE_CAPABILITY_UNAVAILABLE' });
        }
    });
});
