import * as utils from './utils';
import { ConfigurationScope, MessageType } from './interface';
import { EventEmitter } from 'events';

type EventEmitterMethods = Pick<EventEmitter, 'on' | 'off' | 'once' | 'emit'>;

/**
 * 配置基类接口
 */
export interface IBaseConfiguration extends EventEmitterMethods {
    /**
     * 模块名
     */
    moduleName: string;

    /**
     * 默认配置数据
     */
    getDefaultConfig(): Record<string, any> | undefined;

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

/**
 * 抽象配置类实现
 */
export class BaseConfiguration extends EventEmitter implements IBaseConfiguration {
    protected configs: Record<string, any> = {};

    constructor(
        public readonly moduleName: string,
        protected readonly defaultConfigs?: Record<string, any>
    ) {
        super();
    }

    public getDefaultConfig(): Record<string, any> {
        return this.defaultConfigs || {};
    }

    public getAll(scope: ConfigurationScope = 'project'): Record<string, any> | undefined {
        if (scope === 'default') {
            return this.getDefaultConfig();
        }
        return this.configs;
    }

    public async get<T>(key?: string, scope?: ConfigurationScope): Promise<T> {
        if (!key) {
            return utils.deepMerge(this.getDefaultConfig(), this.configs);
        }
        const projectConfig = utils.getByDotPath(this.configs, key);
        const hasProjectValue = projectConfig !== undefined;

        // 根据作用域决定返回策略
        if (scope === 'project') {
            if (!hasProjectValue) {
                throw new Error(`[Configuration] 通过 ${this.moduleName}.${key} 获取配置失败`);
            }
            return (projectConfig as T);
        }

        const defaultConfig = utils.getByDotPath(this.getDefaultConfig(), key);
        const hasDefaultValue = defaultConfig !== undefined;

        if (scope === 'default') {
            if (!hasDefaultValue) {
                throw new Error(`[Configuration] 通过 ${this.moduleName}.${key} 获取配置失败`);
            }
            return (defaultConfig as T);
        }

        // 如果项目配置和默认配置都不存在，抛出错误
        if (!hasProjectValue && !hasDefaultValue) {
            throw new Error(`[Configuration] 通过 ${this.moduleName}.${key} 获取配置失败`);
        }

        return (utils.deepMerge(defaultConfig, projectConfig) as T);
    }

    public async set<T>(key: string, value: T, scope: ConfigurationScope = 'project'): Promise<boolean> {
        if (scope === 'default') {
            utils.setByDotPath(this.defaultConfigs, key, value);
        } else {
            utils.setByDotPath(this.configs, key, value);
            await this.save();
        }
        return true;
    }

    public async remove(key: string, scope: ConfigurationScope = 'project'): Promise<boolean> {
        let removed = false;

        if (scope === 'default') {
            // 从默认配置中移除
            if (this.defaultConfigs) {
                removed = utils.removeByDotPath(this.defaultConfigs, key);
            }
        } else {
            // 从项目配置中移除
            removed = utils.removeByDotPath(this.configs, key);
            if (removed) {
                await this.save();
            }
        }

        return removed;
    }

    public async save() {
        this.emit(MessageType.Save, this);
        return true;
    }
}
