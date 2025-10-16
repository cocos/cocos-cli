import { EventEmitter } from 'events';

export type EventType = 'pack-build-end' | 'pack-build-start' | 'compiled' | 'compile-start';

/**
 * 用于事件派发
 */

export class CustomEvent extends EventEmitter {
    on(type: EventType, listener: (arg: any) => void): this { return super.on(type, listener); }
    off(type: EventType, listener: (arg: any) => void): this { return super.off(type, listener); }
    once(type: EventType, listener: (arg: any) => void): this { return super.once(type, listener); }
    emit(type: EventType, arg: any): boolean { return super.emit(type, ...arg); }
}

export const eventEmitter = new CustomEvent();