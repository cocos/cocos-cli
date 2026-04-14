/**
 * 纯 JS 实现的轻量 EventEmitter，替代 Node.js 的 EventEmitter
 * 在浏览器/Worker 环境中无需依赖 Node 'events' 模块
 */
class SimpleEventEmitter {
    private _listeners = new Map<string, Set<(...args: any[]) => void>>();

    on(event: string, listener: (...args: any[]) => void): void {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event)!.add(listener);
    }

    once(event: string, listener: (...args: any[]) => void): void {
        const wrapper = (...args: any[]) => {
            this.off(event, wrapper);
            listener(...args);
        };
        (wrapper as any)._original = listener;
        this.on(event, wrapper);
    }

    off(event: string, listener: (...args: any[]) => void): void {
        const set = this._listeners.get(event);
        if (!set) return;
        // 直接移除
        if (set.delete(listener)) return;
        // 尝试移除 once 包装
        for (const fn of set) {
            if ((fn as any)._original === listener) {
                set.delete(fn);
                return;
            }
        }
    }

    emit(event: string, ...args: any[]): void {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const listener of set) {
            listener(...args);
        }
    }

    removeAllListeners(event?: string): void {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }
}

// 全局共享的 EventEmitter 实例（内部使用，不对外暴露）
const globalEventEmitter = new SimpleEventEmitter();

/**
 * 全局事件管理器
 * 统一管理所有服务的事件监听，支持类型安全的事件订阅
 *
 * Fetch 方案改造：
 * - EventEmitter 替换为纯 JS 实现的 SimpleEventEmitter
 * - 移除 IMessageTransport 跨线程广播
 * - broadcast 退化为与 emit 相同的本地事件触发
 */
class GlobalEventManager {

    /**
     * 监听指定类型的事件（类型安全版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    on<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends void
            ? () => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    /**
     * 监听指定类型的事件（通用版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    on(event: string, listener: (...args: any[]) => void): void;
    on(event: any, listener: any): void {
        globalEventEmitter.on(event as string, listener);
    }

    /**
     * 监听指定类型的事件（一次性，类型安全版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    once<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends void
            ? () => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    /**
     * 监听指定类型的事件（一次性，通用版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    once(event: string, listener: (...args: any[]) => void): void;
    once(event: any, listener: any): void {
        globalEventEmitter.once(event as string, listener);
    }

    /**
     * 移除指定类型的事件监听器（类型安全版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    off<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends void
            ? () => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    /**
     * 移除事件监听器（通用版本）
     * @param event 事件名称
     * @param listener 事件监听器
     */
    off(event: string, listener: (...args: any[]) => void): void;
    off(event: any, listener: any): void {
        globalEventEmitter.off(event as string, listener);
    }

    /**
     * 发射指定类型的事件（类型安全版本）
     * @param event 事件名称
     * @param args 事件参数
     */
    emit<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        ...args: TEvents[keyof TEvents]
    ): void;
    /**
     * 触发事件（通用版本）
     * @param event 事件名称
     * @param args 事件参数
     */
    emit(event: string, ...args: any[]): void;
    emit(event: any, ...args: any[]): void {
        globalEventEmitter.emit(event, ...args);
    }

    /**
     * 广播事件
     *
     * Fetch 方案改造：
     * - 移除 process.send()（原实现：发送到 Node 父进程）
     * - 移除 IMessageTransport（Worker 方案的产物，Fetch 方案不需要）
     * - broadcast 退化为与 emit 相同的本地事件触发
     *
     * 如需向服务端推送事件，应由调用方主动 fetch 接口
     */
    broadcast<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        ...args: TEvents[keyof TEvents]
    ): void;
    broadcast(event: string, ...args: any[]): void;
    broadcast(event: any, ...args: any[]): void {
        globalEventEmitter.emit(event, ...args);
    }

    /**
     * 清除事件监听器
     * @param event 事件名称，如果不提供则清除所有
     */
    clear(event?: string): void {
        if (event) {
            globalEventEmitter.removeAllListeners(event);
        } else {
            globalEventEmitter.removeAllListeners();
        }
    }
}

// 导出全局单例
export const ServiceEvents = new GlobalEventManager();
