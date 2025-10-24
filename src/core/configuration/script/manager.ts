import { gt } from 'semver';
import path from 'path';
import fse from 'fs-extra';
import { newConsole } from '../../base/console';
import * as utils from './utils';
import { IConfiguration, ConfigurationScope, MessageType } from './interface';
import { CocosMigrationManager } from '../migration';
import { configurationRegistry } from './registry';
import { IBaseConfiguration } from './config';

export interface IConfigurationManager {
    /**
     * 初始化配置管理器
     */
    initialize(projectPath: string): Promise<void>;

    /**
     * 获取配置
     * @param key 配置键名，支持点号分隔的嵌套路径，如 'test.x.x'，第一位作为模块名
     * @param scope 配置作用域，不指定时按优先级查找
     */
    get<T>(key: string, scope?: ConfigurationScope): Promise<T>;

    /**
     * 设置配置
     * @param key 配置键名，支持点号分隔的嵌套路径，如 'test.x.x'，第一位作为模块名
     * @param value 新的配置值
     * @param scope 配置作用域，默认为 'project'
     */
    set<T>(key: string, value: T, scope?: ConfigurationScope): Promise<boolean>;

    /**
     * 移除配置
     * @param key 配置键名，支持点号分隔的嵌套路径，如 'test.x.x'，第一位作为模块名
     * @param scope 配置作用域，默认为 'project'
     */
    remove(key: string, scope?: ConfigurationScope): Promise<boolean>;
}

export class ConfigurationManager implements IConfigurationManager {

    static VERSION: string = '1.0.0';
    static name = 'cocos.config.json';

    private initialized: boolean = false;
    private projectPath: string = '';
    private configPath: string = '';
    private projectConfig: IConfiguration = {};

    private _version: string = '0.0.0';
    get version(): string {
        return this._version;
    }
    set version(value: string) {
        this._version = value;
    }

    private configurationMap: Map<string, (...args: any[]) => void> = new Map();
    private onRegistryConfigurationBind = this.onRegistryConfiguration.bind(this);
    private onUnRegistryConfigurationBind = this.onUnRegistryConfiguration.bind(this);

    /**
     * 初始化配置管理器
     */
    public async initialize(projectPath: string): Promise<void> {
        if (this.initialized) {
            return;
        }

        configurationRegistry.on(MessageType.Registry, this.onRegistryConfigurationBind);
        configurationRegistry.on(MessageType.UnRegistry, this.onUnRegistryConfigurationBind);

        this.projectPath = projectPath;
        this.configPath = path.join(projectPath, ConfigurationManager.name);
        await this.load();
        try {
            // 迁移不能影响正常的配置初始化流程
            await this.migrate();
        } catch (error) {
            console.error(error);
        }
        this.initialized = true;
    }

    public async reload(): Promise<void> {
        await this.load();
        // 迁移不能影响正常的配置初始化流程
        await this.migrate();
    }

    private onRegistryConfiguration(instance: IBaseConfiguration): void {
        if (!this.configurationMap.has(instance.moduleName)) {
            // 从 projectConfig 中获取现有配置并初始化到配置实例中
            const existingConfig = this.projectConfig[instance.moduleName];
            if (existingConfig && typeof existingConfig === 'object') {
                // 将现有配置设置到配置实例的 configs 中
                this.initializeConfigFromProject(instance, existingConfig);
            }

            const bind = async (configInstance: IBaseConfiguration) => {
                this.projectConfig[configInstance.moduleName] = configInstance.getAll();
                await this.save();
            };
            instance.on(MessageType.Save, bind);
            this.configurationMap.set(instance.moduleName, bind);
        }
    }

    private onUnRegistryConfiguration(instances: IBaseConfiguration): void {
        const bind = this.configurationMap.get(instances.moduleName);
        if (bind) {
            // TODO 是否需要删除
            instances.off(MessageType.Save, bind);
            this.configurationMap.delete(instances.moduleName);
        }
    }

    /**
     * 从项目配置中初始化配置实例
     * @param instance 配置实例
     * @param existingConfig 现有的项目配置
     * @private
     */
    private initializeConfigFromProject(instance: IBaseConfiguration, existingConfig: Record<string, any>): void {
        // 必须是 BaseConfiguration 类型，否则抛出错误
        if (!('configs' in instance) || typeof instance.configs !== 'object') {
            const instanceType = instance.constructor?.name || 'Unknown';
            throw new Error(`配置实例必须是 BaseConfiguration 类型，但收到的是 ${instanceType}`);
        }
        // 直接设置 configs 属性
        instance.configs = utils.deepMerge({}, existingConfig);
    }


    /**
     * 迁移，包含了 3x 迁移，允许外部单独触发
     */
    public async migrate(): Promise<void> {
        const upgrade = gt(ConfigurationManager.VERSION, this.version);
        if (upgrade) {
            // TODO 新版本迁移
            // 3.x 迁移
            await this.migrateFromProject(this.projectPath);
        } else {
            console.debug('[Configuration] 项目配置已是最新版本，无需迁移');
        }
    }

    /**
     * 从指定项目路径迁移配置到当前项目
     * @param projectPath 项目路径
     * @returns 迁移后的项目配置
     */
    public async migrateFromProject(projectPath: string): Promise<IConfiguration> {
        const list = await CocosMigrationManager.migrate(projectPath);
        this.projectConfig = utils.deepMerge(this.projectConfig, list.project) as IConfiguration;
        await this.save();
        return this.projectConfig;
    }

    /**
     * 解析配置键，提取模块名和实际键名
     * @param key 配置键名，如 'test.x.x'
     * @private
     */
    private parseKey(key: string): { moduleName: string; actualKey: string } {
        if (!utils.isValidConfigKey(key)) {
            throw new Error('配置键名不能为空');
        }

        const parts = key.split('.');
        if (parts.length < 2) {
            throw new Error('配置键名格式错误，必须包含模块名，如 "module.key"');
        }

        const moduleName = parts[0];
        const actualKey = parts.slice(1).join('.');

        if (!actualKey || actualKey.trim() === '') {
            throw new Error('配置键名不能为空');
        }

        return { moduleName, actualKey };
    }

    /**
     * 获取模块配置实例
     * @param moduleName 模块名
     * @private
     */
    private getInstance(moduleName: string): IBaseConfiguration {
        const instance = configurationRegistry.getInstance(moduleName);
        if (!instance) {
            throw new Error(`[Configuration] 设置配置错误，${moduleName} 未注册`);
        }
        return instance;
    }

    /**
     * 获取配置值
     * 读取规则：优先读项目配置，如果没有再读默认配置，默认配置也没定义的话，就打印警告日志
     * @param key 配置键名，支持点号分隔的嵌套路径，如 'test.x.x'，第一位作为模块名
     * @param scope 配置作用域，不指定时按优先级查找
     */
    public async get<T>(key: string, scope?: ConfigurationScope): Promise<T> {
        try {
            await this.ensureInitialized();
            const { moduleName, actualKey } = this.parseKey(key);
            return await this.getInstance(moduleName).get(actualKey, scope) as T;
        } catch (error) {
            throw new Error(`[Configuration] 获取配置失败：${error}`);
        }
    }

    /**
     * 更新配置值
     * @param key 配置键名，支持点号分隔的嵌套路径，如 'test.x.x'，第一位作为模块名
     * @param value 新的配置值
     * @param scope 配置作用域，默认为 'project'
     */
    public async set<T>(key: string, value: T, scope: ConfigurationScope = 'project'): Promise<boolean> {
        try {
            await this.ensureInitialized();
            const { moduleName, actualKey } = this.parseKey(key);
            await this.getInstance(moduleName).set(actualKey, value, scope);
            return true;
        } catch (error) {
            throw new Error(`[Configuration] 更新配置失败：${error}`);
        }
    }

    /**
     * 移除配置值
     * @param key 配置键名，支持点号分隔的嵌套路径，如 'test.x.x'，第一位作为模块名
     * @param scope 配置作用域，默认为 'project'
     */
    public async remove(key: string, scope: ConfigurationScope = 'project'): Promise<boolean> {
        try {
            await this.ensureInitialized();
            const { moduleName, actualKey } = this.parseKey(key);
            return await this.getInstance(moduleName).remove(actualKey, scope);
        } catch (error) {
            throw new Error(`[Configuration] 移除配置失败：${error}`);
        }
    }

    /**
     * 确保配置管理器已初始化
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            throw new Error('[Configuration] 未初始化');
        }
    }

    /**
     * 加载项目配置
     */
    private async load(): Promise<void> {
        try {
            if (await fse.pathExists(this.configPath)) {
                this.projectConfig = await fse.readJSON(this.configPath);
                this.projectConfig.version && (this.version = this.projectConfig.version);
                newConsole.debug(`[Configuration] 已加载项目配置: ${this.configPath}`, this.projectConfig);
            } else {
                newConsole.debug(`[Configuration] 项目配置文件不存在，将创建新文件: ${this.configPath}`);
                // 创建默认配置文件
                await this.save();
            }
        } catch (error) {
            newConsole.error(`[Configuration] 加载项目配置失败: ${this.configPath} - ${error}`);
        }
    }

    /**
     * 保存项目配置
     */
    private async save(): Promise<void> {
        if (!this.projectConfig) {
            return;
        }
        try {
            this.version = ConfigurationManager.VERSION;
            // 确保目录存在
            await fse.ensureDir(path.dirname(this.configPath));
            this.projectConfig.version = this.version;
            // 保存配置文件
            await fse.writeJSON(this.configPath, {
                version: this._version,
                ...this.projectConfig,
            }, { spaces: 4 });
            newConsole.debug(`[Configuration] 已保存项目配置: ${this.configPath}`);
        } catch (error) {
            newConsole.error(`[Configuration] 保存项目配置失败: ${this.configPath} - ${error}`);
            throw error;
        }
    }

    reset() {
        this.initialized = false;
        this.projectPath = '';
        this.configPath = '';
        this.projectConfig = {};
        this.version = '0.0.0';
        this.configurationMap.clear();
    }
}

export const configurationManager = new ConfigurationManager();
