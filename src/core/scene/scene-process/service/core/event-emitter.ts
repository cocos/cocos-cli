import { EventEmitter } from 'events';

/** 模块级事件系统基类（类型安全） */
export class EventEmitterService<TEvents extends Record<string, any>> {
    private readonly emitter = new EventEmitter();

    on<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void) {
        this.emitter.on(event as string, listener);
    }

    once<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void) {
        this.emitter.once(event as string, listener);
    }

    off<K extends keyof TEvents>(event: K, listener: (payload: TEvents[K]) => void) {
        this.emitter.off(event as string, listener);
    }

    emit<K extends keyof TEvents>(event: K, payload: TEvents[K]) {
        this.emitter.emit(event as string, payload);
    }

    clear(event?: keyof TEvents) {
        this.emitter.removeAllListeners(event as string);
    }
}
