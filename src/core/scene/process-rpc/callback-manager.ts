import { CallbackEntry, RpcResponse } from './types';

/**
 * 回调管理器
 * 负责管理所有 RPC 请求的回调和超时
 */
export class CallbackManager {
    private callbacks = new Map<number, CallbackEntry>();

    constructor(private readonly maxCallbacks: number) {}

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
     * 获取回调
     */
    get(id: number): CallbackEntry | undefined {
        return this.callbacks.get(id);
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
        if (!entry) return false;

        // 先删除回调，避免定时器触发时重复执行
        if (!this.callbacks.delete(id)) return false;

        // 清理定时器并显式置空引用
        if (entry.timer) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
        }
        
        // 执行回调
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
     * 清理所有回调
     */
    clear(reason: string): void {
        // 先复制条目，再清空 Map，确保即使回调中有异常也能完全清理
        const entries = Array.from(this.callbacks.entries());
        this.callbacks.clear();
        
        // 先清理所有定时器，再执行回调，防止回调执行时间过长导致定时器泄漏
        for (const [, entry] of entries) {
            if (entry.timer) {
                clearTimeout(entry.timer);
                entry.timer = undefined; // 显式置空引用
            }
        }
        
        // 执行回调通知
        for (const [id, entry] of entries) {
            try {
                entry.cb({ id, type: 'response', error: reason });
            } catch (error) {
                // 记录回调错误，便于调试
                console.warn(`[CallbackManager] Callback execution error for id ${id}:`, error);
            }
        }
    }

    /**
     * 获取当前回调数量
     */
    get size(): number {
        return this.callbacks.size;
    }
}

