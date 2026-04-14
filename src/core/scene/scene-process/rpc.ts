import { ProcessRPC } from '../process-rpc';
import { FetchRPC } from './fetch-rpc';
import type { IMainModule } from '../main-process';

export class RpcProxy {
    private rpcInstance: ProcessRPC<IMainModule> | FetchRPC<IMainModule> | null = null;

    public getInstance() {
        if (!this.rpcInstance) {
            throw new Error('[Scene] Rpc instance is not started!');
        }
        return this.rpcInstance;
    }

    async startup(serverURL?: string) {
        // 在创建新实例前，先清理旧实例，防止内存泄漏
        this.dispose();
        const baseURL = serverURL || this._inferBaseURL();
        const isNode = typeof process !== 'undefined' && !!process.versions?.node;
        if (isNode) {
            this.rpcInstance = new FetchRPC<IMainModule>(baseURL);
        }
        else {
            this.rpcInstance = new ProcessRPC<IMainModule>();
            const { Service } = await import('./service/core/decorator');
            this.rpcInstance.register(Service);
        }
        console.log('[Scene] Scene Process RPC ready');
    }

    /**
     * 从当前页面 URL 推断 API 基地址
     */
    private _inferBaseURL(): string {
        if (typeof location !== 'undefined') {
            return location.origin;
        }
        return 'http://localhost:3000';
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
