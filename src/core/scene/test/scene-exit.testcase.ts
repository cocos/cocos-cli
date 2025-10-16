import { Scene } from '../main-process';
import type { ICloseSceneOptions } from '../common';
import { SceneProxy } from '../main-process/proxy/scene-proxy';

describe('退出场景进程测试', () => {
    describe('场景关闭操作', () => {
        it('closeScene - 关闭场景', async () => {
            const closeOptions: ICloseSceneOptions = {};
            const result = await SceneProxy.close(closeOptions);
            expect(result).toBe(true);
        });

        it('queryCurrentScene - 关闭后获取当前场景应该为空', async () => {
            const result = await SceneProxy.queryCurrentScene();
            expect(result).toBeNull();
        });
    });

    describe('场景进程关闭操作', () => {
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
});
