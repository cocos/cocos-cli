import { Scene } from '../main-process';

describe('退出场景进程测试', () => {
    it('关闭场景进程', async () => {
        // 启动场景进程
        let killed = false;
        try {
            killed = await Scene.worker.stop();
        } catch (error) {
            console.error(error);
        }
        expect(killed).toBe(true);
    });
});
