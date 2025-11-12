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
 * ProcessRPC 配置选项
 */
export interface ProcessRPCConfig {
    /** pending 消息队列最大长度，默认 1000 */
    maxPendingMessages?: number;
    /** 并发请求最大数量，默认 10000 */
    maxCallbacks?: number;
    /** 默认请求超时时间（毫秒），默认 30000 (30秒)，设为 0 表示无限制 */
    defaultTimeout?: number;
    /** 每次 flush 处理的最大消息数量，默认 50，防止长时间阻塞事件循环 */
    flushBatchSize?: number;
    /** 错误处理回调 */
    onError?: (error: Error, context?: { type: string; details?: any }) => void;
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
    // 配置常量
    private readonly MAX_PENDING_MESSAGES: number;
    private readonly MAX_CALLBACKS: number;
    private readonly DEFAULT_TIMEOUT: number;
    private readonly FLUSH_BATCH_SIZE: number;
    private readonly MAX_MSG_ID = Number.MAX_SAFE_INTEGER - 1;
    private readonly onErrorHandler?: (error: Error, context?: { type: string; details?: any }) => void;

    private handlers: Record<string, any> = {};
    // 保存回调与其超时定时器
    private callbacks = new Map<number, CallbackEntry>();
    private msgId = 0;
    private process: NodeJS.Process | ChildProcess | undefined;
    private onMessageBind = this.onMessage.bind(this);

    // pending 只保存要发送的消息体（request/send）
    private pendingMessages: PendingMessage[] = [];
    // 存放用于移除 disconnect 监听的清理函数
    private disconnectCleanups: Array<() => void> = [];
    // 标记是否已 disposed
    private isDisposed = false;

    constructor(proc?: NodeJS.Process | ChildProcess, config?: ProcessRPCConfig) {
        this.MAX_PENDING_MESSAGES = config?.maxPendingMessages ?? 1000;
        this.MAX_CALLBACKS = config?.maxCallbacks ?? 10000;
        this.DEFAULT_TIMEOUT = config?.defaultTimeout ?? 30000; // 30 seconds
        this.FLUSH_BATCH_SIZE = config?.flushBatchSize ?? 50;
        this.onErrorHandler = config?.onError;
        if (proc) this.attach(proc);
    }

    /**
     * 挂载进程，建立 RPC 通信
     * @param proc - 要挂载的进程对象（NodeJS.Process 或 ChildProcess）
     * @throws 如果 RPC 实例已被 disposed 或参数无效
     */
    attach(proc: NodeJS.Process | ChildProcess) {
        // 运行时保护：检查是否已 disposed
        if (this.isDisposed) {
            throw new Error('Cannot attach: RPC instance has been disposed');
        }

        // 参数校验
        if (!proc) {
            throw new Error('Process parameter is required');
        }

        // 防止重复 attach 同一进程
        if (this.process === proc) return;

        // 先清理旧进程的所有监听器和状态
        this.resetListen();
        
        this.process = proc;
        this.listen();

        // 如果是 ChildProcess，设置连接状态监听
        if ('connected' in proc) {
            this.setupConnectionListeners(proc);
        }
    }

    /**
     * 注册 RPC 处理器
     * @param handler - 处理器对象，键为模块名，值为包含方法的对象
     * @example
     * rpc.register({
     *   user: {
     *     async getInfo(id: number) { return {...} }
     *   }
     * });
     * @throws 如果 RPC 实例已被 disposed 或参数无效
     */
    register(handler: Record<string, any>) {
        // 运行时保护：检查是否已 disposed
        if (this.isDisposed) {
            throw new Error('Cannot register: RPC instance has been disposed');
        }

        // 参数校验
        if (!handler || typeof handler !== 'object') {
            throw new Error('Handler must be a valid object');
        }

        this.handlers = handler;
    }

    /**
     * 重置监听状态，清理所有资源
     * 在切换进程或 dispose 时调用
     */
    private resetListen() {
        // 先清理 disconnect listeners（避免在清理过程中触发 disconnect 事件）
        this.clearDisconnectListeners();

        // 清理 callbacks（先清 timer，再通知所有待处理的请求）
        const callbacksToReject = Array.from(this.callbacks.entries());
        this.callbacks.clear();
        
        for (const [id, entry] of callbacksToReject) {
            if (entry.timer) clearTimeout(entry.timer);
            try {
                entry.cb({ id, type: 'response', error: 'RPC reset: process detached' });
            } catch {
                // ignore callback errors
            }
        }

        // 清理 pending messages
        this.pendingMessages = [];

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

    /**
     * 设置进程连接状态监听器
     * 监听 connect, disconnect, exit 事件
     * @param proc - 子进程对象
     */
    private setupConnectionListeners(proc: NodeJS.Process | ChildProcess) {
        if (!('connected' in proc)) return;

        let connectListener: (() => void) | undefined;
        
        /**
         * 清理所有回调的辅助函数
         * @param reason - 清理原因，将作为错误消息传递给所有待处理的请求
         */
        const cleanupCallbacks = (reason: string) => {
            // 原子性地清理所有 callbacks（防止与新请求创建产生竞态条件）
            const callbacksToReject = Array.from(this.callbacks.entries());
            this.callbacks.clear();
            
            // 清理所有定时器并 reject promises
            for (const [id, entry] of callbacksToReject) {
                if (entry.timer) clearTimeout(entry.timer);
                // 调用回调以便 promise 能感知（以 error 形式）
                try {
                    entry.cb({ id, type: 'response', error: reason });
                } catch {
                    // ignore callback errors
                }
            }
            this.pendingMessages = [];
        };

        // 监听 disconnect 事件
        const onDisconnect = () => {
            cleanupCallbacks('Process disconnected');
        };

        // 监听 exit 事件
        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
            const reason = signal 
                ? `Process exited with signal ${signal}` 
                : `Process exited with code ${code}`;
            cleanupCallbacks(reason);
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
        proc.once('exit', onExit);
        
        // 存放清理函数，用于后续移除监听器
        this.disconnectCleanups.push(() => {
            try { proc.off('disconnect', onDisconnect); } catch {}
            try { proc.off('exit', onExit); } catch {}
            if (connectListener) {
                try { proc.off('connect', connectListener); } catch {}
            }
        });
    }

    /**
     * 清理所有 disconnect 监听器
     */
    private clearDisconnectListeners() {
        this.disconnectCleanups.forEach(clean => {
            try { clean(); } catch {}
        });
        this.disconnectCleanups = [];
    }

    /**
     * 批量处理 pending 消息队列
     * 采用分批处理策略，避免长时间阻塞事件循环
     * 失败的消息会保留在队列中等待重试
     */
    private flushPendingMessages() {
        if (!this.process || !this.isConnected()) return;

        // 批量处理，避免长时间阻塞事件循环
        const batchSize = Math.min(this.FLUSH_BATCH_SIZE, this.pendingMessages.length);
        const messages = this.pendingMessages.slice(0, batchSize);
        const remainingMessages = this.pendingMessages.slice(batchSize);
        const failedMessages: PendingMessage[] = [];

        for (const msg of messages) {
            const result = this.processPendingMessage(msg);
            if (!result.success) {
                failedMessages.push(msg);
            }
        }

        // 更新 pending 队列：失败的消息 + 剩余未处理的消息
        this.pendingMessages = [...failedMessages, ...remainingMessages];

        // 如果还有剩余消息，异步继续处理下一批
        if (this.pendingMessages.length > 0) {
            setImmediate(() => {
                if (this.isConnected()) {
                    this.flushPendingMessages();
                }
            });
        }
    }

    /**
     * 处理单个 pending 消息
     * @param msg - 待处理的消息
     * @returns { success: boolean } - true 表示处理成功或已处理，false 表示需要重试
     */
    private processPendingMessage(msg: PendingMessage): { success: boolean } {
        try {
            // request 类型需要特殊处理
            if (msg.type === 'request') {
                const shouldSend = this.handlePendingRequestTimeout(msg);
                if (!shouldSend) {
                    return { success: true }; // 已超时处理，不需要重试
                }
            }

            // 尝试发送消息
            const sent = this.safeSend(msg.data);
            return { success: sent };
        } catch (error) {
            this.handleError(error instanceof Error ? error : new Error(String(error)), {
                type: 'Flush Pending Message Error',
                details: { messageType: msg.type }
            });
            return { success: false };
        }
    }

    /**
     * 处理 pending request 的超时逻辑
     * 计算剩余超时时间，设置定时器或触发超时回调
     * @param msg - pending 请求消息
     * @returns true 表示应该发送消息，false 表示已超时或已处理，跳过发送
     */
    private handlePendingRequestTimeout(msg: PendingMessage): boolean {
        const req = msg.data as RpcRequest;
        
        // 检查 callback 是否还存在
        const entry = this.callbacks.get(req.id);
        if (!entry) {
            return false; // callback 已被清理，跳过
        }

        // 没有超时设置，直接发送
        if (!msg.timeoutStartTime || !msg.timeoutDuration) {
            return true;
        }

        // 计算剩余超时时间
        const elapsed = Date.now() - msg.timeoutStartTime;
        const remaining = Math.max(0, msg.timeoutDuration - elapsed);

        if (remaining > 0) {
            // 还有剩余时间，设置定时器
            this.setupTimeoutTimer(req.id, req.module, req.method, remaining, entry);
            return true;
        }

        // 已超时，触发超时回调
        this.triggerTimeoutCallback(req.id, req.module, req.method, entry);
        return false;
    }

    /**
     * 设置超时定时器
     * @param id - 请求 ID
     * @param module - 模块名
     * @param method - 方法名
     * @param timeout - 超时时间（毫秒）
     * @param entry - 回调条目
     */
    private setupTimeoutTimer(
        id: number, 
        module: string, 
        method: string, 
        timeout: number, 
        entry: CallbackEntry
    ): void {
        // 只在没有 timer 时才设置
        if (entry.timer) return;

        const timer = setTimeout(() => {
            const currentEntry = this.callbacks.get(id);
            if (currentEntry && this.callbacks.delete(id)) {
                if (currentEntry.timer) clearTimeout(currentEntry.timer);
                try {
                    currentEntry.cb({ 
                        id, 
                        type: 'response', 
                        error: `RPC request timeout: ${module}.${method}` 
                    });
                } catch {
                    // ignore callback errors
                }
            }
        }, timeout);
        
        entry.timer = timer;
    }

    /**
     * 触发超时回调
     * @param id - 请求 ID
     * @param module - 模块名
     * @param method - 方法名
     * @param entry - 回调条目
     */
    private triggerTimeoutCallback(id: number, module: string, method: string, entry: CallbackEntry): void {
        this.callbacks.delete(id);
        try {
            entry.cb({ 
                id, 
                type: 'response', 
                error: `RPC request timeout: ${module}.${method}` 
            });
        } catch {
            // ignore callback errors
        }
    }

    /**
     * 检查进程连接状态
     * @returns true 表示已连接，false 表示未连接或进程不存在
     */
    private isConnected(): boolean {
        if (!this.process) return false;
        if ('connected' in this.process) return !!this.process.connected;
        return true; // NodeJS.Process 默认已连接
    }

    /**
     * 原子化生成唯一消息 ID
     * 防止竞态条件导致 ID 冲突
     * 优化：使用有限次重试避免 O(n) 复杂度
     * @returns 唯一的消息 ID
     * @throws 如果无法生成唯一 ID（所有 ID 都被占用）
     */
    private generateMsgId(): number {
        // 原子操作：先递增后检查
        const startId = this.msgId;
        this.msgId = (this.msgId >= this.MAX_MSG_ID) ? 1 : this.msgId + 1;
        
        // 快速路径：大多数情况下 ID 不冲突
        if (!this.callbacks.has(this.msgId)) {
            return this.msgId;
        }
        
        // 额外安全检查：如果 ID 已被使用（极少见情况），尝试有限次数
        // 最多尝试 100 次，避免在高负载下性能退化
        const MAX_ATTEMPTS = 100;
        for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
            this.msgId = (this.msgId >= this.MAX_MSG_ID) ? 1 : this.msgId + 1;
            
            // 如果回到起始 ID，说明可能所有 ID 都被占用
            if (this.msgId === startId) {
                break;
            }
            
            if (!this.callbacks.has(this.msgId)) {
                return this.msgId;
            }
        }
        
        // 如果仍然找不到可用 ID，说明系统负载过高
        throw new Error(`Unable to generate unique message ID after ${MAX_ATTEMPTS} attempts. Current callbacks: ${this.callbacks.size}/${this.MAX_CALLBACKS}`);
    }

    /**
     * 统一错误处理方法
     * 调用用户提供的错误处理器，并记录到控制台
     * @param error - 错误对象或错误消息
     * @param context - 错误上下文信息
     */
    private handleError(error: Error | string, context?: { type: string; details?: any }) {
        const err = typeof error === 'string' ? new Error(error) : error;
        
        // 调用用户提供的错误处理器
        if (this.onErrorHandler) {
            try {
                this.onErrorHandler(err, context);
            } catch (handlerError) {
                // 错误处理器本身出错，只记录到控制台
                console.error('[ProcessRPC] Error handler threw:', handlerError);
            }
        }
        
        // 同时记录到控制台（保持原有行为）
        if (context) {
            console.error(`[ProcessRPC] ${context.type}:`, err, context.details);
        } else {
            console.error('[ProcessRPC] Error:', err);
        }
    }

    /**
     * 绑定消息监听器
     * @throws 如果未挂载进程
     */
    private listen() {
        if (!this.process) throw new Error('未挂载进程');
        // 绑定 message 监听（保证只绑定一次）
        this.process.on('message', this.onMessageBind);
    }

    /**
     * 处理接收到的 RPC 消息
     * 根据消息类型分发到对应的处理逻辑
     * @param msg - RPC 消息对象
     */
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
                this.handleError(e, { 
                    type: 'RPC Handler Error', 
                    details: { module, method, args } 
                });
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
                    this.handleError(e, { 
                        type: 'RPC Send Handler Error', 
                        details: { module, method, args } 
                    });
                }
            }
            return;
        }
    }

    /**
     * 回复 RPC 请求
     * @param msg - 响应消息
     * @throws 如果未挂载进程
     */
    private reply(msg: RpcResponse) {
        if (!this.process) throw new Error('未挂载进程');
        if (!this.isConnected()) {
            this.handleError('Cannot reply: process not connected', {
                type: 'Reply Failed',
                details: { messageId: msg.id }
            });
            return;
        }
        this.safeSend(msg);
    }

    /**
     * 安全包装 process.send，避免抛出未捕获异常
     * @param msg - 要发送的 RPC 消息
     * @returns true 表示发送成功，false 表示发送失败
     */
    private safeSend(msg: RpcMessage): boolean {
        if (!this.process || !this.process.send) {
            return false;
        }
        
        try {
            const result = this.process.send(msg);
            
            // send() 可能返回 false 表示消息队列已满
            if (result === false) {
                this.handleSendFailure(msg, 'Send queue full, message not sent', 'Send Queue Full');
                return false;
            }
            
            return true;
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            this.handleSendFailure(msg, `Send failed: ${errorMsg}`, 'Send Failed');
            return false;
        }
    }

    /**
     * 处理发送失败的情况
     * 对于 request 类型，需要 reject 对应的 promise
     * @param msg - 失败的消息
     * @param error - 错误消息
     * @param errorType - 错误类型
     */
    private handleSendFailure(msg: RpcMessage, error: string, errorType: string): void {
        this.handleError(error, {
            type: errorType,
            details: { messageType: msg.type, id: 'id' in msg ? msg.id : undefined }
        });

        // 只有 request 类型需要触发回调
        if (msg.type === 'request') {
            this.rejectRequestCallback(msg.id, error);
        }
    }

    /**
     * Reject 并清理指定 request 的回调
     * @param id - 请求 ID
     * @param error - 错误消息
     */
    private rejectRequestCallback(id: number, error: string): void {
        const entry = this.callbacks.get(id);
        if (!entry) return;

        // 清理定时器
        if (entry.timer) {
            clearTimeout(entry.timer);
        }

        // 删除并触发回调
        if (this.callbacks.delete(id)) {
            try {
                entry.cb({ id, type: 'response', error });
            } catch {
                // ignore callback errors
            }
        }
    }

    /**
     * 发送 RPC 请求并等待响应
     * @param module - 模块名
     * @param method - 方法名
     * @param rest - 参数和选项
     * @returns Promise，resolve 为方法返回值，reject 为错误
     * @example
     * const result = await rpc.request('user', 'getInfo', [userId], { timeout: 5000 });
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
        // 运行时保护
        if (this.isDisposed) {
            return Promise.reject(new Error('Cannot request: RPC instance has been disposed'));
        }

        // 参数校验
        if (!module || !method) {
            return Promise.reject(new Error('Module and method are required'));
        }

        const [args, options] = rest as any as [any, RequestOptions?];

        return new Promise((resolve, reject) => {
            // 检查并发限制
            if (this.callbacks.size >= this.MAX_CALLBACKS) {
                this.rejectWithError(reject, 'Max Callbacks Exceeded', 
                    `Exceeded maximum concurrent requests (${this.MAX_CALLBACKS})`,
                    { currentCount: this.callbacks.size, max: this.MAX_CALLBACKS });
                return;
            }

            // 生成消息 ID
            let id: number;
            try {
                id = this.generateMsgId();
            } catch (e) {
                reject(e);
                return;
            }

            // 构建请求
            const req: RpcRequest = {
                id,
                type: 'request',
                module: module as string,
                method: method as string,
                args: args || [],
            };

            // 创建回调
            const cb = (res: RpcResponse) => {
                if (res.error) reject(new Error(res.error));
                else resolve(res.result);
            };

            // 处理超时设置
            const timeout = this.normalizeTimeout(options?.timeout);
            const timer = timeout > 0 
                ? this.createTimeoutTimer(id, module as string, method as string, timeout) 
                : undefined;

            // 注册回调
            this.callbacks.set(id, { cb, timer });

            // 尝试发送
            this.sendOrQueueRequest(req, id, timer, timeout, reject);
        });
    }

    /**
     * 标准化超时值
     * @param timeout - 用户传入的超时时间，undefined 使用默认值
     * @returns 标准化后的超时时间（毫秒），负数会转为 0
     */
    private normalizeTimeout(timeout?: number): number {
        if (timeout === undefined) {
            return this.DEFAULT_TIMEOUT;
        }
        return timeout < 0 ? 0 : timeout;
    }

    /**
     * 创建超时定时器
     * @param id - 请求 ID
     * @param module - 模块名
     * @param method - 方法名
     * @param timeout - 超时时间（毫秒）
     * @returns 定时器对象
     */
    private createTimeoutTimer(id: number, module: string, method: string, timeout: number): NodeJS.Timeout {
        return setTimeout(() => {
            const entry = this.callbacks.get(id);
            if (entry && this.callbacks.delete(id)) {
                if (entry.timer) clearTimeout(entry.timer);
                try {
                    entry.cb({ 
                        id, 
                        type: 'response', 
                        error: `RPC request timeout: ${module}.${method}` 
                    });
                } catch {
                    // ignore callback errors
                }
            }
        }, timeout);
    }

    /**
     * 发送或排队请求
     * 根据连接状态决定立即发送还是加入 pending 队列
     * @param req - 请求对象
     * @param id - 请求 ID
     * @param timer - 超时定时器
     * @param timeout - 超时时间
     * @param reject - Promise reject 函数
     */
    private sendOrQueueRequest(
        req: RpcRequest, 
        id: number, 
        timer: NodeJS.Timeout | undefined,
        timeout: number,
        reject: (reason?: any) => void
    ): void {
        // 检查进程
        if (!this.process) {
            this.cleanupAndReject(id, timer, reject, '未挂载进程');
            return;
        }

        // 未连接，加入 pending 队列
        if (!this.isConnected()) {
            this.queuePendingRequest(req, id, timer, timeout, reject);
            return;
        }

        // 立即发送
        const sent = this.safeSend(req);
        if (!sent && timer) {
            clearTimeout(timer);
        }
    }

    /**
     * 将请求加入 pending 队列
     * 当进程未连接时，将请求暂存到队列中，连接后自动发送
     * @param req - 请求对象
     * @param id - 请求 ID
     * @param timer - 超时定时器
     * @param timeout - 超时时间
     * @param reject - Promise reject 函数
     */
    private queuePendingRequest(
        req: RpcRequest,
        id: number,
        timer: NodeJS.Timeout | undefined,
        timeout: number,
        reject: (reason?: any) => void
    ): void {
        // 检查队列限制
        if (this.pendingMessages.length >= this.MAX_PENDING_MESSAGES) {
            this.cleanupAndReject(id, timer, reject, 
                `Exceeded maximum pending messages (${this.MAX_PENDING_MESSAGES})`,
                'Max Pending Messages Exceeded',
                { currentCount: this.pendingMessages.length, max: this.MAX_PENDING_MESSAGES });
            return;
        }

        // 取消当前定时器，连接后会重新计算剩余时间
        if (timer) {
            clearTimeout(timer);
            this.callbacks.set(id, { cb: this.callbacks.get(id)!.cb, timer: undefined });
        }

        // 加入队列
        this.pendingMessages.push({ 
            type: 'request', 
            data: req,
            timeoutStartTime: timeout > 0 ? Date.now() : undefined,
            timeoutDuration: timeout > 0 ? timeout : undefined
        });
    }

    /**
     * 清理回调和定时器，并 reject Promise
     * @param id - 请求 ID
     * @param timer - 超时定时器
     * @param reject - Promise reject 函数
     * @param errorMsg - 错误消息
     * @param errorType - 错误类型（可选，用于日志）
     * @param details - 错误详情（可选，用于日志）
     */
    private cleanupAndReject(
        id: number, 
        timer: NodeJS.Timeout | undefined,
        reject: (reason?: any) => void,
        errorMsg: string,
        errorType?: string,
        details?: any
    ): void {
        if (timer) clearTimeout(timer);
        this.callbacks.delete(id);
        
        if (errorType) {
            this.handleError(new Error(errorMsg), { type: errorType, details });
        }
        
        reject(new Error(errorMsg));
    }

    /**
     * 统一的 reject 和错误处理
     * @param reject - Promise reject 函数
     * @param errorType - 错误类型
     * @param errorMsg - 错误消息
     * @param details - 错误详情（可选）
     */
    private rejectWithError(
        reject: (reason?: any) => void,
        errorType: string,
        errorMsg: string,
        details?: any
    ): void {
        const error = new Error(errorMsg);
        this.handleError(error, { type: errorType, details });
        reject(error);
    }

    /**
     * 发送单向消息（fire-and-forget）
     * 不等待响应，适用于通知类消息
     * @param module - 模块名
     * @param method - 方法名
     * @param args - 方法参数
     * @throws 如果 RPC 实例已被 disposed、参数无效或队列已满
     * @example
     * rpc.send('logger', 'log', ['info message']);
     */
    send<
        K extends keyof TModules,
        M extends keyof TModules[K] & string
    >(module: K, method: M, args?: Parameters<TModules[K][M]>) {
        // 运行时保护：检查是否已 disposed
        if (this.isDisposed) {
            throw new Error('Cannot send: RPC instance has been disposed');
        }

        // 参数校验
        if (!module || !method) {
            throw new Error('Module and method are required');
        }

        if (!this.process) throw new Error('未挂载进程');

        const msg: RpcSend = {
            type: 'send',
            module: module as string,
            method: method as string,
            args: args || [],
        };

        if (!this.isConnected()) {
            // 检查 pending 消息数量限制
            if (this.pendingMessages.length >= this.MAX_PENDING_MESSAGES) {
                const error = new Error(`Exceeded maximum pending messages (${this.MAX_PENDING_MESSAGES})`);
                this.handleError(error, {
                    type: 'Max Pending Messages Exceeded',
                    details: { 
                        currentCount: this.pendingMessages.length, 
                        max: this.MAX_PENDING_MESSAGES,
                        module: module as string,
                        method: method as string
                    }
                });
                throw error;
            }
            this.pendingMessages.push({ type: 'send', data: msg });
            return;
        }

        this.safeSend(msg);
    }

    /**
     * 清理所有 pending 消息，并通知相关 promise
     * 会 reject 所有待处理的请求
     * @throws 如果 RPC 实例已被 disposed
     */
    clearPendingMessages() {
        // 运行时保护：检查是否已 disposed
        if (this.isDisposed) {
            throw new Error('Cannot clear pending messages: RPC instance has been disposed');
        }

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
        // 防止重复 dispose
        if (this.isDisposed) {
            return;
        }

        // 标记为已 disposed
        this.isDisposed = true;
        
        // 清理所有监听器和状态
        this.clearDisconnectListeners();
        
        // 清理所有 callbacks 和定时器
        const callbacksToReject = Array.from(this.callbacks.entries());
        this.callbacks.clear();
        
        for (const [id, entry] of callbacksToReject) {
            if (entry.timer) clearTimeout(entry.timer);
            try {
                entry.cb({ id, type: 'response', error: 'RPC disposed' });
            } catch {
                // ignore callback errors
            }
        }
        
        // 清理 pending messages
        this.pendingMessages = [];
        
        // 移除 message 监听
        if (this.process) {
            try { 
                this.process.off('message', this.onMessageBind); 
            } catch {
                // ignore
            }
        }
        
        this.process = undefined;
        this.handlers = {};
        this.msgId = 0;
    }
}
