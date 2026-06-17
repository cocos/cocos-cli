import { EventEmitter } from 'events';
import { TimerUtil } from './utils/timer-util';

class MessageManager {
    private _timerUtil: TimerUtil = new TimerUtil();
    private _emitter = new EventEmitter();

    public on<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends any[]
            ? (...args: TEvents[keyof TEvents]) => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    public on(event: string, listener: (...args: any[]) => void): void;
    public on(event: any, listener: any): void {
        this._emitter.on(event as string, listener);
    }

    public once<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends any[]
            ? (...args: TEvents[keyof TEvents]) => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    public once(event: string, listener: (...args: any[]) => void): void;
    public once(event: any, listener: any): void {
        this._emitter.once(event as string, listener);
    }

    public off<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        listener: TEvents[keyof TEvents] extends any[]
            ? (...args: TEvents[keyof TEvents]) => void
            : (payload: TEvents[keyof TEvents]) => void
    ): void;
    public off(event: string, listener: (...args: any[]) => void): void;
    public off(event: any, listener: any): void {
        this._emitter.off(event as string, listener);
    }

    public broadcast<TEvents extends Record<string, any>>(
        event: keyof TEvents,
        ...args: TEvents[keyof TEvents] extends any[] ? TEvents[keyof TEvents] : [TEvents[keyof TEvents]]
    ): void;
    public broadcast(event: string, ...args: any[]): void;
    public broadcast(event: any, ...args: any[]): void {
        this._emitter.emit(event as string, ...args);
    }

    public clear(event?: string): void {
        if (event) {
            this._emitter.removeAllListeners(event);
        } else {
            this._emitter.removeAllListeners();
        }
    }

    // 因为ChangeNode消息有可能每帧都发送(特别是骨骼动画），太频繁了造成卡顿，所以限制了发送频率
    public broadcastChangeNodeMsg(node: any) {
        this._timerUtil.callFunctionLimit(node, this.broadcast.bind(this), 'scene:change-node', node);
    }
}

const messageManager = new MessageManager();

export { messageManager, MessageManager };
