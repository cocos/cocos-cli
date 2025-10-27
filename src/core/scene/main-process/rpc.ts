import { ProcessRPC } from '../process-rpc';
import { ChildProcess } from 'child_process';
import { assetManager } from '../../assets';
import scriptManager from '../../scripting';

import type { IPublicServiceManager } from '../scene-process';

export { ProcessRPC };

export const Rpc: ProcessRPC<IPublicServiceManager> = new ProcessRPC<IPublicServiceManager>();

export function startupRpc(prc: ChildProcess | NodeJS.Process) {
    Rpc.attach(prc);
    // 注册场景进程需要用到主进程的模块
    Rpc.register({
        assetManager: assetManager,
        programming: scriptManager,
    });
    return Rpc;
}
