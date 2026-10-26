import type { ChildProcess } from 'child_process';
import { ProcessRPC } from '../process-rpc';
import type { IPublicServiceManager } from '../scene-process';
import { registerDefaultSceneHostModules } from './scene-host-local-executor';

export interface SceneCommandRequestOptions {
    timeout?: number;
}

/**
 * `ISceneCommandProvider` defines how Scene commands are dispatched.
 * Each call uses only the selected provider. Errors must propagate without retrying through
 * another provider.
 */
export interface ISceneCommandProvider {
    request(
        module: string,
        method: string,
        args?: any[],
        options?: SceneCommandRequestOptions,
    ): Promise<any>;
    notify?(module: string, method: string, args?: any[]): void;
    isConnect?(): boolean | undefined;
    dispose?(): void;
}

/** Ownership-bound registration returned when a provider is installed. */
export interface SceneCommandProviderRegistration {
    dispose(): void;
}

/** Default provider used by standalone cocos-cli to connect to the Scene Worker. */
export class WorkerSceneCommandProvider implements ISceneCommandProvider {
    private readonly rpc = new ProcessRPC<IPublicServiceManager>();

    constructor(process: ChildProcess | NodeJS.Process) {
        this.rpc.attach(process);
        registerDefaultSceneHostModules(this.rpc);
    }

    public request(
        module: string,
        method: string,
        args: any[] = [],
        options?: SceneCommandRequestOptions,
    ): Promise<any> {
        return this.rpc.request(module as any, method as any, args as any, options);
    }

    public notify(module: string, method: string, args: any[] = []): void {
        this.rpc.notify(module as any, method as any, args as any);
    }

    public isConnect(): boolean | undefined {
        return this.rpc.isConnect();
    }

    public dispose(): void {
        this.rpc.dispose();
    }
}
