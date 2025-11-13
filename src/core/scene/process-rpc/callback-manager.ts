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

        if (entry.timer) clearTimeout(entry.timer);
        
        if (this.callbacks.delete(id)) {
            try {
                entry.cb(response);
                return true;
            } catch {
                // ignore callback errors
            }
        }
        return false;
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
        const entries = Array.from(this.callbacks.entries());
        this.callbacks.clear();
        
        for (const [id, entry] of entries) {
            if (entry.timer) clearTimeout(entry.timer);
            try {
                entry.cb({ id, type: 'response', error: reason });
            } catch {
                // ignore callback errors
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

