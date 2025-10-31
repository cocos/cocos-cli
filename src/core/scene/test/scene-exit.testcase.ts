import type { ISceneWorkerEvents } from '../main-process/scene-worker';

import { Scene } from '../main-process';
import * as utils from './utils';

describe('场景进程测试', () => {
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
