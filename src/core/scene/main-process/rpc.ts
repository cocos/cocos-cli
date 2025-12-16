import { ProcessManager, ProcessRPC } from '../../process-manager';
import { assetManager } from '../../assets';
import scriptManager from '../../scripting';
import { sceneConfigInstance } from '../scene-configs';


import type { IPublicServiceManager } from '../scene-process';

export { ProcessRPC };

export class RpcProxy {
    private manager: ProcessManager<IPublicServiceManager> | null = null;
    private rpcProxy: ProcessRPC<IPublicServiceManager> | null = null;

    public init(manager: ProcessManager<IPublicServiceManager>) {
        this.manager = manager;
        
        // Register handlers
        this.manager.rpc.register({
            assetManager: assetManager,
            programming: scriptManager,
            sceneConfigInstance: sceneConfigInstance,
        });
        
        // Create proxy to intercept calls for auto-start
        this.rpcProxy = new Proxy(this.manager.rpc, {
            get: (target, prop, receiver) => {
                const originalValue = Reflect.get(target, prop, receiver);

                // Intercept 'request'
                if (prop === 'request' && typeof originalValue === 'function') {
                    return async (...args: any[]) => {
                        if (this.manager && !this.manager.isRunning) {
                            console.log('[RpcProxy] Auto-starting scene process...');
                            await this.manager.ensureRunning();
                        }
                        return originalValue.apply(target, args);
                    };
                }

                // Intercept 'notify'
                if (prop === 'notify' && typeof originalValue === 'function') {
                    return (...args: any[]) => {
                        if (this.manager && !this.manager.isRunning) {
                            // Fire and forget start + send
                            console.log('[RpcProxy] Auto-starting scene process for notify...');
                            this.manager.ensureRunning().then(() => {
                                originalValue.apply(target, args);
                            }).catch(err => {
                                console.error('[RpcProxy] Failed to auto-start for notify:', err);
                            });
                            return; // Return void as expected
                        }
                        return originalValue.apply(target, args);
                    };
                }

                return originalValue;
            }
        });

        console.log('[Node] Scene Process RPC initialized with manager');
    }

    public getInstance() {
        if (!this.rpcProxy) {
            throw new Error('[Node] Rpc instance is not initialized! Call sceneWorker.start or ensure Rpc.init is called.');
        }
        return this.rpcProxy;
    }

    public isConnect() {
        return this.manager?.isRunning;
    }

    /**
     * @deprecated functionality moved to ProcessManager
     */
    async startup(prc: any) {
        console.warn('[RpcProxy] startup() is deprecated. Use init(manager) instead.');
    }

    dispose(): void {
        this.manager = null;
        this.rpcProxy = null;
    }
}

export const Rpc = new RpcProxy();
