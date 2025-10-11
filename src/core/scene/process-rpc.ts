// process-rpc.ts
import { ChildProcess } from 'child_process';

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

interface RpcSend {
    type: 'send';
    module: string;
    method: string;
    args: any[];
}

type RpcMessage = RpcRequest | RpcResponse | RpcSend;

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

    /**
     * @param proc - NodeJS.Process 或 ChildProcess 实例
     */
    attach(proc: NodeJS.Process | ChildProcess) {
        this.process = proc;
        this.listen();
    }

    /**
     * 注册模块，只支持对象或者类实例
     * @param handler - 注册模块列表
     */
    register(handler: Record<string, any>) {
        this.handlers = handler;
    }

    /**
     * 监听 incoming 消息
     */
    private listen() {
        if (!this.process) {
            throw new Error('未挂载进程');
        }
        this.process.on('message', async (msg: RpcMessage) => {
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
            if (msg.type === 'send') {
                const { module, method, args } = msg;
                const target = this.handlers[module];
                if (target && typeof target[method] === 'function') {
                    target[method](...(args || []));
                }
            }
        });
    }

    private reply(msg: RpcResponse) {
        if (!this.process) {
            throw new Error('未挂载进程');
        }
        this.process.send?.(msg);
    }

    /**
     * 发起 RPC 请求
     * @param module 模块名
     * @param method 方法名
     * @param args 参数数组
     * @param options 额外选项，如 timeout
     */
    request<K extends keyof TModules, M extends keyof TModules[K]>(
        module: K,
        method: M,
        args?: Parameters<TModules[K][M]>,
        options?: RequestOptions
    ): Promise<Awaited<ReturnType<TModules[K][M]>>> {
        return new Promise((resolve, reject) => {
            const id = ++this.msgId;

            const req: RpcRequest = {
                id,
                type: 'request',
                module: module as string,
                method: method as string,
                args: args || [],
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

            if (!this.process) {
                throw new Error('未挂载进程');
            }
            this.process.send?.(req);
        });
    }

    /**
     * 发送单向消息（无返回值）
     */
    send<K extends keyof TModules, M extends keyof TModules[K]>(
        module: K,
        method: M,
        args?: Parameters<TModules[K][M]>
    ) {
        if (!this.process) {
            throw new Error('未挂载进程');
        }
        const msg: RpcSend = {
            type: 'send',
            module: module as string,
            method: method as string,
            args: args || [],
        };
        this.process.send?.(msg);
    }
}
