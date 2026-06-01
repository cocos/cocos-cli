import type { EventEmitter } from 'events';

/**
 * 配置范围
 */
export type ConfigurationScope = 'default' | 'project';

export const ConfigurationEventName = {
    Save: 'configuration:save',
    Registry: 'configuration:registry',
    UnRegistry: 'configuration:unregistry',
    Reload: 'configuration:reload',
    Update: 'configuration:update',
    Remove: 'configuration:remove',
} as const;

/**
 * @deprecated Use ConfigurationEventName instead.
 */
export const MessageType = ConfigurationEventName;

export type AnyArgs = any[];
export type EventEmitterMethods = Pick<EventEmitter, 'on' | 'off' | 'once' | 'emit'>;

/**
 * 类型化的事件发射器接口
 * 在 EventEmitterMethods 基础上补充已知事件的参数类型
 */
export interface TypedEventEmitter<T extends Record<string, AnyArgs>> extends EventEmitterMethods {
    on<K extends keyof T>(eventName: K, listener: (...args: T[K]) => void): EventEmitter;
    on(eventName: string | symbol, listener: (...args: any[]) => void): EventEmitter;
    off<K extends keyof T>(eventName: K, listener: (...args: T[K]) => void): EventEmitter;
    off(eventName: string | symbol, listener: (...args: any[]) => void): EventEmitter;
    once<K extends keyof T>(eventName: K, listener: (...args: T[K]) => void): EventEmitter;
    once(eventName: string | symbol, listener: (...args: any[]) => void): EventEmitter;
    emit<K extends keyof T>(eventName: K, ...args: T[K]): boolean;
    emit(eventName: string | symbol, ...args: any[]): boolean;
}

/**
 * 配置的格式
 */
export interface IConfiguration {

    /**
     * 其他配置
     */
    [key: string]: any;
}
