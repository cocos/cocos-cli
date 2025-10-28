/**
 * 用于在某个时间等待某个事件回调
 * @param emitter
 * @param event
 * @param timeout
 */
export function once<TEvents extends Record<string, any>>(
    emitter: {
        on<TKey extends keyof TEvents>(event: TKey, handler: (data: TEvents[TKey]) => void): void;
        off<TKey extends keyof TEvents>(event: TKey, handler: (data: TEvents[TKey]) => void): void;
    },
    event: keyof TEvents,
    timeout = 30000
): Promise<TEvents[keyof TEvents]> {
    return new Promise((resolve, reject) => {
        const handler = (data: any) => {
            clearTimeout(timer);
            emitter.off(event, handler);
            resolve(data);
        };
        const timer = setTimeout(() => {
            emitter.off(event, handler);
            reject(new Error(`Timeout waiting for event "${String(event)}"`));
        }, timeout);
        emitter.on(event, handler);
    });
}