import { ProcessRPC } from '../process-rpc';
import type { IMainModule } from '../main-process';

export class RpcProxy {
    private rpcInstance: ProcessRPC<IMainModule> | null = null;
    private webServerUrl: string | undefined;

    public getInstance() {
        if (!this.rpcInstance) {
            throw new Error('[Scene] Rpc instance is not started!');
        }
        return this.rpcInstance;
    }

    /** Returns a URL only when this proxy owns the browser Web RPC transport. */
    public getWebServerUrl(): string | undefined {
        return this.webServerUrl;
    }

    async startup(options?: { serverURL: string }) {
        // 在创建新实例前，先清理旧实例，防止内存泄漏
        this.dispose();
        this.rpcInstance = new ProcessRPC<IMainModule>();
        if (options?.serverURL) {
            this.webServerUrl = options.serverURL;
            this.rpcInstance.setWebTransport(options.serverURL);
            console.log('[Scene] Scene Process Web RPC ready');
        } else {
            this.rpcInstance.attach(process);
            const { Service } = await import('./service/core/decorator');
            this.rpcInstance.register(Service);
            console.log('[Scene] Scene Process RPC ready');
        }
    }

    /**
     * 清理 RPC 实例
     */
    dispose(): void {
        if (!this.rpcInstance) {
            this.webServerUrl = undefined;
            return;
        }

        console.log('[Node] Disposing RPC instance');
        try {
            this.rpcInstance.dispose();
        } catch (error) {
            console.warn('[Node] Error disposing RPC instance:', error);
        } finally {
            this.rpcInstance = null;
            this.webServerUrl = undefined;
        }
    }
}

export const Rpc = new RpcProxy();
