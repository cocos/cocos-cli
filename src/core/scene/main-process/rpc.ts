import type { ChildProcess } from 'child_process';
import type { IPublicServiceManager } from '../scene-process';
import { ProcessRPC } from '../process-rpc';
import {
    ISceneCommandProvider,
    SceneCommandRequestOptions,
    SceneCommandProviderRegistration,
    WorkerSceneCommandProvider,
} from './scene-command-provider';
import { SceneHostLocalExecutor } from './scene-host-local-executor';

type AnySceneMethod = (...args: any[]) => any;
type SceneServiceMethod<
    K extends keyof IPublicServiceManager,
    M extends keyof IPublicServiceManager[K],
> = Extract<IPublicServiceManager[K][M], AnySceneMethod>;

export { ProcessRPC };
export type {
    ISceneCommandProvider,
    SceneCommandProviderRegistration,
    SceneCommandRequestOptions,
} from './scene-command-provider';
export { WorkerSceneCommandProvider } from './scene-command-provider';
export { SceneHostLocalExecutor } from './scene-host-local-executor';
export type { SceneHostModules } from './scene-host-local-executor';

/** Minimal interface exposed to callers by `Rpc.getInstance()`. */
export interface SceneRpcClient {
    request<K extends keyof IPublicServiceManager, M extends keyof IPublicServiceManager[K]>(
        module: K,
        method: M,
        ...rest: Parameters<SceneServiceMethod<K, M>> extends []
            ? [args?: [], options?: SceneCommandRequestOptions]
            : [args: Parameters<SceneServiceMethod<K, M>>, options?: SceneCommandRequestOptions]
    ): Promise<Awaited<ReturnType<SceneServiceMethod<K, M>>>>;

    notify<K extends keyof IPublicServiceManager, M extends keyof IPublicServiceManager[K]>(
        module: K,
        method: M,
        args?: Parameters<SceneServiceMethod<K, M>>,
    ): void;

    executeLocal(module: string, method: string, args?: any[]): Promise<any>;
    isConnect(): boolean | undefined;
}

export class RpcProxy implements SceneRpcClient {
    private commandProvider: ISceneCommandProvider | null = null;
    private commandProviderRegistration: SceneCommandProviderRegistration | null = null;
    private hostLocalExecutor: SceneHostLocalExecutor | null = null;

    public getInstance(): SceneRpcClient {
        if (!this.hostLocalExecutor) {
            throw new Error('[Node] Rpc instance is not started!');
        }
        return this;
    }

    public isConnect(): boolean | undefined {
        return this.commandProvider?.isConnect?.();
    }

    /**
     * Preserves the existing startup behavior:
     * - When a process is provided, `WorkerSceneCommandProvider` connects to the Scene Worker.
     * - Otherwise, only `SceneHostLocalExecutor` is initialized for the Scene Webview runtime.
     */
    startup(prc: ChildProcess | NodeJS.Process): SceneCommandProviderRegistration;
    startup(prc?: undefined): undefined;
    startup(prc?: ChildProcess | NodeJS.Process): SceneCommandProviderRegistration | undefined {
        // 在创建新实例前，先清理旧实例，防止内存泄漏
        this.dispose();
        this.ensureHostLocalExecutor();
        if (prc) {
            const registration = this.setCommandProvider(
                new WorkerSceneCommandProvider(prc),
            );
            console.log('[Node] Scene Process RPC ready (Attached)');
            return registration;
        }
        console.log('[Node] Scene Process RPC ready (Detached - Web Mode)');
        return undefined;
    }

    /**
     * Installs the host-provided `ISceneCommandProvider`.
     * Switches to the new provider before disposing the previous one. Errors from the new provider
     * propagate directly without falling back to another provider or retrying the request.
     */
    public setCommandProvider(provider: ISceneCommandProvider): SceneCommandProviderRegistration {
        if (!provider || typeof provider.request !== 'function') {
            throw new TypeError('[Node] Scene command provider must implement request()');
        }
        if (provider === this.commandProvider && this.commandProviderRegistration) {
            return this.commandProviderRegistration;
        }

        this.ensureHostLocalExecutor();
        const previousProvider = this.commandProvider;
        let disposed = false;
        const registration: SceneCommandProviderRegistration = {
            dispose: () => {
                if (disposed) {
                    return;
                }
                disposed = true;
                // A stale registration must not clear a newer provider, even when both use the same object.
                if (this.commandProviderRegistration !== registration) {
                    return;
                }
                this.commandProvider = null;
                this.commandProviderRegistration = null;
                this.disposeCommandProvider(provider);
            },
        };

        this.commandProvider = provider;
        this.commandProviderRegistration = registration;
        this.disposeCommandProvider(previousProvider);
        console.log('[Node] Scene command provider installed');
        return registration;
    }

    /** Clears and disposes the active Scene command provider. */
    public resetCommandProvider(): void {
        const provider = this.commandProvider;
        this.commandProvider = null;
        this.commandProviderRegistration = null;
        this.disposeCommandProvider(provider);
    }

    public request<K extends keyof IPublicServiceManager, M extends keyof IPublicServiceManager[K]>(
        module: K,
        method: M,
        ...rest: Parameters<SceneServiceMethod<K, M>> extends []
            ? [args?: [], options?: SceneCommandRequestOptions]
            : [args: Parameters<SceneServiceMethod<K, M>>, options?: SceneCommandRequestOptions]
    ): Promise<Awaited<ReturnType<SceneServiceMethod<K, M>>>> {
        const provider = this.commandProvider;
        if (!provider) {
            return Promise.reject(new Error('[Node] No Scene command provider is installed'));
        }

        const [args, options] = rest;
        return provider.request(
            String(module),
            String(method),
            (args ?? []) as any[],
            options,
        ) as Promise<Awaited<ReturnType<SceneServiceMethod<K, M>>>>;
    }

    public notify<K extends keyof IPublicServiceManager, M extends keyof IPublicServiceManager[K]>(
        module: K,
        method: M,
        args?: Parameters<SceneServiceMethod<K, M>>,
    ): void {
        const provider = this.commandProvider;
        if (!provider) {
            throw new Error('[Node] No Scene command provider is installed');
        }
        if (!provider.notify) {
            throw new Error('[Node] Scene command provider does not support notify()');
        }
        provider.notify(String(module), String(method), (args ?? []) as any[]);
    }

    public executeLocal(module: string, method: string, args: any[] = []): Promise<any> {
        const executor = this.hostLocalExecutor;
        if (!executor) {
            return Promise.reject(new Error('[Node] Scene host local executor is not started!'));
        }
        return executor.executeLocal(module, method, args);
    }

    /**
     * 清理 RPC 实例
     */
    dispose(): void {
        if (!this.commandProvider && !this.hostLocalExecutor) {
            return;
        }

        console.log('[Node] Disposing RPC instance');
        this.resetCommandProvider();
        try {
            this.hostLocalExecutor?.dispose();
        } catch (error) {
            console.warn('[Node] Error disposing Scene host local executor:', error);
        } finally {
            this.hostLocalExecutor = null;
        }
    }

    private ensureHostLocalExecutor(): SceneHostLocalExecutor {
        this.hostLocalExecutor ??= new SceneHostLocalExecutor();
        return this.hostLocalExecutor;
    }

    private disposeCommandProvider(provider: ISceneCommandProvider | null): void {
        if (!provider?.dispose) {
            return;
        }
        try {
            provider.dispose();
        } catch (error) {
            console.warn('[Node] Error disposing Scene command provider:', error);
        }
    }
}

export const Rpc = new RpcProxy();
