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
 * 待处理的消息
 */
interface PendingMessage {
    type: 'request' | 'send';
    data: RpcRequest | RpcSend;
    resolve?: (value: any) => void;
    reject?: (error: any) => void;
    timeout?: NodeJS.Timeout;
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

    // 新增：待处理消息队列
    private pendingMessages: PendingMessage[] = [];
    // 新增：连接状态监听器
    private connectionListeners: Array<() => void> = [];

    /**
     * @param proc - NodeJS.Process 或 ChildProcess 实例
     */
    attach(proc: NodeJS.Process | ChildProcess) {
        this.resetListen();
        this.process = proc;
        this.listen();

        // 监听连接事件
        if ('connected' in proc) {
            this.setupConnectionListeners(proc);
        }
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
     * @private
     */
    private resetListen() {
        this.msgId = 0;
        this.callbacks.clear();
        this.pendingMessages = [];
        this.connectionListeners = [];
        this.process?.off('message', this.onMessageBind);
        this.process = undefined;
    }

    /**
     * 设置连接状态监听
     * @private
     */
    private setupConnectionListeners(proc: NodeJS.Process | ChildProcess) {
        if ('connected' in proc) {
            // 监听连接事件
            const onConnect = () => {
                this.flushPendingMessages();
                this.notifyConnectionListeners();
            };

            // 如果已经连接，立即处理待处理消息
            if (proc.connected) {
                onConnect();
            } else {
                // 监听连接事件
                proc.once('connect', onConnect);
                this.connectionListeners.push(() => proc.off('connect', onConnect));
            }

            // 监听断开连接事件
            const onDisconnect = () => {
                // 清除所有等待中的请求
                this.pendingMessages.forEach(msg => {
                    if (msg.timeout) clearTimeout(msg.timeout);
                    msg.reject?.(new Error('Process disconnected'));
                });
                this.pendingMessages = [];
            };

            proc.once('disconnect', onDisconnect);
            this.connectionListeners.push(() => proc.off('disconnect', onDisconnect));
        }
    }

    /**
     * 通知连接监听器进行清理
     * @private
     */
    private notifyConnectionListeners() {
        this.connectionListeners.forEach(cleanup => cleanup());
        this.connectionListeners = [];
    }

    /**
     * 发送所有待处理的消息
     * @private
     */
    private flushPendingMessages() {
        if (!this.process || !this.isConnected()) {
            return;
        }

        const messages = this.pendingMessages;
        this.pendingMessages = [];

        for (const msg of messages) {
            if (msg.type === 'request') {
                // 重新发送请求
                this.process.send?.(msg.data);
            } else if (msg.type === 'send') {
                // 重新发送单向消息
                this.process.send?.(msg.data);
            }
        }
    }

    /**
     * 检查进程是否已连接
     * @private
     */
    private isConnected(): boolean {
        if (!this.process) return false;
        if ('connected' in this.process) {
            return this.process.connected;
        }
        // 对于 NodeJS.Process，默认认为是连接的
        return true;
    }

    /**
     * 监听 incoming 消息
     */
    private listen() {
        if (!this.process) {
            throw new Error('未挂载进程');
        }
        this.process.on('message', this.onMessageBind);
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
        if (msg.type === 'send') {
            const { module, method, args } = msg;
            const target = this.handlers[module];
            if (target && typeof target[method] === 'function') {
                try {
                    target[method](...(args || []));
                } catch (e: any) {
                    console.error(e);
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
        if (!this.process) {
            throw new Error('未挂载进程');
        }
        if (this.isConnected()) {
            this.process.send?.(msg);
        }
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
                args: args || [],
            };

            const timer = options?.timeout
                ? setTimeout(() => {
                    this.callbacks.delete(id);
                    const pendingIndex = this.pendingMessages.findIndex(
                        msg => msg.type === 'request' && (msg.data as RpcRequest).id === id
                    );
                    if (pendingIndex !== -1) {
                        this.pendingMessages.splice(pendingIndex, 1);
                    }
                    reject(new Error(`RPC request timeout: ${String(module)}.${String(method)}`));
                }, options.timeout)
                : null;

            this.callbacks.set(id, (res) => {
                if (timer) clearTimeout(timer);
                if (res.error) reject(new Error(res.error));
                else resolve(res.result);
            });

            if (!this.process) {
                reject(new Error('未挂载进程'));
                return;
            }

            if (!this.isConnected()) {
                // 进程未连接，将请求加入待处理队列
                const pendingMsg: PendingMessage = {
                    type: 'request',
                    data: req,
                    resolve,
                    reject,
                    timeout: timer || undefined,
                };
                this.pendingMessages.push(pendingMsg);
                return;
            }

            // 进程已连接，直接发送
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

        if (!this.isConnected()) {
            // 进程未连接，将消息加入待处理队列
            const pendingMsg: PendingMessage = {
                type: 'send',
                data: msg,
            };
            this.pendingMessages.push(pendingMsg);
            return;
        }

        // 进程已连接，直接发送
        this.process.send?.(msg);
    }

    /**
     * 获取待处理消息数量（用于调试）
     */
    getPendingMessageCount(): number {
        return this.pendingMessages.length;
    }

    /**
     * 清空待处理消息（用于清理）
     */
    clearPendingMessages() {
        this.pendingMessages.forEach(msg => {
            if (msg.timeout) clearTimeout(msg.timeout);
            msg.reject?.(new Error('Pending messages cleared'));
        });
        this.pendingMessages = [];
    }
}