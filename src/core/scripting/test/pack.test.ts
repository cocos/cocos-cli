import { PackerDriver } from '../packer-driver';
import { globalSetup } from '../../test/global-setup';

/**
 * pack 类的测试 
 */
describe('Pack', () => {
    let packDriver: PackerDriver;
    beforeAll(async () => {
        await globalSetup();
        packDriver = PackerDriver.getInstance();
    });

    it('test script pack', async () => {
        await packDriver.build();
        // @ts-ignore
        // expect(packDriver.queryScriptDeps()).toBeDefined();
    }, 1000 * 60 * 50);
});