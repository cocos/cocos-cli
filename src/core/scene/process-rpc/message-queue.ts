import { PendingMessage, RpcRequest } from './types';
import { CallbackManager } from './callback-manager';

/**
 * 消息队列管理器
 * 负责管理待发送的消息队列
 */
export class MessageQueue {
    private queue: PendingMessage[] = [];
    private flushScheduled = false;
    private retryCount = 0;
    private paused = false;
    private pauseTimer?: NodeJS.Timeout;
    private flushTimer?: NodeJS.Timeout;
    public sendBlocked = false;

    constructor(
        private readonly maxSize: number,
        private readonly maxRetries: number,
        private readonly batchSize: number,
        private sendMessage: (msg: RpcRequest | any) => boolean,
        private onRetryFailed: (reason: string) => void,
        private onMessageSent?: (msg: PendingMessage) => void
    ) {}

    enqueue(message: PendingMessage): void {
        if (this.queue.length >= this.maxSize) {
            throw new Error(`Exceeded maximum pending messages (${this.maxSize})`);
        }
        this.queue.push(message);
        this.sendBlocked = true;
    }

    scheduleFlush(): void {
        if (this.paused || this.flushScheduled || this.queue.length === 0) return;
        this.flushScheduled = true;
        this.flush();
    }

    pause(): void {
        this.paused = true;
        this.sendBlocked = true;
        console.log('[MessageQueue] Paused');

        this.clearTimer(this.pauseTimer);
        this.pauseTimer = setTimeout(() => {
            console.warn('[MessageQueue] Auto-resuming after 60s');
            this.resume();
        }, 60000);
    }

    resume(): void {
        if (!this.paused) return;
        this.paused = false;
        this.retryCount = 0;
        this.clearTimer(this.pauseTimer);
        this.pauseTimer = undefined;
        console.log('[MessageQueue] Resumed');

        if (this.queue.length > 0) this.scheduleFlush();
    }

    resetRetryCount(): void {
        this.retryCount = 0;
        console.log('[MessageQueue] Retry count reset');
    }

    rejectAllRequests(reason: string, callbackManager: CallbackManager): void {
        const requests = this.queue.filter(m => m.type === 'request');
        this.clear();

        for (const msg of requests) {
            const req = msg.data as RpcRequest;
            callbackManager.executeAndDelete(req.id, {
                id: req.id,
                type: 'response',
                error: reason
            });
        }
    }

    clear(): void {
        this.queue = [];
        this.flushScheduled = false;
        this.retryCount = 0;
        this.sendBlocked = false;
        this.paused = false;
        this.clearTimer(this.pauseTimer);
        this.clearTimer(this.flushTimer);
        this.pauseTimer = undefined;
        this.flushTimer = undefined;
    }

    get length(): number {
        return this.queue.length;
    }

    private flush(): void {
        if (this.paused || this.queue.length === 0) {
            this.flushScheduled = false;
            return;
        }

        const batch = this.queue.splice(0, Math.min(this.batchSize, this.queue.length));
        const failed: PendingMessage[] = [];

        for (const msg of batch) {
            if (this.sendMessage(msg.data)) {
                if (this.onMessageSent && msg.type === 'request') {
                    this.onMessageSent(msg);
                }
            } else {
                failed.push(msg);
            }
        }

        if (failed.length > 0) {
            this.queue.unshift(...failed);
        }

        if (this.queue.length === 0) {
            this.flushScheduled = false;
            this.retryCount = 0;
            this.sendBlocked = false;
        } else if (failed.length === batch.length) {
            // 全部失败
            this.retryCount++;
            if (this.retryCount > this.maxRetries) {
                this.flushScheduled = false;
                this.retryCount = 0;
                this.onRetryFailed(`Retry limit exceeded after ${this.maxRetries} attempts`);
                this.queue = [];
                this.sendBlocked = false;
            } else {
                // 指数退避
                this.flushScheduled = false;
                this.clearTimer(this.flushTimer);
                const delay = Math.min(100 * Math.pow(2, this.retryCount - 1), 5000);
                this.flushTimer = setTimeout(() => {
                    this.flushTimer = undefined;
                    this.scheduleFlush();
                }, delay);
            }
        } else {
            // 部分成功
            this.retryCount = 0;
            this.flushScheduled = false;
            setImmediate(() => this.scheduleFlush());
        }
    }

    private clearTimer(timer?: NodeJS.Timeout): void {
        if (timer) clearTimeout(timer);
    }
}

