import { ChildProcess } from 'child_process';
import { ProcessRPCConfig, RequestOptions, RpcMessage, RpcRequest, RpcResponse, RpcSend } from './types';
import { MessageIdGenerator } from './message-id-generator';
import { CallbackManager } from './callback-manager';
import { MessageQueue } from './message-queue';
import { TimeoutManager } from './timeout-manager';
import { ProcessAdapter } from './process-adapter';

/**
 * 双向 RPC 类
 * 简化版本，功能完整
 */
export class ProcessRPC<TModules extends Record<string, any>> {
    private readonly config: Required<ProcessRPCConfig>;
    private handlers: Record<string, any> = {};
    private isDisposed = false;

    // 核心组件
    private idGenerator: MessageIdGenerator;
    private readonly callbackManager: CallbackManager;
    private messageQueue: MessageQueue;
    private timeoutManager: TimeoutManager;
    private processAdapter: ProcessAdapter;
    private onMessageBind = this.onMessage.bind(this);

    constructor(proc?: NodeJS.Process | ChildProcess, config?: ProcessRPCConfig) {
        // 初始化配置
        this.config = {
            maxPendingMessages: config?.maxPendingMessages ?? 1000,
            maxCallbacks: config?.maxCallbacks ?? 10000,
            defaultTimeout: config?.defaultTimeout ?? 30000,
            flushBatchSize: config?.flushBatchSize ?? 50,
            maxFlushRetries: config?.maxFlushRetries ?? 3
        };

        // 初始化组件
        this.callbackManager = new CallbackManager(this.config.maxCallbacks);
        this.idGenerator = new MessageIdGenerator(id => this.callbackManager.has(id));
        this.timeoutManager = new TimeoutManager(this.config.defaultTimeout, this.callbackManager);
        this.processAdapter = new ProcessAdapter();
        
        this.messageQueue = new MessageQueue(
            this.config.maxPendingMessages,
            this.config.maxFlushRetries,
            this.config.flushBatchSize,
            (msg) => this.sendMessage(msg),
            (reason) => this.onRetryFailed(reason)
        );

        if (proc) this.attach(proc);
    }

    /**
     * 挂载进程
     */
    attach(proc: NodeJS.Process | ChildProcess): void {
        if (this.isDisposed) {
            throw new Error('Cannot attach: RPC instance has been disposed');
        }
        if (!proc) {
            throw new Error('Process parameter is required');
        }

        // 检测是否是进程重启（有 pending 消息但进程切换）
        const isProcessRestart = this.messageQueue.length > 0 && 
                                 this.processAdapter.getProcess() && 
                                 this.processAdapter.getProcess() !== proc;

        // 清理旧状态
        if (this.processAdapter.getProcess()) {
            this.cleanup('RPC reset: process detached');
        }

        this.processAdapter.attach(proc);
        this.processAdapter.on('message', this.onMessageBind);

        // 如果是进程重启，重置重试计数器，给新进程一个新机会
        if (isProcessRestart) {
            console.log('[ProcessRPC] Process restart detected, resetting retry counter');
            this.messageQueue.resetRetryCount();
        }

        // 设置连接监听
        this.processAdapter.setupConnectionListeners(
            () => this.messageQueue.scheduleFlush(),
            (reason) => this.cleanup(reason)
        );
    }

    /**
     * 注册处理器
     */
    register(handler: Record<string, any>): void {
        if (this.isDisposed) {
            throw new Error('Cannot register: RPC instance has been disposed');
        }
        if (!handler || typeof handler !== 'object') {
            throw new Error('Handler must be a valid object');
        }
        this.handlers = handler;
    }

    /**
     * 发送 RPC 请求
     */
    request<K extends keyof TModules, M extends keyof TModules[K] & string>(
        module: K,
        method: M,
        ...rest: Parameters<TModules[K][M]> extends []
            ? [args?: [], options?: RequestOptions]
            : [args: Parameters<TModules[K][M]>, options?: RequestOptions]
    ): Promise<Awaited<ReturnType<TModules[K][M]>>> {
        if (this.isDisposed) {
            return Promise.reject(new Error('Cannot request: RPC instance has been disposed'));
        }
        if (!module || !method) {
            return Promise.reject(new Error('Module and method are required'));
        }

        const [args, options] = rest as any as [any, RequestOptions?];
        const callStack = new Error().stack;

        return new Promise((resolve, reject) => {
            let id: number;
            try {
                id = this.idGenerator.generate();
            } catch (e) {
                reject(e);
                return;
            }

            const req: RpcRequest = {
                id,
                type: 'request',
                module: module as string,
                method: method as string,
                args: args || [],
            };

            // 创建回调
            const cb = (res: RpcResponse) => {
                if (res.error) {
                    const error = new Error(res.error);
                    if (callStack) {
                        error.stack = `${error.stack}\n--- Original call stack ---\n${callStack}`;
                    }
                    reject(error);
                } else {
                    resolve(res.result);
                }
            };

            // 设置超时
            const timeout = options?.timeout;
            const timer = this.timeoutManager.createTimer(id, module as string, method as string, timeout ?? this.config.defaultTimeout);
            
            // 注册回调
            try {
                this.callbackManager.register(id, cb, timer);
            } catch (e) {
                if (timer) clearTimeout(timer);
                reject(e);
                return;
            }

            // 发送或排队
            if (!this.processAdapter.getProcess()) {
                this.cleanupCallback(id, timer);
                reject(new Error('未挂载进程'));
                return;
            }

            if (!this.processAdapter.isConnected() || this.messageQueue.sendBlocked) {
                this.queueRequest(req, timer, timeout);
            } else {
                const sent = this.sendMessage(req);
                if (!sent) {
                    this.queueRequest(req, timer, timeout);
                }
            }
        });
    }

    /**
     * 发送单向消息
     */
    send<K extends keyof TModules, M extends keyof TModules[K] & string>(
        module: K,
        method: M,
        args?: Parameters<TModules[K][M]>
    ): void {
        if (this.isDisposed) {
            throw new Error('Cannot send: RPC instance has been disposed');
        }
        if (!module || !method) {
            throw new Error('Module and method are required');
        }
        if (!this.processAdapter.getProcess()) {
            throw new Error('未挂载进程');
        }

        const msg: RpcSend = {
            type: 'send',
            module: module as string,
            method: method as string,
            args: args || [],
        };

        if (!this.processAdapter.isConnected() || this.messageQueue.sendBlocked) {
            this.messageQueue.enqueue({ type: 'send', data: msg });
            this.messageQueue.scheduleFlush();
        } else {
            const sent = this.sendMessage(msg);
            if (!sent) {
                this.messageQueue.enqueue({ type: 'send', data: msg });
                this.messageQueue.scheduleFlush();
            }
        }
    }

    /**
     * 清理待处理消息
     */
    clearPendingMessages(): void {
        if (this.isDisposed) {
            throw new Error('Cannot clear pending messages: RPC instance has been disposed');
        }
        this.callbackManager.clear('Pending messages cleared');
        this.messageQueue.clear();
    }

    /**
     * 暂停消息队列处理
     * 用于进程重启前，防止浪费重试次数
     * @example
     * // 进程崩溃前
     * child.on('exit', () => {
     *     rpc.pauseQueue();
     *     // 重启进程...
     * });
     */
    pauseQueue(): void {
        if (this.isDisposed) {
            throw new Error('Cannot pause queue: RPC instance has been disposed');
        }
        this.messageQueue.pause();
    }

    /**
     * 恢复消息队列处理
     * 用于进程重启后，重置重试计数并恢复发送
     * @example
     * // 进程重启后
     * const newChild = fork(...);
     * rpc.attach(newChild);
     * rpc.resumeQueue();
     */
    resumeQueue(): void {
        if (this.isDisposed) {
            throw new Error('Cannot resume queue: RPC instance has been disposed');
        }
        this.messageQueue.resume();
    }

    /**
     * 释放资源
     */
    dispose(): void {
        if (this.isDisposed) return;
        
        this.isDisposed = true;
        this.cleanup('RPC disposed');
        this.processAdapter.off('message', this.onMessageBind);
        this.processAdapter.detach();
        this.handlers = {};
        this.idGenerator.reset();
    }

    /**
     * 发送消息
     */
    private sendMessage(msg: RpcMessage): boolean {
        const sent = this.processAdapter.send(msg);
        if (!sent) {
            console.error('[ProcessRPC] Send failed:', {
                type: msg.type,
                id: 'id' in msg ? msg.id : undefined
            });
        }
        return sent;
    }

    /**
     * 将请求加入队列
     */
    private queueRequest(req: RpcRequest, timer: NodeJS.Timeout | undefined, timeout?: number): void {
        if (timer) {
            clearTimeout(timer);
            this.callbackManager.updateTimer(req.id, undefined);
        }

        const normalizedTimeout = this.timeoutManager.normalizeTimeout(timeout);
        this.messageQueue.enqueue({
            type: 'request',
            data: req,
            timeoutStartTime: normalizedTimeout > 0 ? Date.now() : undefined,
            timeoutDuration: normalizedTimeout > 0 ? normalizedTimeout : undefined
        });
        this.messageQueue.scheduleFlush();
    }

    /**
     * 清理回调
     */
    private cleanupCallback(id: number, timer?: NodeJS.Timeout): void {
        if (timer) clearTimeout(timer);
        this.callbackManager.delete(id);
    }

    /**
     * 清理所有资源
     */
    private cleanup(reason: string): void {
        this.callbackManager.clear(reason);
        this.messageQueue.clear();
    }

    /**
     * 重试失败回调
     */
    private onRetryFailed(reason: string): void {
        console.error(`[ProcessRPC] ${reason}, rejecting ${this.messageQueue.length} pending messages`);
        this.messageQueue.rejectAllRequests(reason, this.callbackManager);
    }

    /**
     * 处理接收到的消息
     */
    private async onMessage(msg: RpcMessage): Promise<void> {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'request') {
            await this.handleRequest(msg);
        } else if (msg.type === 'response') {
            this.handleResponse(msg);
        } else if (msg.type === 'send') {
            this.handleSend(msg);
        }
    }

    /**
     * 处理请求
     */
    private async handleRequest(msg: RpcRequest): Promise<void> {
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
            console.error('[ProcessRPC] Handler error:', { module, method }, e);
            this.reply({ id, type: 'response', error: e?.message || String(e) });
        }
    }

    /**
     * 处理响应
     */
    private handleResponse(msg: RpcResponse): void {
        this.callbackManager.executeAndDelete(msg.id, msg);
    }

    /**
     * 处理单向消息
     */
    private handleSend(msg: RpcSend): void {
        const { module, method, args } = msg;
        const target = this.handlers[module];
        
        if (target && typeof target[method] === 'function') {
            try {
                target[method](...(args || []));
            } catch (e) {
                console.error('[ProcessRPC] Send handler error:', { module, method }, e);
            }
        }
    }

    /**
     * 回复消息
     */
    private reply(msg: RpcResponse): void {
        if (!this.processAdapter.isConnected()) {
            console.error('[ProcessRPC] Cannot reply: process not connected');
            return;
        }
        this.sendMessage(msg);
    }
}

