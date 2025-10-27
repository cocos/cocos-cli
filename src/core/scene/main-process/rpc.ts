import { ProcessRPC } from '../process-rpc';
import { ChildProcess } from 'child_process';
import { assetManager } from '../../assets';
import scriptManager from '../../scripting';

import type { IPublicServiceManager } from '../scene-process';

export { ProcessRPC };

export class RpcProxy {
    private rpcInstance: ProcessRPC<IPublicServiceManager> | null = null;

    public getInstance() {
        if (!this.rpcInstance) {
            throw new Error('[Node] Rpc instance is not started!');
        }
        return this.rpcInstance;
    }

    async startup(prc: ChildProcess | NodeJS.Process) {
        this.rpcInstance = new ProcessRPC<IPublicServiceManager>();
        this.rpcInstance.attach(prc);
        this.rpcInstance.register({
            assetManager: assetManager,
            programming: scriptManager,
        });
        console.log('[Node] Scene Process RPC ready');
    }
}

export const Rpc = new RpcProxy();
