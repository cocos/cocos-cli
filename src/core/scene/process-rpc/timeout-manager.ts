import { RpcResponse } from './types';
import { CallbackManager } from './callback-manager';

/**
 * 超时管理器
 * 负责处理请求超时逻辑
 */
export class TimeoutManager {
    constructor(
        private readonly defaultTimeout: number,
        private callbackManager: CallbackManager
    ) {}

    /**
     * 生成超时错误消息
     */
    static getTimeoutError(module: string, method: string): string {
        return `RPC request timeout: ${module}.${method}`;
    }

    /**
     * 创建超时定时器
     */
    createTimer(id: number, module: string, method: string, timeout: number): NodeJS.Timeout | undefined {
        const normalizedTimeout = this.normalizeTimeout(timeout);
        if (normalizedTimeout === 0) return undefined;

        return this.createTimeoutTimer(id, module, method, normalizedTimeout);
    }

    /**
     * 设置超时定时器（用于 pending 消息）
     */
    setupTimer(id: number, module: string, method: string, timeout: number): void {
        const entry = this.callbackManager.get(id);
        if (!entry) return;

        // 如果已有定时器，先清理旧的
        if (entry.timer) {
            clearTimeout(entry.timer);
        }

        const timer = this.createTimeoutTimer(id, module, method, timeout);
        this.callbackManager.updateTimer(id, timer);
    }

    /**
     * 创建超时定时器（内部方法）
     */
    private createTimeoutTimer(id: number, module: string, method: string, timeout: number): NodeJS.Timeout {
        return setTimeout(() => {
            this.callbackManager.executeAndDelete(id, {
                id,
                type: 'response',
                error: TimeoutManager.getTimeoutError(module, method)
            });
        }, timeout);
    }

    /**
     * 标准化超时值
     */
    normalizeTimeout(timeout?: number): number {
        if (timeout === undefined) return this.defaultTimeout;
        return timeout < 0 ? 0 : timeout;
    }

    /**
     * 计算剩余超时时间
     */
    calculateRemaining(startTime: number, duration: number): number {
        const elapsed = Date.now() - startTime;
        return Math.max(0, duration - elapsed);
    }
}

