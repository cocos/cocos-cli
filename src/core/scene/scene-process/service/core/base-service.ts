import { ServiceEvents } from './global-events';

export class BaseService<TEvents extends Record<string, any>> {
    /**
     * 触发事件
     * @param event 事件名称
     * @param args 事件参数（根据事件类型自动推断）
     */
    protected emit<K extends keyof TEvents>(
        event: K,
        ...args: TEvents[K] extends void ? [] : [TEvents[K]]
    ) {
        ServiceEvents.emit(event as string, ...args);
    }

    /**
     * 跨进程广播事件
     */
    broadcast<K extends keyof TEvents>(
        event: K,
        ...args: TEvents[K] extends void ? [] : [TEvents[K]]
    ): void {
        ServiceEvents.broadcast(event as string, ...args);
    }

    /**
     * 监听事件
     * @param event 事件名称
     * @param listener 事件监听器
     */
    protected on<K extends keyof TEvents>(
        event: K,
        listener: TEvents[K] extends void 
            ? () => void 
            : (payload: TEvents[K]) => void
    ) {
        ServiceEvents.on(event as string, listener);
    }

    /**
     * 一次性监听事件
     * @param event 事件名称
     * @param listener 事件监听器
     */
    protected once<K extends keyof TEvents>(
        event: K,
        listener: TEvents[K] extends void 
            ? () => void 
            : (payload: TEvents[K]) => void
    ) {
        ServiceEvents.once(event as string, listener);
    }

    /**
     * 移除事件监听器
     * @param event 事件名称
     * @param listener 事件监听器
     */
    protected off<K extends keyof TEvents>(
        event: K,
        listener: TEvents[K] extends void 
            ? () => void 
            : (payload: TEvents[K]) => void
    ) {
        ServiceEvents.off(event as string, listener);
    }

    /**
     * 清除事件监听器
     * @param event 事件名称，如果不提供则清除所有
     */
    protected clear(event?: keyof TEvents) {
        ServiceEvents.clear(event as string);
    }
}

