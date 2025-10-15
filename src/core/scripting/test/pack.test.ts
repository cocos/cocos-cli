import { PackerDriver } from '../packer-driver';
import { project as projectPath, engine as enginePath } from '../../../../.user.json';

/**
 * pack 类的测试 
 */
describe('Pack', () => {
    let packDriver: PackerDriver;

    it('准备阶段', async () => {
        const TestUtils = await import('../../base/test-utils');
        const core = await TestUtils.fastStartup(enginePath, projectPath);
        packDriver = core.packDriver;
    })

    it('test script pack', async () => {
        await packDriver.build();
        // @ts-ignore
        // expect(packDriver.queryScriptDeps()).toBeDefined();
    }, 1000 * 60 * 50);
});