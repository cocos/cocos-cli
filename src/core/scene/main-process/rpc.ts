import { ProcessRPC } from '../process-rpc';
import { ChildProcess } from 'child_process';
import { assetManager } from '../../assets';
import scriptManager from '../../scripting';
import { sceneConfigInstance } from '../scene-configs';

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

    public isConnect() {
        return this.rpcInstance?.isConnect();
    }

    async startup(prc: ChildProcess | NodeJS.Process) {
        // 在创建新实例前，先清理旧实例，防止内存泄漏
        this.dispose();
        this.rpcInstance = new ProcessRPC<IPublicServiceManager>();
        this.rpcInstance.attach(prc);
        this.rpcInstance.register({
            assetManager: assetManager,
            programming: scriptManager,
            sceneConfigInstance: sceneConfigInstance,
        });
        console.log('[Node] Scene Process RPC ready');
    }

    /**
     * 清理 RPC 实例
     */
    dispose(): void {
        if (this.rpcInstance) {
            console.log('[Node] Disposing RPC instance');
            try {
                this.rpcInstance.dispose();
            } catch (error) {
                console.warn('[Node] Error disposing RPC instance:', error);
            } finally {
                this.rpcInstance = null;
            }
        }
    }
}

export const Rpc = new RpcProxy();
