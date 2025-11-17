import { CallbackEntry, RpcResponse } from './types';

/**
 * 回调管理器
 * 负责管理所有 RPC 请求的回调和超时
 */
export class CallbackManager {
    private callbacks = new Map<number, CallbackEntry>();
    private msgId = 0;
    private readonly MAX_MSG_ID = Number.MAX_SAFE_INTEGER - 1;

    constructor(
        private readonly maxCallbacks: number,
        private readonly defaultTimeout: number
    ) {}

    /**
     * 生成唯一消息 ID
     */
    generateId(): number {
        for (let i = 0; i < 1000; i++) {
            this.msgId = (this.msgId >= this.MAX_MSG_ID) ? 1 : this.msgId + 1;
            if (!this.callbacks.has(this.msgId)) return this.msgId;
        }
        throw new Error('Unable to generate unique message ID after 1000 attempts');
    }

    /**
     * 创建超时定时器
     */
    createTimer(id: number, module: string, method: string, timeout?: number): NodeJS.Timeout | undefined {
        const ms = timeout === undefined ? this.defaultTimeout : Math.max(0, timeout);
        if (ms === 0) return undefined;

        return setTimeout(() => {
            this.executeAndDelete(id, {
                id,
                type: 'response',
                error: `RPC request timeout: ${module}.${method}`
            });
        }, ms);
    }

    /**
     * 注册回调
     */
    register(id: number, cb: (msg: RpcResponse) => void, timer?: NodeJS.Timeout): void {
        if (this.callbacks.size >= this.maxCallbacks) {
            throw new Error(`Exceeded maximum concurrent requests (${this.maxCallbacks})`);
        }
        this.callbacks.set(id, { cb, timer });
    }

    /**
     * 检查 ID 是否存在
     */
    has(id: number): boolean {
        return this.callbacks.has(id);
    }

    /**
     * 删除回调
     */
    delete(id: number): boolean {
        return this.callbacks.delete(id);
    }

    /**
     * 执行并清理回调
     */
    executeAndDelete(id: number, response: RpcResponse): boolean {
        const entry = this.callbacks.get(id);
        if (!entry || !this.callbacks.delete(id)) return false;

        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
        }

        try {
            entry.cb(response);
            return true;
        } catch (error) {
            console.warn(`[CallbackManager] Callback execution error for id ${id}:`, error);
            return false;
        }
    }

    /**
     * 更新回调的定时器
     */
    updateTimer(id: number, timer: NodeJS.Timeout | undefined): void {
        const entry = this.callbacks.get(id);
        if (entry) {
            if (entry.timer) clearTimeout(entry.timer);
            entry.timer = timer;
        }
    }

    /**
     * 计算剩余超时时间并设置定时器
     */
    setupRemainingTimer(id: number, module: string, method: string, startTime: number, duration: number): void {
        const entry = this.callbacks.get(id);
        if (!entry) return;

        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, duration - elapsed);

        if (entry.timer) clearTimeout(entry.timer);

        if (remaining > 0) {
            entry.timer = this.createTimer(id, module, method, remaining);
        } else {
            this.executeAndDelete(id, {
                id,
                type: 'response',
                error: `RPC request timeout: ${module}.${method}`
            });
        }
    }

    /**
     * 清理所有回调
     */
    clear(reason: string): void {
        const entries = Array.from(this.callbacks.entries());
        this.callbacks.clear();

        for (const [, entry] of entries) {
            if (entry.timer) {
                clearTimeout(entry.timer);
                entry.timer = undefined;
            }
        }

        for (const [id, entry] of entries) {
            try {
                entry.cb({ id, type: 'response', error: reason });
            } catch (error) {
                console.warn(`[CallbackManager] Callback error for id ${id}:`, error);
            }
        }
    }

    /**
     * 重置 ID 计数器
     */
    reset(): void {
        this.msgId = 0;
    }

    get size(): number {
        return this.callbacks.size;
    }
}

