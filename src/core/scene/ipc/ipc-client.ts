import type { TIpcRequest, TIpcResponse, } from '../common';
import { randomUUID } from 'crypto';

export type MethodKeys<T> = {
    [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

export type MethodParams<T, K extends keyof T> =
    T[K] extends (...args: infer P) => any ? P : never;

export type MethodReturn<T, K extends keyof T> =
    T[K] extends (...args: any[]) => infer R ? R : never;

export class IpcClient<TModules extends Record<string, any>> {
    constructor(private process: NodeJS.Process, private modules: TModules) {}

    async request<
        M extends keyof TModules,
        K extends MethodKeys<TModules[M]>
    >(
        moduleName: M,
        method: K,
        ...args: MethodParams<TModules[M], K>
    ): Promise<Awaited<MethodReturn<TModules[M], K>>> {
        const id: string = `${moduleName.toString()}-${method.toString()}:${randomUUID()}`;
        return new Promise<Awaited<MethodReturn<TModules[M], K>>>((resolve, reject) => {
            const onMessage = (msg: TIpcResponse) => {
                if (msg.id === id) {
                    this.process.off('message', onMessage);
                    if (msg.error) {
                        reject(new Error(msg.error));
                    } else {
                        resolve(msg.data as any as Awaited<MethodReturn<TModules[M], K>>);
                    }
                }
            };

            this.process.on('message', onMessage);

            const message: TIpcRequest = {
                id,
                channel: moduleName as string,
                methodName: method as string,
                params: [...args],
            };

            this.process.send?.(message);
        });
    }

    send<
        M extends keyof TModules,
        K extends MethodKeys<TModules[M]>
    >(moduleName: M, method: K, ...args: MethodParams<TModules[M], K>) {
        const message: TIpcRequest = {
            channel: moduleName as string,
            methodName: method as string,
            params: [...args],
        };
        this.process.send?.(message);
    }
}
