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

    /**
     * Phase 1: Attach process only, receive messages (prevent message loss)
     */
    init() {
        if (this.rpcInstance) {
            return;
        }
        this.rpcInstance = new ProcessRPC<IMainModule>();
        this.rpcInstance.attach(process);
        console.log('[Scene] Scene Process RPC attached');
    }

    /**
     * Phase 2: Register service
     */
    register(service: any) {
         if (!this.rpcInstance) {
             this.init();
         }
         this.rpcInstance!.register(service);
         console.log('[Scene] Scene Process RPC registered');
    }

    async startup() {
        // Cleanup old instance before creating new one to prevent memory leaks
        this.dispose();
        
        // 1. Attach first, ensure no message loss
        this.init();
        
        // 2. Load Service
        const { Service } = await import('./service/core/decorator');
        
        // 3. Register handlers
        this.register(Service);
        
        console.log('[Scene] Scene Process RPC ready');
    }

    /**
     * Cleanup RPC instance
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
