import { ProcessRPC } from '../process-rpc';
import type { IMainModule } from '../main-process';

export class RpcProxy {
    private rpcInstance: ProcessRPC<IMainModule> | null = null;

    public getInstance() {
        if (!this.rpcInstance) {
            throw new Error('[Scene] Rpc instance is not started!');
        }
        return this.rpcInstance;
    }

    async startup() {
        this.rpcInstance = new ProcessRPC<IMainModule>();
        this.rpcInstance.attach(process);
        const { Service } = await import('./service/core/decorator');
        this.rpcInstance.register(Service);
        console.log('[Scene] Scene Process RPC ready');
    }
}

export const Rpc = new RpcProxy();
