import { ChildProcess } from 'child_process';
import { ProcessRPCConfig, RequestOptions, RpcMessage, RpcRequest, RpcResponse, RpcSend, PendingMessage } from './types';
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
    // 错误消息常量
    private static readonly ERROR_DISPOSED = 'Cannot operate: RPC instance has been disposed';
    private static readonly ERROR_NO_PROCESS = '未挂载进程';
    private static readonly ERROR_MODULE_METHOD_REQUIRED = 'Module and method are required';

    private readonly config: Required<Omit<ProcessRPCConfig, 'onSendError'>> & Pick<ProcessRPCConfig, 'onSendError'>;
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
            maxFlushRetries: config?.maxFlushRetries ?? 3,
            onSendError: config?.onSendError
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
            (reason) => this.onRetryFailed(reason),
            (msg) => this.onMessageSentFromQueue(msg)
        );

        if (proc) this.attach(proc);
    }

    /**
     * 挂载进程
     */
    attach(proc: NodeJS.Process | ChildProcess): void {
        this.checkDisposed();

        // 检测是否是进程切换（无论队列是否为空）
        const oldProcess = this.processAdapter.getProcess();
        const isProcessSwitch = oldProcess && oldProcess !== proc;

        // 清理旧状态
        if (oldProcess) {
            this.cleanup('RPC reset: process detached');
        }

        this.processAdapter.attach(proc);
        this.processAdapter.on('message', this.onMessageBind);

        // 如果是进程切换，重置重试计数器，给新进程一个新机会
        if (isProcessSwitch) {
            console.log('[ProcessRPC] Process switch detected, resetting retry counter');
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
        this.checkDisposed();
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
        // 提前检查 disposed 状态，避免创建 Promise
        if (this.isDisposed) {
            return Promise.reject(new Error(ProcessRPC.ERROR_DISPOSED));
        }
        if (!module || !method) {
            return Promise.reject(new Error(ProcessRPC.ERROR_MODULE_METHOD_REQUIRED));
        }
        if (!this.processAdapter.getProcess()) {
            return Promise.reject(new Error(ProcessRPC.ERROR_NO_PROCESS));
        }

        const [args, options] = rest as any as [any, RequestOptions?];
        const callStack = new Error().stack;

        return new Promise((resolve, reject) => {
            // 再次检查 disposed 状态（双重检查）
            if (this.isDisposed) {
                reject(new Error(ProcessRPC.ERROR_DISPOSED));
                return;
            }

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
                ProcessRPC.clearTimer(timer);
                reject(e);
                return;
            }

            // 关键点检查：注册回调后，发送前检查状态
            if (this.isDisposed) {
                this.cleanupCallback(id, timer);
                reject(new Error(ProcessRPC.ERROR_DISPOSED));
                return;
            }

            // 发送或排队
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
        this.checkDisposed();
        if (!module || !method) {
            throw new Error(ProcessRPC.ERROR_MODULE_METHOD_REQUIRED);
        }
        if (!this.processAdapter.getProcess()) {
            throw new Error(ProcessRPC.ERROR_NO_PROCESS);
        }

        const msg: RpcSend = {
            type: 'send',
            module: module as string,
            method: method as string,
            args: args || [],
        };

        this.sendOrEnqueue(msg);
    }

    /**
     * 清理待处理消息
     */
    clearPendingMessages(): void {
        this.checkDisposed();
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
        this.checkDisposed();
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
        this.checkDisposed();
        this.messageQueue.resume();
    }

    /**
     * 释放资源
     */
    dispose(): void {
        if (this.isDisposed) return;
        
        this.isDisposed = true;
        
        // 1. 先清理消息队列（停止 flush 调度，清理 pauseTimer）
        this.messageQueue.clear();
        
        // 2. 清理所有回调和定时器
        this.cleanup('RPC disposed');
        
        // 3. 移除进程监听器
        this.processAdapter.off('message', this.onMessageBind);
        
        // 4. 分离进程（清理所有进程事件监听器）
        this.processAdapter.detach();
        
        // 5. 清理引用
        this.handlers = {};
        this.idGenerator.reset();
    }

    /**
     * 检查是否已释放
     */
    private checkDisposed(): void {
        if (this.isDisposed) {
            throw new Error(ProcessRPC.ERROR_DISPOSED);
        }
    }

    /**
     * 清理定时器工具函数
     */
    private static clearTimer(timer?: NodeJS.Timeout): void {
        if (timer) clearTimeout(timer);
    }

    /**
     * 发送消息
     */
    private sendMessage(msg: RpcMessage): boolean {
        const sent = this.processAdapter.send(msg);
        if (!sent) {
            console.error(`[ProcessRPC] Send failed: `, JSON.stringify(msg));
        }
        return sent;
    }

    /**
     * 发送或排队消息（通用逻辑）
     */
    private sendOrEnqueue(msg: RpcRequest | RpcSend): void {
        const shouldQueue = !this.processAdapter.isConnected() || 
                           this.messageQueue.sendBlocked || 
                           !this.sendMessage(msg);
        
        if (shouldQueue) {
            this.messageQueue.enqueue({ type: msg.type, data: msg });
            this.messageQueue.scheduleFlush();
        }
    }

    /**
     * 将请求加入队列
     */
    private queueRequest(req: RpcRequest, timer: NodeJS.Timeout | undefined, timeout?: number): void {
        ProcessRPC.clearTimer(timer);
        this.callbackManager.updateTimer(req.id, undefined);

        const normalizedTimeout = this.timeoutManager.normalizeTimeout(timeout);
        const hasTimeout = normalizedTimeout > 0;
        
        this.messageQueue.enqueue({
            type: 'request',
            data: req,
            timeoutStartTime: hasTimeout ? Date.now() : undefined,
            timeoutDuration: hasTimeout ? normalizedTimeout : undefined
        });
        this.messageQueue.scheduleFlush();
    }

    /**
     * 清理回调
     */
    private cleanupCallback(id: number, timer?: NodeJS.Timeout): void {
        ProcessRPC.clearTimer(timer);
        this.callbackManager.delete(id);
    }

    /**
     * 清理所有资源
     */
    private cleanup(reason: string): void {
        // 先清理所有回调（包括队列中的和正在处理的）
        this.callbackManager.clear(reason);
        // 清空队列（队列中的请求回调已被上面清理）
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
     * 队列消息发送成功回调
     * 恢复请求的超时定时器
     */
    private onMessageSentFromQueue(msg: PendingMessage): void {
        if (msg.type !== 'request') return;
        
        const req = msg.data as RpcRequest;
        const { timeoutStartTime, timeoutDuration } = msg;
        
        // 如果有超时设置，计算剩余时间并设置定时器
        if (timeoutStartTime && timeoutDuration) {
            const remaining = this.timeoutManager.calculateRemaining(timeoutStartTime, timeoutDuration);
            if (remaining > 0) {
                this.timeoutManager.setupTimer(req.id, req.module, req.method, remaining);
            } else {
                // 已经超时，立即触发超时回调
                this.callbackManager.executeAndDelete(req.id, {
                    id: req.id,
                    type: 'response',
                    error: TimeoutManager.getTimeoutError(req.module, req.method)
                });
            }
        }
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
    private async handleSend(msg: RpcSend): Promise<void> {
        const { module, method, args } = msg;
        const target = this.handlers[module];
        
        if (target && typeof target[method] === 'function') {
            try {
                // 支持异步方法，使用 await 捕获 Promise rejection
                await target[method](...(args || []));
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.error('[ProcessRPC] Send handler error:', { module, method }, error);
                
                // 调用用户配置的错误处理器
                if (this.config.onSendError) {
                    try {
                        this.config.onSendError(error, module, method);
                    } catch (handlerError) {
                        console.error('[ProcessRPC] Error in onSendError handler:', handlerError);
                    }
                }
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

