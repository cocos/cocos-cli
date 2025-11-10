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
export interface RequestOptions {
    timeout?: number; // 毫秒
}

/**
 * 待处理的消息（仅缓存消息体，不保存 resolve/reject）
 */
interface PendingMessage {
    type: 'request' | 'send';
    data: RpcRequest | RpcSend;
    // 对于 request 类型，存储超时信息
    timeoutStartTime?: number;
    timeoutDuration?: number;
}

type CallbackEntry = {
    cb: (msg: RpcResponse) => void;
    timer?: NodeJS.Timeout;
};

/**
 * 双向 RPC 类
 */
export class ProcessRPC<TModules extends Record<string, any>> {
    private handlers: Record<string, any> = {};
    // 保存回调与其超时定时器
    private callbacks = new Map<number, CallbackEntry>();
    private msgId = 0;
    private readonly MAX_MSG_ID = Number.MAX_SAFE_INTEGER - 1;
    private process: NodeJS.Process | ChildProcess | undefined;
    private onMessageBind = this.onMessage.bind(this);

    // pending 只保存要发送的消息体（request/send）
    private pendingMessages: PendingMessage[] = [];
    // 存放用于移除 disconnect 监听的清理函数
    private disconnectCleanups: Array<() => void> = [];

    constructor(proc?: NodeJS.Process | ChildProcess) {
        if (proc) this.attach(proc);
    }

    attach(proc: NodeJS.Process | ChildProcess) {
        // 防止重复 attach 同一进程
        if (this.process === proc) return;

        this.resetListen();
        this.process = proc;
        this.listen();

        if ('connected' in proc) {
            this.setupConnectionListeners(proc);
        }
    }

    register(handler: Record<string, any>) {
        this.handlers = handler || {};
    }

    private resetListen() {
        // 清理 callbacks（先清 timer）
        for (const [, entry] of this.callbacks) {
            if (entry.timer) clearTimeout(entry.timer);
        }
        this.callbacks.clear();

        // 清理 pending（不触发 reject，因为我们只是重新初始化监听）
        this.pendingMessages = [];

        // 清理 disconnect listeners
        this.clearDisconnectListeners();

        // 移除 message 监听
        if (this.process) {
            try {
                this.process.off('message', this.onMessageBind);
            } catch {
                // ignore
            }
        }
        this.process = undefined;
        this.msgId = 0;
    }

    private setupConnectionListeners(proc: NodeJS.Process | ChildProcess) {
        if (!('connected' in proc)) return;

        let connectListener: (() => void) | undefined;
        const onDisconnect = () => {
            // 原子性地清理所有 callbacks（防止与新请求创建产生竞态条件）
            const callbacksToReject = Array.from(this.callbacks.entries());
            this.callbacks.clear();
            
            // 清理所有定时器并 reject promises
            for (const [id, entry] of callbacksToReject) {
                if (entry.timer) clearTimeout(entry.timer);
                // 调用回调以便 promise 能感知（以 error 形式）
                try {
                    entry.cb({ id, type: 'response', error: 'Process disconnected' });
                } catch {
                    // ignore
                }
            }
            this.pendingMessages = [];
        };

        if (proc.connected) {
            // 连接已建立，立即 flush pending messages
            this.flushPendingMessages();
        } else {
            // 仅在未连接时注册 connect 监听器
            connectListener = () => {
                // flush pending messages 当连接建立
                this.flushPendingMessages();
            };
            proc.once('connect', connectListener);
        }

        proc.once('disconnect', onDisconnect);
        
        // 存放清理函数，用于 later remove
        this.disconnectCleanups.push(() => {
            try { proc.off('disconnect', onDisconnect); } catch {}
            if (connectListener) {
                try { proc.off('connect', connectListener); } catch {}
            }
        });
    }

    private clearDisconnectListeners() {
        this.disconnectCleanups.forEach(clean => {
            try { clean(); } catch {}
        });
        this.disconnectCleanups = [];
    }

    private flushPendingMessages() {
        if (!this.process || !this.isConnected()) return;

        const messages = this.pendingMessages;
        this.pendingMessages = [];

        for (const msg of messages) {
            if (msg.type === 'request') {
                const req = msg.data as RpcRequest;
                // 检查对应的 callback 是否还存在（可能已被清理）
                const entry = this.callbacks.get(req.id);
                if (!entry) {
                    // entry 不存在，说明请求已被处理或清理，跳过
                    continue;
                }

                // 处理超时逻辑
                if (msg.timeoutStartTime && msg.timeoutDuration) {
                    // 重新计算剩余超时时间并设置定时器
                    const elapsed = Date.now() - msg.timeoutStartTime;
                    const remaining = Math.max(0, msg.timeoutDuration - elapsed);
                    
                    if (remaining > 0) {
                        // 只有在 entry 存在且没有 timer 时才重新设置定时器
                        if (!entry.timer) {
                            // 重新设置定时器
                            const timer = setTimeout(() => {
                                // 使用原子操作：只有当 entry 还存在时才删除并 reject
                                const currentEntry = this.callbacks.get(req.id);
                                if (currentEntry) {
                                    // 清除定时器引用
                                    if (currentEntry.timer) clearTimeout(currentEntry.timer);
                                    // 尝试删除，如果删除成功说明还没有被响应处理
                                    if (this.callbacks.delete(req.id)) {
                                        try {
                                            currentEntry.cb({ 
                                                id: req.id, 
                                                type: 'response', 
                                                error: `RPC request timeout: ${req.module}.${req.method}` 
                                            });
                                        } catch {
                                            // ignore callback errors
                                        }
                                    }
                                }
                            }, remaining);
                            entry.timer = timer;
                        }
                    } else {
                        // 已经超时，直接 reject 并跳过发送
                        this.callbacks.delete(req.id);
                        try {
                            entry.cb({ 
                                id: req.id, 
                                type: 'response', 
                                error: `RPC request timeout: ${req.module}.${req.method}` 
                            });
                        } catch {
                            // ignore
                        }
                        continue;
                    }
                }
            }
            // 发送消息（send 类型直接发送，request 类型在超时处理完成后发送）
            this.safeSend(msg.data);
        }
    }

    private isConnected(): boolean {
        if (!this.process) return false;
        if ('connected' in this.process) return !!this.process.connected;
        return true; // NodeJS.Process 默认已连接
    }

    private listen() {
        if (!this.process) throw new Error('未挂载进程');
        // 绑定 message 监听（保证只绑定一次）
        this.process.on('message', this.onMessageBind);
    }

    private async onMessage(msg: RpcMessage) {
        if (!msg || typeof msg !== 'object') return;

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
                console.error(`[RPC Error] ${module}.${method}`, { args, error: e });
                this.reply({ id, type: 'response', error: e?.message || String(e) });
            }
            return;
        }

        if (msg.type === 'response') {
            // 使用原子操作：获取并删除 entry，确保只处理一次
            const entry = this.callbacks.get(msg.id);
            if (entry) {
                // 清除定时器
                if (entry.timer) {
                    clearTimeout(entry.timer);
                }
                // 尝试删除 entry，如果删除成功则调用回调
                // 这样可以防止超时回调同时执行时的竞态条件
                if (this.callbacks.delete(msg.id)) {
                    try {
                        entry.cb(msg);
                    } catch {
                        // ignore callback errors
                    }
                }
            }
            return;
        }

        if (msg.type === 'send') {
            const { module, method, args } = msg;
            const target = this.handlers[module];
            if (target && typeof target[method] === 'function') {
                try {
                    target[method](...(args || []));
                } catch (e: any) {
                    console.error('[RPC Send Handler Error]', e);
                }
            }
            return;
        }
    }

    private reply(msg: RpcResponse) {
        if (!this.process) throw new Error('未挂载进程');
        if (this.isConnected()) this.safeSend(msg);
    }

    // 安全包装 process.send，避免抛出未捕获异常
    private safeSend(msg: RpcMessage): boolean {
        if (!this.process || !this.process.send) {
            return false;
        }
        
        try {
            const result = this.process.send(msg);
            // send() 可能返回 false 表示消息队列已满
            if (result === false) {
                console.warn('[ProcessRPC] send queue full, message may be lost', {
                    type: msg.type,
                    id: 'id' in msg ? msg.id : undefined
                });
                // 对于 request 类型，如果发送失败，应该 reject 对应的 promise
                if (msg.type === 'request') {
                    const entry = this.callbacks.get(msg.id);
                    if (entry) {
                        if (entry.timer) clearTimeout(entry.timer);
                        if (this.callbacks.delete(msg.id)) {
                            try {
                                entry.cb({ 
                                    id: msg.id, 
                                    type: 'response', 
                                    error: 'Send queue full, message not sent' 
                                });
                            } catch {
                                // ignore callback errors
                            }
                        }
                    }
                }
                return false;
            }
            return true;
        } catch (e) {
            console.warn('[ProcessRPC] send failed', e);
            // 对于 request 类型，发送失败时也应该 reject
            if (msg.type === 'request') {
                const entry = this.callbacks.get(msg.id);
                if (entry) {
                    if (entry.timer) clearTimeout(entry.timer);
                    if (this.callbacks.delete(msg.id)) {
                        try {
                            entry.cb({ 
                                id: msg.id, 
                                type: 'response', 
                                error: `Send failed: ${e instanceof Error ? e.message : String(e)}` 
                            });
                        } catch {
                            // ignore callback errors
                        }
                    }
                }
            }
            return false;
        }
    }

    /**
     * request 发送并等待 response
     */
    request<
        K extends keyof TModules,
        M extends keyof TModules[K] & string
    >(
        module: K,
        method: M,
        ...rest: Parameters<TModules[K][M]> extends []
            ? [args?: [], options?: RequestOptions]
            : [args: Parameters<TModules[K][M]>, options?: RequestOptions]
    ): Promise<Awaited<ReturnType<TModules[K][M]>>> {
        const [args, options] = rest as any as [any, RequestOptions?];

        return new Promise((resolve, reject) => {
            // 检查 msgId 溢出
            if (this.msgId >= this.MAX_MSG_ID) {
                this.msgId = 0;
                console.warn('[ProcessRPC] msgId overflow, resetting to 0');
            }
            
            const id = ++this.msgId;
            const req: RpcRequest = {
                id,
                type: 'request',
                module: module as string,
                method: method as string,
                args: args || [],
            };

            // 生成回调，放到 callbacks（并可能设置超时）
            const cb = (res: RpcResponse) => {
                if (res.error) reject(new Error(res.error));
                else resolve(res.result);
            };

            let timer: NodeJS.Timeout | undefined;
            const timeoutStartTime = options?.timeout ? Date.now() : undefined;
            const timeoutDuration = options?.timeout;

            if (options?.timeout) {
                timer = setTimeout(() => {
                    // 使用原子操作：获取 entry 并尝试删除
                    // 如果删除成功，说明响应还没有到达，执行超时处理
                    const entry = this.callbacks.get(id);
                    if (entry) {
                        // 清除定时器引用
                        if (entry.timer) clearTimeout(entry.timer);
                        // 尝试删除 entry，只有删除成功时才 reject（防止与响应处理竞态）
                        if (this.callbacks.delete(id)) {
                            try {
                                entry.cb({ 
                                    id, 
                                    type: 'response', 
                                    error: `RPC request timeout: ${String(module)}.${String(method)}` 
                                });
                            } catch {
                                // ignore callback errors
                            }
                        }
                    }
                }, options.timeout);
            }

            this.callbacks.set(id, { cb, timer });

            if (!this.process) {
                // 直接失败，同时清理 timer
                if (timer) clearTimeout(timer);
                this.callbacks.delete(id);
                reject(new Error('未挂载进程'));
                return;
            }

            if (!this.isConnected()) {
                // 缓存消息，存储超时信息（但不设置定时器，等待连接后重新设置）
                // 取消当前定时器，连接后会重新计算剩余时间
                if (timer) {
                    clearTimeout(timer);
                    // 不设置 timer，等待连接后重新计算
                    this.callbacks.set(id, { cb, timer: undefined });
                }
                this.pendingMessages.push({ 
                    type: 'request', 
                    data: req,
                    timeoutStartTime,
                    timeoutDuration
                });
                return;
            }

            // 如果发送失败，safeSend 会处理回调
            const sent = this.safeSend(req);
            if (!sent && timer) {
                // 发送失败，清理定时器（safeSend 已经处理了回调）
                clearTimeout(timer);
            }
        });
    }

    /**
     * send：fire-and-forget / 可缓存
     */
    send<
        K extends keyof TModules,
        M extends keyof TModules[K] & string
    >(module: K, method: M, args?: Parameters<TModules[K][M]>) {
        if (!this.process) throw new Error('未挂载进程');

        const msg: RpcSend = {
            type: 'send',
            module: module as string,
            method: method as string,
            args: args || [],
        };

        if (!this.isConnected()) {
            this.pendingMessages.push({ type: 'send', data: msg });
            return;
        }

        this.safeSend(msg);
    }

    /**
     * 清理所有 pending，并通知相关 promise
     */
    clearPendingMessages() {
        // 清理 callbacks 的 timer 并通知为 cleared
        for (const [id, entry] of this.callbacks) {
            if (entry.timer) clearTimeout(entry.timer);
            try {
                entry.cb({ id, type: 'response', error: 'Pending messages cleared' });
            } catch {}
        }
        this.callbacks.clear();

        this.pendingMessages = [];
    }

    /**
     * 完全释放 RPC 资源（监听，callbacks 等）
     */
    dispose() {
        this.clearPendingMessages();
        this.clearDisconnectListeners();
        if (this.process) {
            try { this.process.off('message', this.onMessageBind); } catch {}
        }
        this.process = undefined;
    }
}
