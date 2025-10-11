import { ProcessRPC } from '../process-rpc';
import { ChildProcess } from 'child_process';
import { assetManager } from '../../assets';

import type { ISceneModule } from '../scene-process';

export { ISceneModule, ProcessRPC };

export const Rpc: ProcessRPC<ISceneModule> = new ProcessRPC<ISceneModule>();

export function startupRpc(prc: ChildProcess | NodeJS.Process) {
    Rpc.attach(prc);
    // 注册场景进程需要用到主进程的模块
    Rpc.register({
        'assetManager': assetManager
    });
    return Rpc;
}
