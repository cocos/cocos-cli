
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

export type AnyArgs = any[];

/**
 * 类型化的事件发射器接口
 * 替代 Pick<EventEmitter, 'on' | 'off' | 'once' | 'emit'>
 */
export interface TypedEventEmitter<T extends Record<string, AnyArgs>> {
    on<K extends keyof T>(eventName: K, listener: (...args: T[K]) => void): this;
    off<K extends keyof T>(eventName: K, listener: (...args: T[K]) => void): this;
    once<K extends keyof T>(eventName: K, listener: (...args: T[K]) => void): this;
    emit<K extends keyof T>(eventName: K, ...args: T[K]): boolean;
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
