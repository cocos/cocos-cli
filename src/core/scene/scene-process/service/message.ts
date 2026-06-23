import { EventEmitter } from 'events';
import { TimerUtil } from './utils/timer-util';
import type { IMessageManagerEvents } from '../../common';

type MessageEvent = keyof IMessageManagerEvents;

class MessageManager {
    private _timerUtil: TimerUtil = new TimerUtil();
    private _emitter = new EventEmitter();

    public on<K extends MessageEvent>(event: K, listener: (...args: IMessageManagerEvents[K]) => void): void;
    public on(event: string, listener: (...args: any[]) => void): void;
    public on(event: any, listener: any): void {
        this._emitter.on(event as string, listener);
    }

    public once<K extends MessageEvent>(event: K, listener: (...args: IMessageManagerEvents[K]) => void): void;
    public once(event: string, listener: (...args: any[]) => void): void;
    public once(event: any, listener: any): void {
        this._emitter.once(event as string, listener);
    }

    public off<K extends MessageEvent>(event: K, listener: (...args: IMessageManagerEvents[K]) => void): void;
    public off(event: string, listener: (...args: any[]) => void): void;
    public off(event: any, listener: any): void {
        this._emitter.off(event as string, listener);
    }

    public broadcast<K extends MessageEvent>(event: K, ...args: IMessageManagerEvents[K]): void;
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

    // node:change 消息可能每帧都发送(特别是骨骼动画），太频繁造成卡顿，限制发送频率
    public broadcastNodeChangeMsg(...args: any[]) {
        this._timerUtil.callFunctionLimit(args[0], this.broadcast.bind(this), 'node:change', ...args);
    }
}

const messageManager = new MessageManager();

export { messageManager, MessageManager };
