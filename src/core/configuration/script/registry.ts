import { newConsole } from '../../base/console';
import * as utils from './utils';

/**
 * 配置注册选项
 */
export interface RegistryOptions {
    /**
     * 是否覆盖已存在的配置
     */
    overwrite?: boolean;
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
     * 获取所有已注册的配置
     * @returns 配置对象
     */
    getAll(): Record<string, Record<string, any>>;
    
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
}

/**
 * 配置注册器实现类
 */
export class ConfigurationRegistry implements IConfigurationRegistry {
    private configs: Record<string, Record<string, any>> = {};
    
    /**
     * 注册配置
     */
    public register(key: string, value: Record<string, any>, options: RegistryOptions = {}): Record<string, any> | null {
        if (!utils.isValidConfigKey(key)) {
            newConsole.warn('[ConfigurationRegistry] 注册配置失败：配置键名不能为空');
            return null;
        }
        
        if (!utils.isValidConfigValue(value)) {
            newConsole.warn('[ConfigurationRegistry] 注册配置失败：配置值必须是对象类型');
            return null;
        }
        
        // 检查配置是否已存在
        const exists = key in this.configs;
        if (exists && !options.overwrite) {
            newConsole.warn(`[ConfigurationRegistry] 配置项 "${key}" 已存在，跳过注册。如需覆盖，请设置 overwrite: true`);
            return this.configs[key];
        }
        
        try {
            this.configs[key] = value;
            
            if (exists && options.overwrite) {
                newConsole.debug(`[ConfigurationRegistry] 已覆盖配置: ${key}`);
            } else {
                newConsole.debug(`[ConfigurationRegistry] 已注册配置: ${key}`);
            }
            
            return value;
        } catch (error) {
            newConsole.error(`[ConfigurationRegistry] 注册配置失败: ${key} - ${error}`);
            return null;
        }
    }
    
    /**
     * 获取已注册的配置
     */
    public get(key: string): Record<string, any> | undefined {
        return this.configs[key];
    }
    
    /**
     * 获取所有已注册的配置
     */
    public getAll(): Record<string, Record<string, any>> {
        return { ...this.configs };
    }
    
    /**
     * 移除配置
     */
    public remove(key: string): boolean {
        if (!(key in this.configs)) {
            return false;
        }
        
        delete this.configs[key];
        newConsole.debug(`[ConfigurationRegistry] 已移除配置: ${key}`);
        return true;
    }
    
    /**
     * 清空所有配置
     */
    public clear(): void {
        const count = Object.keys(this.configs).length;
        this.configs = {};
        newConsole.debug(`[ConfigurationRegistry] 已清空所有配置，共移除 ${count} 个配置项`);
    }
}

/**
 * 默认配置注册器实例
 */
export const configurationRegistry = new ConfigurationRegistry();
