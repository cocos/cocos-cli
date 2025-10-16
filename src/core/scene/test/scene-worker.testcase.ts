import { Scene } from '../main-process';
import { SceneTestEnv } from './scene-test-env';
import { PackerDriver } from '../../scripting/packer-driver';

describe('Scene 测试', () => {
    it('启动场景进程', async () => {
        // 启动场景进程
        const result = await Scene.worker.start(SceneTestEnv.enginePath, SceneTestEnv.projectPath);
        expect(result).toBe(true);
    });

    it('编译项目脚本', async () => {
        await PackerDriver.getInstance().build();
    });
});
