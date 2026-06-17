import { EventEmitter } from 'events';
import { TimerUtil } from './utils/timer-util';

class MessageManager {
    private _timerUtil: TimerUtil = new TimerUtil();
    private _emitter = new EventEmitter();

    public on(event: string, listener: (...args: any[]) => void): void {
        this._emitter.on(event, listener);
    }

    public once(event: string, listener: (...args: any[]) => void): void {
        this._emitter.once(event, listener);
    }

    public off(event: string, listener: (...args: any[]) => void): void {
        this._emitter.off(event, listener);
    }

    public broadcast(name: string, ...msg: any[]) {
        this._emitter.emit(name, ...msg);
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

export { messageManager };
