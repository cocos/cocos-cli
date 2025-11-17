import { ChildProcess } from 'child_process';
import { ProcessRPCConfig, RequestOptions, RpcMessage, RpcRequest, RpcResponse, RpcSend, PendingMessage } from './types';
import { CallbackManager } from './callback-manager';
import { MessageQueue } from './message-queue';
import { ProcessAdapter } from './process-adapter';

/**
 * 双向 RPC 类
 * 精简、稳定、高性能的进程间 RPC 通信
 */
export class ProcessRPC<TModules extends Record<string, any>> {
    private static readonly ERROR_DISPOSED = 'Cannot operate: RPC instance has been disposed';
    private static readonly ERROR_NO_PROCESS = '未挂载进程';
    private static readonly ERROR_MODULE_METHOD_REQUIRED = 'Module and method are required';

    private readonly config: Required<Omit<ProcessRPCConfig, 'onSendError'>> & Pick<ProcessRPCConfig, 'onSendError'>;
    private handlers: Record<string, any> = {};
    private isDisposed = false;

    private readonly callbackManager: CallbackManager;
    private messageQueue: MessageQueue;
    private processAdapter: ProcessAdapter;
    private onMessageBind = this.onMessage.bind(this);

    constructor(proc?: NodeJS.Process | ChildProcess, config?: ProcessRPCConfig) {
        this.config = {
            maxPendingMessages: config?.maxPendingMessages ?? 1000,
            maxCallbacks: config?.maxCallbacks ?? 10000,
            defaultTimeout: config?.defaultTimeout ?? 30000,
            flushBatchSize: config?.flushBatchSize ?? 50,
            maxFlushRetries: config?.maxFlushRetries ?? 3,
            onSendError: config?.onSendError
        };

        this.callbackManager = new CallbackManager(this.config.maxCallbacks, this.config.defaultTimeout);
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

    attach(proc: NodeJS.Process | ChildProcess): void {
        this.checkDisposed();

        const oldProcess = this.processAdapter.getProcess();
        const isSwitch = oldProcess && oldProcess !== proc;

        if (oldProcess) {
            this.cleanup('RPC reset: process detached');
        }

        this.processAdapter.attach(proc);
        this.processAdapter.on('message', this.onMessageBind);

        if (isSwitch) {
            console.log('[ProcessRPC] Process switch, resetting retry counter');
            this.messageQueue.resetRetryCount();
        }

        this.processAdapter.setupConnectionListeners(
            () => this.messageQueue.scheduleFlush(),
            (reason) => this.cleanup(reason)
        );
    }

    register(handler: Record<string, any>): void {
        this.checkDisposed();
        if (!handler || typeof handler !== 'object') {
            throw new Error('Handler must be a valid object');
        }
        this.handlers = handler;
    }

    request<K extends keyof TModules, M extends keyof TModules[K] & string>(
        module: K,
        method: M,
        ...rest: Parameters<TModules[K][M]> extends []
            ? [args?: [], options?: RequestOptions]
            : [args: Parameters<TModules[K][M]>, options?: RequestOptions]
    ): Promise<Awaited<ReturnType<TModules[K][M]>>> {
        if (this.isDisposed) return Promise.reject(new Error(ProcessRPC.ERROR_DISPOSED));
        if (!module || !method) return Promise.reject(new Error(ProcessRPC.ERROR_MODULE_METHOD_REQUIRED));
        if (!this.processAdapter.getProcess()) return Promise.reject(new Error(ProcessRPC.ERROR_NO_PROCESS));

        const [args, options] = rest as any as [any, RequestOptions?];
        const callStack = new Error().stack;

        return new Promise((resolve, reject) => {
            if (this.isDisposed) {
                reject(new Error(ProcessRPC.ERROR_DISPOSED));
                return;
            }

            let id: number;
            try {
                id = this.callbackManager.generateId();
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

            const cb = (res: RpcResponse) => {
                if (res.error) {
                    const error = new Error(res.error);
                    if (callStack) error.stack = `${error.stack}\n--- Original call stack ---\n${callStack}`;
                    reject(error);
                } else {
                    resolve(res.result);
                }
            };

            const timer = this.callbackManager.createTimer(id, module as string, method as string, options?.timeout);

            try {
                this.callbackManager.register(id, cb, timer);
            } catch (e) {
                if (timer) clearTimeout(timer);
                reject(e);
                return;
            }

            if (this.isDisposed) {
                if (timer) clearTimeout(timer);
                this.callbackManager.delete(id);
                reject(new Error(ProcessRPC.ERROR_DISPOSED));
                return;
            }

            if (!this.processAdapter.isConnected() || this.messageQueue.sendBlocked) {
                this.queueRequest(req, timer, options?.timeout);
            } else if (!this.sendMessage(req)) {
                this.queueRequest(req, timer, options?.timeout);
            }
        });
    }

    send<K extends keyof TModules, M extends keyof TModules[K] & string>(
        module: K,
        method: M,
        args?: Parameters<TModules[K][M]>
    ): void {
        this.checkDisposed();
        if (!module || !method) throw new Error(ProcessRPC.ERROR_MODULE_METHOD_REQUIRED);
        if (!this.processAdapter.getProcess()) throw new Error(ProcessRPC.ERROR_NO_PROCESS);

        const msg: RpcSend = {
            type: 'send',
            module: module as string,
            method: method as string,
            args: args || [],
        };

        this.sendOrEnqueue(msg);
    }

    clearPendingMessages(): void {
        this.checkDisposed();
        this.callbackManager.clear('Pending messages cleared');
        this.messageQueue.clear();
    }

    pauseQueue(): void {
        this.checkDisposed();
        this.messageQueue.pause();
    }

    resumeQueue(): void {
        this.checkDisposed();
        this.messageQueue.resume();
    }

    dispose(): void {
        if (this.isDisposed) return;

        this.isDisposed = true;
        this.messageQueue.clear();
        this.cleanup('RPC disposed');
        this.processAdapter.off('message', this.onMessageBind);
        this.processAdapter.detach();
        this.handlers = {};
        this.callbackManager.reset();
    }

    private checkDisposed(): void {
        if (this.isDisposed) throw new Error(ProcessRPC.ERROR_DISPOSED);
    }

    private sendMessage(msg: RpcMessage): boolean {
        const sent = this.processAdapter.send(msg);
        if (!sent) console.error(`[ProcessRPC] Send failed:`, JSON.stringify(msg));
        return sent;
    }

    private sendOrEnqueue(msg: RpcRequest | RpcSend): void {
        if (!this.processAdapter.isConnected() || this.messageQueue.sendBlocked || !this.sendMessage(msg)) {
            this.messageQueue.enqueue({ type: msg.type, data: msg });
            this.messageQueue.scheduleFlush();
        }
    }

    private queueRequest(req: RpcRequest, timer: NodeJS.Timeout | undefined, timeout?: number): void {
        if (timer) clearTimeout(timer);
        this.callbackManager.updateTimer(req.id, undefined);

        const ms = timeout === undefined ? this.config.defaultTimeout : Math.max(0, timeout);
        const hasTimeout = ms > 0;

        this.messageQueue.enqueue({
            type: 'request',
            data: req,
            timeoutStartTime: hasTimeout ? Date.now() : undefined,
            timeoutDuration: hasTimeout ? ms : undefined
        });
        this.messageQueue.scheduleFlush();
    }

    private cleanup(reason: string): void {
        this.callbackManager.clear(reason);
        this.messageQueue.clear();
    }

    private onRetryFailed(reason: string): void {
        console.error(`[ProcessRPC] ${reason}, rejecting ${this.messageQueue.length} pending messages`);
        this.messageQueue.rejectAllRequests(reason, this.callbackManager);
    }

    private onMessageSentFromQueue(msg: PendingMessage): void {
        if (msg.type !== 'request' || !msg.timeoutStartTime || !msg.timeoutDuration) return;

        const req = msg.data as RpcRequest;
        this.callbackManager.setupRemainingTimer(req.id, req.module, req.method, msg.timeoutStartTime, msg.timeoutDuration);
    }

    private async onMessage(msg: RpcMessage): Promise<void> {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'request') {
            await this.handleRequest(msg);
        } else if (msg.type === 'response') {
            this.callbackManager.executeAndDelete(msg.id, msg);
        } else if (msg.type === 'send') {
            await this.handleSend(msg);
        }
    }

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

    private async handleSend(msg: RpcSend): Promise<void> {
        const { module, method, args } = msg;
        const target = this.handlers[module];

        if (target && typeof target[method] === 'function') {
            try {
                await target[method](...(args || []));
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.error('[ProcessRPC] Send handler error:', { module, method }, error);

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

    private reply(msg: RpcResponse): void {
        if (!this.processAdapter.isConnected()) {
            console.error('[ProcessRPC] Cannot reply: process not connected');
            return;
        }
        this.sendMessage(msg);
    }
}

