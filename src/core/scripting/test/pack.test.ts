import { project } from '../../project/script';
import { PackerDriver } from '../packer-driver';
import { project as projectPath, engine as enginePath } from '../../../../.user.json';


/**
 * pack 类的测试 
 */
describe('Pack', () => {
    let packDriver: PackerDriver;

    beforeEach(async () => {
        await project.create(projectPath);
        // 在每个测试用例之前初始化engine
        packDriver = await PackerDriver.create(projectPath, enginePath);
    });

    it('test script pack', async () => {
        await packDriver.build();
        // @ts-ignore
        // expect(packDriver.queryScriptDeps()).toBeDefined();
    }, 1000 * 60 * 50);
});