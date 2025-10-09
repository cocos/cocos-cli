import { newConsole } from '../../base/console';
import * as utils from './utils';
import { IBaseConfiguration, BaseConfiguration } from './config';
import { EventEmitter } from 'events';
import { MessageType } from './interface';

/**
 * 配置注册器接口
 */
export interface IConfigurationRegistry {
    /**
     * 获取所有配置实例
     */
    getInstances(): Record<string, IBaseConfiguration>;

    /**
     * 通过模块名获取配置实例
     * @param moduleName
     */
    getInstance(moduleName: string): IBaseConfiguration | undefined;

    /**
     * 注册配置（使用默认配置对象）
     * @param moduleName 模块名
     * @param defaultConfig 默认配置对象
     * @returns 注册成功返回配置实例，失败返回 null
     */
    register(moduleName: string, defaultConfig?: Record<string, any>): Promise<IBaseConfiguration>;

    /**
     * 注册配置（使用自定义配置实例）
     * @param moduleName 模块名
     * @param instance 自定义配置实例
     * @returns 注册成功返回配置实例，失败返回 null
     */
    register<T extends IBaseConfiguration>(moduleName: string, instance: T): Promise<T>;

    /**
     * 反注册配置
     * @param moduleName
     */
    unregister(moduleName: string): Promise<void>;
}

/**
 * 配置注册器实现类
 */
export class ConfigurationRegistry extends EventEmitter implements IConfigurationRegistry {
    private instances: Record<string, IBaseConfiguration> = {};

    /**
     * 获取所有配置实例
     */
    public getInstances() {
        return this.instances;
    }

    /**
     * 通过模块名获取配置实例
     * @param moduleName
     */
    public getInstance(moduleName: string): IBaseConfiguration | undefined {
        const instance = this.instances[moduleName];
        if (!instance) {
            console.warn(`[Configuration] 获取配置实例错误，${moduleName} 未注册配置。`);
            return undefined;
        }
        return instance;
    }

    /**
     * 注册配置（使用默认配置对象）
     * @param moduleName 模块名
     * @param defaultConfig 默认配置对象
     * @returns 注册成功返回配置实例，失败报错
     */
    public async register(moduleName: string, defaultConfig?: Record<string, any>): Promise<IBaseConfiguration>;
    
    /**
     * 注册配置（使用自定义配置实例）
     * @param moduleName 模块名
     * @param instance 自定义配置实例
     * @returns 注册成功返回配置实例，失败报错
     */
    public async register<T extends IBaseConfiguration>(moduleName: string, instance: T): Promise<T>;
    
    public async register<T extends IBaseConfiguration>(moduleName: string, configOrInstance?: Record<string, any> | T): Promise<IBaseConfiguration | T> {
        if (!utils.isValidConfigKey(moduleName)) {
            throw new Error('[Configuration] 注册配置失败：模块名不能为空。');
        }
        
        // 检查配置是否已存在
        const existingInstance = this.instances[moduleName];
        const exists = existingInstance !== undefined;
        
        if (exists) {
            newConsole.warn(`[Configuration] 配置项 "${moduleName}" 已存在，跳过注册。`);
            return existingInstance;
        }
        
        let instance: IBaseConfiguration | T;
        
        // 判断第二个参数是配置对象还是配置实例
        if (configOrInstance && 'moduleName' in configOrInstance && typeof configOrInstance.get === 'function') {
            // 是配置实例
            instance = configOrInstance as T;
            // 验证实例的模块名是否匹配
            if (instance.moduleName !== moduleName) {
                throw new Error(`[Configuration] 注册配置失败：配置实例的模块名 "${instance.moduleName}" 与注册的模块名 "${moduleName}" 不匹配。`);
            }
        } else {
            // 是配置对象或 undefined
            instance = new BaseConfiguration(moduleName, configOrInstance as Record<string, any>);
        }
        
        this.instances[moduleName] = instance;
        this.emit(MessageType.Registry, instance);
        return instance;
    }

    public async unregister(moduleName: string): Promise<void> {
        this.emit(MessageType.UnRegistry, this.instances[moduleName]);
        delete this.instances[moduleName];
    }
}

/**
 * 默认配置注册器实例
 */
export const configurationRegistry = new ConfigurationRegistry();
