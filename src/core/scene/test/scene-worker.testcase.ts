import { Scene } from '../main-process';

describe('Scene 测试', () => {
    const user = require('../../../../.user.json');
    const enginePath = user.engine;
    const projectPath = user.project;

    it('准备阶段', async () => {
        const TestUtils = await import('../../base/test-utils');
        await TestUtils.fastStartup(enginePath, projectPath);
    })

    it('启动场景进程', async () => {
        // 启动场景进程
        const result = await Scene.worker.start(enginePath, projectPath);
        expect(result).toBe(true);
    });

});
