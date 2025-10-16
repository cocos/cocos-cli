import { Scene } from '../main-process';
import { SceneTestEnv } from './scene-test-env';

describe('Scene 测试', () => {
    it('启动场景进程', async () => {
        // 启动场景进程
        const result = await Scene.worker.start(SceneTestEnv.enginePath, SceneTestEnv.projectPath);
        expect(result).toBe(true);
    });
});
