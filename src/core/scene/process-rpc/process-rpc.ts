// process-rpc.ts
import { ChildProcess } from 'child_process';
import {setupProcessHandler} from '../../base/utils/process-err-handler';

/**
 * RPC 消息类型
 */
interface RpcRequest {
    id: number;
    type: 'request';
    module: string;
    method: string;
    args: any[];
}

interface RpcResponse {
    id: number;
    type: 'response';
    result?: any;
    error?: string;
}

interface RpcNotify {
    type: 'notify';
    module: string;
    method: string;
    args: any[];
}

type RpcMessage = RpcRequest | RpcResponse | RpcNotify;

/**
 * request 的 options
 */
interface RequestOptions {
    timeout?: number; // 毫秒
}

/**
 * 双向 RPC 类
 * TModules 为注册模块接口集合
 *
 * 使用示例：
 *
 * interface INodeService {
 *   createNode(name: string): Promise<string>;
 *   deleteNode(id: string): Promise<void>;
 * }
 *
 * interface ISceneService {
 *   loadScene(id: string): Promise<boolean>;
 * }
 *
 * // 假设我们在主进程
 * const rpc = new ProcessRPC<{ node: INodeService; scene: ISceneService }>(childProcess);
 *
 * // 注册对象实例
 * rpc.register('scene', {
 *   async loadScene(id: string) {
 *     console.log('Scene loaded:', id);
 *     return true;
 *   }
 * });
 *
 * // 注册类实例
 * class NodeService implements INodeService {
 *   async createNode(name: string) {
 *     return `Node:${name}`;
 *   }
 *   async deleteNode(id: string) {
 *     console.log('Node deleted:', id);
 *   }
 * }
 * rpc.register('node', new NodeService());
 *
 * // 调用子进程方法
 * const nodeName = await rpc.request('node', 'createNode', ['Player']);
 *
 * // 发送单向消息
 * rpc.send('scene', 'loadScene', ['Level01']);
 */
export class ProcessRPC<TModules extends Record<string, any>> {
    private handlers: Record<string, any> = {};
    private callbacks = new Map<number, (msg: RpcResponse) => void>();
    private msgId = 0;
    private process: NodeJS.Process | ChildProcess | undefined;
    private onMessageBind = this.onMessage.bind(this);
    private disposeBind = this.dispose.bind(this);

    /**
     * @param proc - NodeJS.Process 或 ChildProcess 实例
     */
    attach(proc: NodeJS.Process | ChildProcess, label: string = 'ProcessRPC') {
        process.stdout.write(`[ProcessRPC:${label}] Attaching to process\n`);
        this.dispose();
        this.process = proc;
        // @ts-ignore
        this.process.label = label;
        this.listen();
        setupProcessHandler(proc, label);
    }

    /**
     * 注册模块，只支持对象或者类实例
     * @param handler - 注册模块列表
     */
    register(handler: Record<string, any>) {
        this.handlers = handler;
    }

    /**
     * 重置消息注册
     */
    public dispose() {
        if (!this.process) {
            return;
        }

        const proc = this.process;
        // @ts-ignore
        const label = proc.label || 'unknown';
        process.stdout.write(`[ProcessRPC:${label}] Disposing\n`);

        this.process = undefined;

        try {
            if (typeof proc.off === 'function') {
                proc.off('message', this.onMessageBind);
                proc.off('disconnect', this.disposeBind);
                proc.off('exit', this.disposeBind);
            } else if (typeof (proc as any).removeListener === 'function') {
                (proc as any).removeListener('message', this.onMessageBind);
                (proc as any).removeListener('disconnect', this.disposeBind);
                (proc as any).removeListener('exit', this.disposeBind);
            }
        } catch (err) {
            process.stdout.write(`[ProcessRPC:${label}] Error during dispose off: ${err}\n`);
        }

        // Reject pending callbacks
        if (this.callbacks.size > 0) {
            process.stdout.write(`[ProcessRPC:${label}] Rejecting ${this.callbacks.size} pending callbacks\n`);
            for (const [id, callback] of this.callbacks) {
                callback({ id, type: 'response', error: `ProcessRPC [${label}] disposed or process disconnected` });
            }
            this.callbacks.clear();
        }

        this.msgId = 0;
    }

    /**
     * 是否连接
     */
    public isConnect() {
        return this.process?.connected;
    }

    /**
     * 监听 incoming 消息
     */
    private listen() {
        if (!this.process) {
            throw new Error('未挂载进程');
        }
        this.process.on('message', this.onMessageBind);
        this.process.once('disconnect', this.disposeBind);
        this.process.once('exit', this.disposeBind);
    }

    private async onMessage(msg: RpcMessage) {
        if (!msg || typeof msg !== 'object') return;

        // 远程请求
        if (msg.type === 'request') {
            const { id, module, method, args } = msg;
            const target = this.handlers[module];
            if (!target || typeof target[method] !== 'function') {
                this.reply({ id, type: 'response', error: `Method not found: ${module}.${method}` });
                return;
            }

            try {
                const result = await target[method](...(args || []));
                this.reply({ id, type: 'response', result });
            } catch (e: any) {
                this.reply({ id, type: 'response', error: e?.message || String(e) });
            }
        }

        // 响应
        if (msg.type === 'response') {
            const callback = this.callbacks.get(msg.id);
            if (callback) {
                callback(msg);
                this.callbacks.delete(msg.id);
            }
        }

        // 单向消息
        if (msg.type === 'notify') {
            const { module, method, args } = msg;
            const target = this.handlers[module];
            if (target && typeof target[method] === 'function') {
                try {
                    const result = target[method](...(args || []));
                    if (result instanceof Promise) {
                        result.catch(e => {
                            console.error(`[ProcessRPC] Error in async notify handler: ${module}.${method}`, e);
                        });
                    }
                } catch (e) {
                    console.error(`[ProcessRPC] Error in notify handler: ${module}.${method}`, e);
                }
            }
        }
    }

    /**
     * 回复
     * @param msg
     * @private
     */
    private reply(msg: RpcResponse) {
        if (!this.process || !this.process.connected) {
            console.warn(`[ProcessRPC] Cannot send reply, process is not connected. id:${msg.id}`);
            return;
        }
        this.process.send?.(msg);
    }

    /**
     * 发送请求并等待响应
     * @param module 模块名
     * @param method 方法名
     * @param rest
     */
    request<K extends keyof TModules, M extends keyof TModules[K]>(
        module: K,
        method: M,
        ...rest: Parameters<TModules[K][M]> extends []
            ? [args?: [], options?: RequestOptions]
            : [args: Parameters<TModules[K][M]>, options?: RequestOptions]
    ): Promise<Awaited<ReturnType<TModules[K][M]>>> {
        const [args, options] = rest;
        return new Promise((resolve, reject) => {
            const id = ++this.msgId;

            const req: RpcRequest = {
                id,
                type: 'request',
                module: module as string,
                method: method as string,
                args: args || []
            };

            const timer = options?.timeout
                ? setTimeout(() => {
                    this.callbacks.delete(id);
                    reject(new Error(`RPC request timeout: ${String(module)}.${String(method)}`));
                }, options.timeout)
                : null;

            this.callbacks.set(id, (res) => {
                if (timer) clearTimeout(timer);
                if (res.error) reject(new Error(res.error));
                else resolve(res.result);
            });

            if (!this.process || !this.process.connected) {
                this.callbacks.delete(id);
                if (timer) clearTimeout(timer);
                return reject(new Error(`RPC process is not connected. Cannot send request: ${String(module)}.${String(method)}`));
            }
            this.process.send?.(req);
        });
    }

    /**
     * 发送单向消息（无返回值）
     */
    public notify<K extends keyof TModules, M extends keyof TModules[K]>(
        module: K,
        method: M,
        args?: Parameters<TModules[K][M]>
    ) {
        if (!this.process || !this.process.connected) {
            console.warn(`[ProcessRPC] Cannot send notify, process is not connected. module:${String(module)}, method:${String(method)}`);
            return;
        }
        const msg: RpcNotify = {
            type: 'notify',
            module: module as string,
            method: method as string,
            args: args || []
        };
        this.process.send?.(msg);
    }
}
