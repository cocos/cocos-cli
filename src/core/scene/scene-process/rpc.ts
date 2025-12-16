import { ProcessRPC } from '../../process-manager';
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
        // 在创建新实例前，先清理旧实例，防止内存泄漏
        this.dispose();
        
        // 先加载 Service
        const { Service } = await import('./service/core/decorator');
        
        this.rpcInstance = new ProcessRPC<IMainModule>();
        // 先注册处理函数
        this.rpcInstance.register(Service);
        // 最后挂载进程，开始监听消息
        this.rpcInstance.attach(process);
        
        console.log('[Scene] Scene Process RPC ready');
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
