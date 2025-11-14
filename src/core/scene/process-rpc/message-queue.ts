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
    private pauseTimer?: NodeJS.Timeout;
    private readonly PAUSE_TIMEOUT = 60000; // 60秒暂停超时
    private flushTimer?: NodeJS.Timeout; // 用于跟踪 flush 延迟定时器

    constructor(
        private readonly maxSize: number,
        private readonly maxRetries: number,
        private readonly batchSize: number,
        private sendMessage: (msg: RpcRequest | any) => boolean,
        private onRetryFailed: (reason: string) => void,
        private onMessageSent?: (msg: PendingMessage) => void
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
        this.sendBlocked = true; // 阻止新消息发送，强制进入队列
        console.log('[MessageQueue] Queue paused (process restarting)');
        
        // 设置暂停超时保护
        if (this.pauseTimer) {
            clearTimeout(this.pauseTimer);
        }
        this.pauseTimer = setTimeout(() => {
            console.warn('[MessageQueue] Pause timeout reached, auto-resuming queue');
            this.resume();
        }, this.PAUSE_TIMEOUT);
    }

    /**
     * 恢复队列处理
     * 用于进程重启后恢复发送，并重置重试计数
     */
    resume(): void {
        if (!this.paused) return;
        
        // 先设置 paused 为 false，避免 scheduleFlush 中的检查失败
        this.paused = false;
        this.clearPauseTimer();
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
        // 检查暂停状态，避免在暂停时继续 flush
        if (this.paused) {
            this.flushScheduled = false;
            return;
        }

        // 如果队列为空，直接返回（可能在 flush 执行前被清空）
        if (this.queue.length === 0) {
            this.reset();
            return;
        }

        const batchSize = Math.min(this.batchSize, this.queue.length);
        let successCount = 0;
        let failCount = 0;

        // 从队列前端取出批次消息
        const batch = this.queue.splice(0, batchSize);
        
        // 处理批次，失败的消息重新加入队列前端
        const failedMessages: PendingMessage[] = [];
        for (const msg of batch) {
            const sent = this.sendMessage(msg.data);
            
            if (sent) {
                successCount++;
                // 消息发送成功，通知恢复超时定时器
                if (this.onMessageSent && msg.type === 'request') {
                    this.onMessageSent(msg);
                }
            } else {
                failCount++;
                failedMessages.push(msg);
            }
        }

        // 将失败的消息放回队列前端
        if (failedMessages.length > 0) {
            this.queue.unshift(...failedMessages);
        }

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
            
            // 指数退避 - 清理旧定时器，防止定时器泄漏
            this.flushScheduled = false;
            this.clearFlushTimer();
            const backoffDelay = Math.min(100 * Math.pow(2, this.flushRetryCount - 1), 5000);
            this.flushTimer = setTimeout(() => {
                this.flushTimer = undefined;
                this.scheduleFlush();
            }, backoffDelay);
        } else {
            // 有成功的消息 - 先重置标志，再立即调度
            this.flushRetryCount = 0;
            this.flushScheduled = false;
            setImmediate(() => {
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
     * Reject 所有请求类型的消息并清空队列
     */
    rejectAllRequests(reason: string, callbackManager: CallbackManager): void {
        // 复制队列以避免在遍历时修改
        const queueCopy = [...this.queue];
        
        // 清空队列
        this.queue = [];
        this.reset();
        
        // 执行所有请求的回调
        for (const msg of queueCopy) {
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
        this.clearPauseTimer();
        this.clearFlushTimer();
        this.paused = false;
    }

    /**
     * 清除暂停定时器
     */
    private clearPauseTimer(): void {
        if (this.pauseTimer) {
            clearTimeout(this.pauseTimer);
            this.pauseTimer = undefined;
        }
        // 注意：不在这里设置 paused = false，由调用者控制
    }

    /**
     * 清除 flush 定时器
     */
    private clearFlushTimer(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    /**
     * 获取队列长度
     */
    get length(): number {
        return this.queue.length;
    }
}

