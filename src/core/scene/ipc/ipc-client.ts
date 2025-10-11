import type { IIpcMessage, IIpcReplyResponse, IIpcRequestOptions } from '../common';
import type { SceneServices, ServiceName, ServiceMethod, ServiceMethodParams, ServiceMethodReturn } from '../types/services';
import { randomUUID } from 'crypto';
import { ChildProcess } from 'child_process';

export type MethodKeys<T> = {
    [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

export type MethodParams<T, K extends keyof T> =
    T[K] extends (...args: infer P) => any ? P : never;

export type MethodReturn<T, K extends keyof T> =
    T[K] extends (...args: any[]) => infer R ? R : never;

export class IpcClient<TModules extends Record<string, any>> {
    private replyMap: Map<string, { resolve: Function; reject: Function; timeoutId: NodeJS.Timeout }> = new Map();

    constructor(
        private port: number,
        private process: NodeJS.Process | ChildProcess,
        private modules: TModules,
    ) {
        this.setupMessageListener();
    }

    private setupMessageListener() {
        this.process.on('message', (msg: IIpcReplyResponse) => {
            if (msg.port !== this.port) return;
            if (msg.id && msg.reply) {
                const resolver = this.replyMap.get(msg.id);
                if (resolver) {
                    clearTimeout(resolver.timeoutId);
                    this.replyMap.delete(msg.id);
                    if (msg.error) {
                        resolver.reject(new Error(msg.error));
                    } else {
                        resolver.resolve(msg.result);
                    }
                }
            }
        });
    }

    /**
     * 请求场景服务消息（有回复）- 提供类型提示
     * @param channel - 服务名
     * @param method - 方法名
     * @param args - 方法参数
     * @param options - 请求选项
     * @returns 
     */
    async request<
        S extends ServiceName,
        M extends ServiceMethod<S>
    >(
        channel: S,
        method: M,
        args: ServiceMethodParams<S, M>,
        options?: IIpcRequestOptions
    ): Promise<Awaited<ServiceMethodReturn<S, M>>>;

    /**
     * 请求消息（有回复）
     * @param channel - 模块名或者是事件名
     * @param method - 方法名
     * @param args - 方法参数
     * @param options - 请求选项
     * @returns 
     */
    async request<
        M extends keyof TModules,
        K extends MethodKeys<TModules[M]>
    >(
        channel: M,
        method: K,
        args: MethodParams<TModules[M], K>,
        options: IIpcRequestOptions = {}
    ): Promise<Awaited<MethodReturn<TModules[M], K>>> {
        const id: string = `${channel.toString()}-${method.toString()}:${randomUUID()}`;

        return new Promise<Awaited<MethodReturn<TModules[M], K>>>((resolve, reject) => {
            const timeout = options.timeout || 30000; // 默认30秒超时
            const timeoutId = setTimeout(() => {
                this.replyMap.delete(id);
                reject(new Error(`Request timeout after ${timeout}ms: ${channel.toString()}.${method.toString()}`));
            }, timeout);

            this.replyMap.set(id, { resolve, reject, timeoutId });

            const message: IIpcMessage = {
                id,
                channel: channel as string,
                method: method as string,
                params: args,
                reply: true,
            };

            this.process.send?.(message);
        });
    }

    /**
     * 发送消息（无回复）
     * @param channel 模块名或者是事件名
     * @param method 方法名
     * @param args 方法参数
     */
    send<
        M extends keyof TModules,
        K extends MethodKeys<TModules[M]>
    >(channel: M, method: K, ...args: MethodParams<TModules[M], K>) {
        const message: IIpcMessage = {
            channel: channel as string,
            method: method as string,
            params: [...args],
            reply: false,
        };
        this.process.send?.(message);
    }
}
