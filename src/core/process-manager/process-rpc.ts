// process-rpc.ts
import { ChildProcess } from 'child_process';

/**
 * RPC Message Type
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
 * Options for request
 */
interface RequestOptions {
    timeout?: number; // 毫秒
}

/**
 * Bidirectional RPC Class
 * TModules is the collection of registered module interfaces
 *
 * Usage Example:
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
 * // Assuming we are in the main process
 * const rpc = new ProcessRPC<{ node: INodeService; scene: ISceneService }>(childProcess);
 *
 * // Register object instance
 * rpc.register('scene', {
 *   async loadScene(id: string) {
 *     console.log('Scene loaded:', id);
 *     return true;
 *   }
 * });
 *
 * // Register class instance
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
 * // Call specific process method
 * const nodeName = await rpc.request('node', 'createNode', ['Player']);
 *
 * // Send one-way notification
 * rpc.send('scene', 'loadScene', ['Level01']);
 */
export class ProcessRPC<TModules extends Record<string, any>> {
    private handlers: Record<string, any> = {};
    private callbacks = new Map<number, (msg: RpcResponse) => void>();
    private msgId = 0;
    private process: NodeJS.Process | ChildProcess | undefined;
    private onMessageBind = this.onMessage.bind(this);

    /**
     * @param proc - NodeJS.Process or ChildProcess instance
     */
    attach(proc: NodeJS.Process | ChildProcess) {
        this.dispose();
        this.process = proc;
        this.listen();
    }

    /**
     * Register module, supports only object or class instances
     * @param handler - 注册模块列表
     */
    register(handler: Record<string, any>) {
        this.handlers = handler;
    }

    /**
     * Reset message registration
     */
    public dispose() {
        // Idempotent check - prevent double dispose
        if (!this.process && this.callbacks.size === 0 && Object.keys(this.handlers).length === 0) {
            return;
        }
        
        this.msgId = 0;
        // Reject all pending callbacks
        for (const [id, callback] of Array.from(this.callbacks)) {
            // We construct a mock response with error to trigger the callback's rejection logic
            callback({
                id,
                type: 'response',
                error: 'Process disconnected or RPC disposed'
            });
        }
        this.callbacks.clear();
        // Clear handlers to prevent memory leaks
        this.handlers = {};
        if (this.process) {
            this.process.off('message', this.onMessageBind);
        }
        this.process = undefined;
    }

    /**
     * Is connected
     */
    public isConnect() {
        return this.process?.connected;
    }

    /**
     * Listen for incoming messages
     */
    private listen() {
        if (!this.process) {
            throw new Error('Process not attached');
        }
        this.process.on('message', this.onMessageBind);
    }

    private async onMessage(msg: RpcMessage) {
        if (!msg || typeof msg !== 'object') return;

        // Remote Request
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

        // Response
        if (msg.type === 'response') {
            const callback = this.callbacks.get(msg.id);
            if (callback) {
                callback(msg);
                this.callbacks.delete(msg.id);
            }
        }

        // Notification
        if (msg.type === 'notify') {
            const { module, method, args } = msg;
            const target = this.handlers[module];
            if (target && typeof target[method] === 'function') {
                target[method](...(args || []));
            }
        }
    }

    /**
     * Reply
     * @param msg
     * @private
     */
    private reply(msg: RpcResponse) {
        if (!this.process) {
            console.warn(`[ProcessRPC] Cannot send reply, process not attached. MsgId: ${msg.id}`);
            return;
        }
        this.safeSend(msg);
    }

    /**
     * Safe send message, handle circular references and exceptions
     */
    private safeSend(msg: any) {
        try {
            this.process?.send?.(msg);
        } catch (error) {
            console.warn('[ProcessRPC] Send message failed, trying to sanitize circular reference...', error);
            try {
                const safeMsg = this.removeCircular(msg);
                this.process?.send?.(safeMsg);
            } catch (retryError) {
                console.error('[ProcessRPC] Send message failed even after sanitization:', retryError);
                if (msg.type === 'response' && msg.id) {
                    // 尝试发送一个最简单的错误响应
                    try {
                        this.process?.send?.({
                            id: msg.id,
                            type: 'response',
                            error: 'RPC Error: Response serialization failed'
                        });
                    } catch (e) {
                        // Give up
                    }
                }
            }
        }
    }

    private removeCircular(obj: any, cache = new Set()): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (cache.has(obj)) {
            return { __isCircular__: true };
        }
        cache.add(obj);

        if (Array.isArray(obj)) {
            return obj.map(v => this.removeCircular(v, new Set(cache)));
        }

        const copy: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                copy[key] = this.removeCircular(obj[key], cache);
            }
        }
        return copy;
    }

    /**
     * Send request and wait for response
     * @param module Module name
     * @param method Method name
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

            if (!this.process) {
                this.callbacks.delete(id);
                if (timer) clearTimeout(timer);
                reject(new Error('Process not attached'));
                return;
            }
            this.safeSend(req);
        });
    }

    /**
     * Send notification (no return value)
     */
    notify<K extends keyof TModules, M extends keyof TModules[K]>(
        module: K,
        method: M,
        args?: Parameters<TModules[K][M]>
    ) {
        if (!this.process) {
            console.warn(`[ProcessRPC] Cannot notify '${String(module)}.${String(method)}', process not attached.`);
            return;
        }
        const msg: RpcNotify = {
            type: 'notify',
            module: module as string,
            method: method as string,
            args: args || []
        };
        this.safeSend(msg);
    }
}
