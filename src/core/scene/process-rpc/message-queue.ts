import { PendingMessage, RpcRequest } from './types';
import { CallbackManager } from './callback-manager';

/**
 * 消息队列管理器
 * 负责管理待发送的消息队列
 */
export class MessageQueue {
    private queue: PendingMessage[] = [];
    private flushScheduled = false;
    private flushRetryCount = 0;
    public sendBlocked = false;
    private paused = false;

    constructor(
        private readonly maxSize: number,
        private readonly maxRetries: number,
        private readonly batchSize: number,
        private sendMessage: (msg: RpcRequest | any) => boolean,
        private onRetryFailed: (reason: string) => void
    ) {}

    /**
     * 添加消息到队列
     */
    enqueue(message: PendingMessage): void {
        if (this.queue.length >= this.maxSize) {
            throw new Error(`Exceeded maximum pending messages (${this.maxSize})`);
        }
        this.queue.push(message);
        this.sendBlocked = true;
    }

    /**
     * 调度 flush 操作
     */
    scheduleFlush(): void {
        if (this.paused || this.flushScheduled || this.queue.length === 0) return;
        
        this.flushScheduled = true;
        this.flush();
    }

    /**
     * 暂停队列处理
     * 用于进程重启前暂停发送，避免浪费重试次数
     */
    pause(): void {
        this.paused = true;
        console.log('[MessageQueue] Queue paused (process restarting)');
    }

    /**
     * 恢复队列处理
     * 用于进程重启后恢复发送，并重置重试计数
     */
    resume(): void {
        if (!this.paused) return;
        
        this.paused = false;
        this.flushRetryCount = 0; // 重置重试计数
        console.log('[MessageQueue] Queue resumed (process restarted)');
        
        // 立即尝试 flush
        if (this.queue.length > 0) {
            this.scheduleFlush();
        }
    }

    /**
     * 处理队列中的消息
     */
    private flush(): void {
        const batchSize = Math.min(this.batchSize, this.queue.length);
        const newQueue: PendingMessage[] = [];
        let successCount = 0;
        let failCount = 0;

        // 处理当前批次
        for (let i = 0; i < batchSize; i++) {
            const msg = this.queue[i];
            const sent = this.sendMessage(msg.data);
            
            if (sent) {
                successCount++;
            } else {
                failCount++;
                newQueue.push(msg);
            }
        }

        // 保留未处理的消息
        for (let i = batchSize; i < this.queue.length; i++) {
            newQueue.push(this.queue[i]);
        }
        
        this.queue = newQueue;

        // 决定下一步
        if (this.queue.length > 0) {
            this.handleRetry(successCount, failCount);
        } else {
            this.reset();
        }
    }

    /**
     * 处理重试逻辑
     */
    private handleRetry(successCount: number, failCount: number): void {
        if (failCount > 0 && successCount === 0) {
            // 全部失败
            this.flushRetryCount++;
            
            if (this.flushRetryCount > this.maxRetries) {
                this.flushScheduled = false;
                this.flushRetryCount = 0;
                this.onRetryFailed(`Flush retry limit exceeded after ${this.maxRetries} attempts`);
                this.queue = [];
                this.sendBlocked = false;
                return;
            }
            
            // 指数退避
            const backoffDelay = Math.min(100 * Math.pow(2, this.flushRetryCount - 1), 5000);
            setTimeout(() => {
                this.flushScheduled = false;
                this.scheduleFlush();
            }, backoffDelay);
        } else {
            // 有成功的消息
            this.flushRetryCount = 0;
            setImmediate(() => {
                this.flushScheduled = false;
                this.scheduleFlush();
            });
        }
    }

    /**
     * 重置状态
     */
    private reset(): void {
        this.flushScheduled = false;
        this.flushRetryCount = 0;
        this.sendBlocked = false;
    }

    /**
     * 重置重试计数器
     * 用于进程重启场景，给新进程一个新的重试机会
     */
    resetRetryCount(): void {
        this.flushRetryCount = 0;
        console.log('[MessageQueue] Retry count reset (process restart detected)');
    }

    /**
     * Reject 所有请求类型的消息
     */
    rejectAllRequests(reason: string, callbackManager: CallbackManager): void {
        for (const msg of this.queue) {
            if (msg.type === 'request') {
                const req = msg.data as RpcRequest;
                callbackManager.executeAndDelete(req.id, {
                    id: req.id,
                    type: 'response',
                    error: reason
                });
            }
        }
    }

    /**
     * 清空队列
     */
    clear(): void {
        this.queue = [];
        this.reset();
    }

    /**
     * 获取队列长度
     */
    get length(): number {
        return this.queue.length;
    }

    /**
     * 获取所有消息（用于遍历）
     */
    get messages(): PendingMessage[] {
        return this.queue;
    }
}

