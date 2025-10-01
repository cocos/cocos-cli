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
     * @param moduleName 模块名
     * @param key 配置键名，支持点号分隔的嵌套路径，如 'builder.platforms.web-mobile'
     * @param scope 配置作用域，不指定时按优先级查找
     */
    get<T>(moduleName: string, key: string, scope?: ConfigurationScope): Promise<T>;

    /**
     * 设置配置
     * @param moduleName 模块名
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param value 新的配置值
     * @param scope 配置作用域，默认为 'project'
     */
    set<T>(moduleName: string, key: string, value: T, scope?: ConfigurationScope): Promise<boolean>;

    /**
     * 移除配置
     * @param moduleName 模块名
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，默认为 'project'
     */
    remove(moduleName: string, key: string, scope?: ConfigurationScope): Promise<boolean>;
}

export class ConfigurationManager implements IConfigurationManager {

    static VERSION: string = '1.0.0';
    static name = 'cocos.config.json';

    private initialized: boolean = false;
    private configPath: string = '';
    private projectConfig: IConfiguration = {
        version: '0.0.0',
    };

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

        this.configPath = path.join(projectPath, ConfigurationManager.name);
        await this.load();
        await this.migrate(projectPath);
        this.initialized = true;
    }

    private onRegistryConfiguration(instance: IBaseConfiguration): void {
        if (!this.configurationMap.has(instance.moduleName)) {
            const bind = async (configInstance: IBaseConfiguration) => {
                this.projectConfig[configInstance.moduleName] = configInstance.getAll();
                await this.save();
            }
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
     * 3.x 升级 4.x
     * @param projectPath
     * @private
     */
    private async migrate(projectPath: string): Promise<void> {
        const currentVersion = this.projectConfig.version || '0.0.0';
        const upgrade = gt(ConfigurationManager.VERSION, currentVersion);
        if (upgrade) {
            const configs = await CocosMigrationManager.migrate(projectPath);
            this.projectConfig = utils.deepMerge(this.projectConfig, configs);
            this.projectConfig.version = ConfigurationManager.VERSION;
            await this.save();
        }
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
     * @param moduleName 模块名
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，不指定时按优先级查找
     */
    public async get<T>(moduleName: string, key: string, scope?: ConfigurationScope): Promise<T> {
        if (!utils.isValidConfigKey(key)) {
            throw new Error('[Configuration] 获取配置失败：配置键名不能为空');
        }
        await this.ensureInitialized();
        return await this.getInstance(moduleName).get(key, scope) as T;
    }

    /**
     * 更新配置值
     * @param moduleName
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param value 新的配置值
     * @param scope 配置作用域，默认为 'project'
     */
    public async set<T>(moduleName: string, key: string, value: T, scope: ConfigurationScope = 'project'): Promise<boolean> {
        if (!utils.isValidConfigKey(key)) {
            newConsole.warn('[Configuration] 更新配置失败：配置键名不能为空');
            return false;
        }
        await this.ensureInitialized();
        await this.getInstance(moduleName).set(key, value, scope);
        return true;
    }

    /**
     * 移除配置值
     * @param moduleName
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，默认为 'project'
     */
    public async remove(moduleName: string, key: string, scope: ConfigurationScope = 'project'): Promise<boolean> {
        if (!utils.isValidConfigKey(key)) {
            newConsole.warn('[Configuration] 移除配置失败：配置键名不能为空');
            return false;
        }
        await this.ensureInitialized();
        return await this.getInstance(moduleName).remove(key, scope);
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
        try {
            // 确保目录存在
            await fse.ensureDir(path.dirname(this.configPath));

            // 保存配置文件
            await fse.writeJSON(this.configPath, this.projectConfig, { spaces: 4 });
            newConsole.debug(`[Configuration] 已保存项目配置: ${this.configPath}`);
        } catch (error) {
            newConsole.error(`[Configuration] 保存项目配置失败: ${this.configPath} - ${error}`);
            throw error;
        }
    }
}

export const configurationManager = new ConfigurationManager();
