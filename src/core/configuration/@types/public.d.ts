
export type ConfigurationScope = 'default' | 'project';

/**
 * 配置注册选项
 */
export interface RegistryOptions {
    /**
     * 是否覆盖已存在的配置
     */
    overwrite?: boolean;
    
    /**
     * 配置描述信息
     */
    description?: string;
    
    /**
     * 配置版本
     */
    version?: string;
}

/**
 * 配置注册项信息
 */
export interface RegistryItem {
    /**
     * 配置键名
     */
    key: string;
    
    /**
     * 配置值
     */
    value: Record<string, any>;
    
    /**
     * 注册时间戳
     */
    timestamp: number;
    
    /**
     * 配置描述
     */
    description?: string;
    
    /**
     * 配置版本
     */
    version?: string;
}

/**
 * 配置注册器接口
 */
export interface IConfigurationRegistry {
    /**
     * 注册配置
     * @param key 配置键名
     * @param value 配置值
     * @param options 注册选项
     * @returns 注册成功返回配置对象，失败返回 null
     */
    register(key: string, value: Record<string, any>, options?: RegistryOptions): Record<string, any> | null;
    
    /**
     * 获取已注册的配置
     * @param key 配置键名
     * @returns 配置值，如果不存在返回 undefined
     */
    get(key: string): Record<string, any> | undefined;
    
    /**
     * 检查配置是否已注册
     * @param key 配置键名
     * @returns 是否已注册
     */
    has(key: string): boolean;
    
    /**
     * 获取所有已注册的配置键名
     * @returns 配置键名数组
     */
    keys(): string[];
    
    /**
     * 获取所有已注册的配置
     * @returns 配置对象
     */
    getAll(): Record<string, Record<string, any>>;
    
    /**
     * 获取注册项信息
     * @param key 配置键名
     * @returns 注册项信息，如果不存在返回 undefined
     */
    getItemInfo(key: string): RegistryItem | undefined;
    
    /**
     * 获取所有注册项信息
     * @returns 注册项信息数组
     */
    getAllItemsInfo(): RegistryItem[];
    
    /**
     * 移除配置
     * @param key 配置键名
     * @returns 是否移除成功
     */
    remove(key: string): boolean;
    
    /**
     * 清空所有配置
     */
    clear(): void;
    
    /**
     * 获取注册器统计信息
     */
    getStats(): {
        total: number;
        keys: string[];
        lastRegistered?: string;
    };
}

export interface IConfigurationManager {
    /**
     * 获取配置
     * @param key 配置键名，支持点号分隔的嵌套路径，如 'builder.platforms.web-mobile'
     * @param scope 配置作用域，不指定时按优先级查找
     */
    getValue<T>(key: string, scope?: ConfigurationScope): Promise<T | undefined>;

    /**
     * 更新配置
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param value 新的配置值
     * @param scope 配置作用域，默认为 'project'
     */
    updateValue<T>(key: string, value: T, scope?: ConfigurationScope): Promise<boolean>;

    /**
     * 初始化配置管理器
     */
    initialize(projectPath: string): Promise<void>;
}

export interface IConfiguration {
    /**
     * 版本号
     */
    version: string;

    /**
     * 其他配置
     */
    [key: string]: any;
}
