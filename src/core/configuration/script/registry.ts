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
     * 注册配置
     * @param moduleName 模块名
     * @returns 注册成功返回配置实例或配置对象，失败返回 null
     */
    register(moduleName: string): Promise<IBaseConfiguration>;

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
     * 注册配置
     * @param moduleName 模块名
     * @param defaultConfig
     * @returns 注册成功返回配置实例或配置对象，失败报错
     */
    public async register(moduleName: string, defaultConfig?: Record<string, any>): Promise<IBaseConfiguration> {
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
        const instance = this.instances[moduleName] = new BaseConfiguration(moduleName, defaultConfig);
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
