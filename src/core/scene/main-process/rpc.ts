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
                        // Check if manager is still valid (might be disposed)
                        if (!this.manager) {
                            throw new Error('[RpcProxy] Manager has been disposed. Cannot make RPC request.');
                        }
                        if (!this.manager.isRunning) {
                            console.log('[RpcProxy] Auto-starting scene process...');
                            await this.manager.ensureRunning();
                        }
                        return originalValue.apply(target, args);
                    };
                }

                // Intercept 'notify'
                if (prop === 'notify' && typeof originalValue === 'function') {
                    return (...args: any[]) => {
                        // Check if manager is still valid
                        if (!this.manager) {
                            console.warn('[RpcProxy] Manager has been disposed. Dropping notification.');
                            return;
                        }
                        if (!this.manager.isRunning) {
                            // Fire and forget start + send
                            const [module, method] = args;
                            console.log(`[RpcProxy] Auto-starting scene process for notify: ${module}.${method}`);
                            this.manager.ensureRunning().then(() => {
                                originalValue.apply(target, args);
                            }).catch(err => {
                                console.error(`[RpcProxy] Failed to auto-start for notify (${module}.${method}):`, err);
                                console.warn(`[RpcProxy] Notification dropped: ${module}.${method} - process failed to start`);
                            });
                            return; // Return void as expected
                        }
                        return originalValue.apply(target, args);
                    };
                }

                return originalValue;
            }
        });

        console.log('[RpcProxy] Scene Process RPC initialized with manager');
    }

    public getInstance() {
        if (!this.rpcProxy) {
            throw new Error('[RpcProxy] Rpc instance is not initialized! Call sceneWorker.start or ensure Rpc.init is called.');
        }
        if (!this.manager) {
            throw new Error('[RpcProxy] Manager has been disposed. RPC instance is no longer valid.');
        }
        return this.rpcProxy;
    }

    public isConnect() {
        return this.manager?.isRunning;
    }

    dispose(): void {
        this.manager = null;
        this.rpcProxy = null;
    }
}

export const Rpc = new RpcProxy();
