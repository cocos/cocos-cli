import { EventEmitter } from 'events';

/**
 * 配置范围
 */
export declare type ConfigurationScope = 'default' | 'project';

export declare type EventEmitterMethods = Pick<EventEmitter, 'on' | 'off' | 'once' | 'emit'>;

export declare function get<T>(key: string, scope?: ConfigurationScope): Promise<T>;

export declare function getConfigPath(): Promise<string>;

export declare function getMetadata(): Promise<ICocosConfigurationNode[]>;

/**
 * 配置基类接口
 */
export declare interface IBaseConfiguration extends EventEmitterMethods {
    /**
     * 模块名
     */
    moduleName: string;
    /**
     * 默认配置数据
     */
    getDefaultConfig(): Record<string, any> | undefined;
    mergeDefaultConfig(defaultConfig?: Record<string, any>): void;
    /**
     * 获取配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，不指定时按优先级查找
     */
    get<T>(key?: string, scope?: ConfigurationScope): Promise<T>;
    /**
     * 获取指定范围的所有配置，默认是 project
     * @param scope
     */
    getAll(scope?: ConfigurationScope): Record<string, any> | undefined;
    /**
     * 设置配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param value 新的配置值
     * @param scope 配置作用域，默认为 'project'
     */
    set<T>(key: string, value: T, scope?: ConfigurationScope): Promise<boolean>;
    /**
     * 移除配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，默认为 'project'
     */
    remove(key: string, scope?: ConfigurationScope): Promise<boolean>;
    /**
     * 保存配置
     */
    save(): Promise<boolean>;
}

export declare interface ICocosConfigurationNode {
    id: string;
    title: string;
    group: string;
    order?: number;
    properties: Record<string, ICocosConfigurationPropertySchema>;
}

export declare interface ICocosConfigurationPropertySchema {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    default?: unknown;
    title?: string;
    description?: string;
    enum?: Array<string | number | boolean>;
    enumDescriptions?: string[];
    minimum?: number;
    maximum?: number;
    step?: number;
    order?: number;
    properties?: Record<string, ICocosConfigurationPropertySchema>;
    items?: ICocosConfigurationPropertySchema | ICocosConfigurationPropertySchema[];
    additionalProperties?: boolean | ICocosConfigurationPropertySchema;
    required?: string[];
}

/**
 * 配置的格式
 */
export declare interface IConfiguration {
    /**
     * 其他配置
     */
    [key: string]: any;
}

export declare function init(projectPath: string): Promise<void>;

export declare function migrate(): Promise<void>;

export declare function migrateFromProject(): Promise<IConfiguration>;

/**
 * 注册 configurationManager 保存事件的监听器
 * 每次 cocos.config.json 被写入磁盘时触发
 * @returns 取消监听的函数
 */
export declare function onDidSave(callback: () => void): () => void;

export declare function reload(): Promise<void>;

export declare function remove(key: string, scope?: ConfigurationScope): Promise<boolean>;

export declare function save(force?: boolean): Promise<void>;

export declare function set<T>(key: string, value: T, scope?: ConfigurationScope): Promise<boolean>;

export { }
