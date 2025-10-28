import type { ICloseSceneOptions } from '../common';
import type { ISceneWorkerEvents } from '../main-process/scene-worker';

import { Scene } from '../main-process';
import { SceneProxy } from '../main-process/proxy/scene-proxy';
import * as utils from './utils';

describe('场景进程测试', () => {
    it('closeScene - 关闭场景', async () => {
        const closeOptions: ICloseSceneOptions = {};
        const result = await SceneProxy.close(closeOptions);
        expect(result).toBe(true);
    });

    it('queryCurrentScene - 关闭后获取当前场景应该为空', async () => {
        const result = await SceneProxy.queryCurrentScene();
        expect(result).toBeNull();
    });

    it('场景进程重启操作', async () => {
        const eventRestartPromise = utils.once<ISceneWorkerEvents>(Scene.worker, 'restart');
        Scene.worker.process.kill('SIGSEGV');
        const done = await eventRestartPromise;
        expect(done).toBe(true);
    }, 1000 * 60 * 2);

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
