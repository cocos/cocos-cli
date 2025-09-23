import { gt } from 'semver';
import path from 'path';
import fse from 'fs-extra';
import { newConsole } from '../../base/console';
import * as utils from './utils';
import { IConfigurationManager, ConfigurationScope, IConfiguration } from '../@types/public';
import { CocosMigrationManager } from '../migration';
import { configurationRegistry } from './registry';

export class ConfigurationManager implements IConfigurationManager {

    static VERSION: string = '1.0.0';
    static RootDir = '.cocos';
    static name = 'settings.json';
    private projectConfig: IConfiguration = {
        version: '0.0.0',
    };
    private initialized: boolean = false;
    private configPath: string = '';

    /**
     * 初始化配置管理器
     */
    public async initialize(projectPath: string): Promise<void> {
        if (this.initialized) {
            return;
        }

        this.configPath = path.join(projectPath, ConfigurationManager.RootDir, ConfigurationManager.name);
        await this.load();
        await this.migrate(projectPath);
        this.initialized = true;
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
            this.projectConfig = Object.assign({}, this.projectConfig, configs);
            this.projectConfig.version = ConfigurationManager.VERSION;
            await this.save();
        }
    }

    /**
     * 获取配置值
     * 读取规则：优先读项目配置，如果没有再读默认配置，默认配置也没定义的话，就打印警告日志
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param scope 配置作用域，不指定时按优先级查找
     */
    public async getValue<T>(key: string, scope?: ConfigurationScope): Promise<T | undefined> {
        if (!utils.isValidConfigKey(key)) {
            newConsole.warn('[Configuration] 获取配置失败：配置键名不能为空');
            return undefined;
        }

        await this.ensureInitialized();

        // 获取项目配置值
        const projectValue = utils.getByDotPath(this.projectConfig, key);
        const hasProjectValue = projectValue !== undefined;

        // 根据作用域决定返回策略
        if (scope === 'project') {
            return hasProjectValue ? (projectValue as T) : undefined;
        }

        if (scope === 'default') {
            const result = this.getDefaultConfigValue(key);
            return result.found ? (result.value as T) : undefined;
        }

        // 按优先级查找：先项目配置，后默认配置
        if (hasProjectValue) {
            return projectValue as T;
        }

        const result = this.getDefaultConfigValue(key);
        if (!result.found) {
            newConsole.warn(`[Configuration] 配置项 "${key}" 未找到，请检查配置是否正确注册`);
            return undefined;
        }

        return result.value as T;
    }

    /**
     * 从默认配置中获取值
     * @param key 配置键名
     * @returns 包含值和是否找到的标志
     */
    private getDefaultConfigValue(key: string): { value: any; found: boolean } {
        const topLevelKey = key.split('.')[0];
        const defaultConfig = configurationRegistry.get(topLevelKey);
        
        if (!defaultConfig) {
            return { value: undefined, found: false };
        }

        // 如果键名就是顶级键名，直接返回配置对象
        if (key === topLevelKey) {
            return { value: defaultConfig, found: true };
        }

        // 否则使用点号路径查找嵌套值
        // 需要从 key 中移除顶级键名，只保留嵌套路径
        const nestedPath = key.substring(topLevelKey.length + 1);
        const value = utils.getByDotPath(defaultConfig, nestedPath);
        return { value, found: value !== undefined };
    }

    /**
     * 更新配置值
     * @param key 配置键名，支持点号分隔的嵌套路径
     * @param value 新的配置值
     * @param scope 配置作用域，默认为 'project'
     */
    public async updateValue<T>(key: string, value: T, scope: ConfigurationScope = 'project'): Promise<boolean> {
        if (!utils.isValidConfigKey(key)) {
            newConsole.warn('[Configuration] 更新配置失败：配置键名不能为空');
            return false;
        }

        await this.ensureInitialized();

        try {
            if (scope === 'project') {
                utils.setByDotPath(this.projectConfig, key, value);
                await this.save();
                newConsole.debug(`[Configuration] 已更新项目配置: ${key} = ${JSON.stringify(value)}`);
            } else if (scope === 'default') {
                return this.updateDefaultConfigValue(key, value);
            } else {
                newConsole.warn(`[Configuration] 不支持的配置作用域: ${scope}`);
                return false;
            }
            
            return true;
        } catch (error) {
            newConsole.error(`[Configuration] 更新配置失败: ${key} - ${error}`);
            return false;
        }
    }


    /**
     * 更新默认配置值
     * @param key 配置键名
     * @param value 新的配置值
     * @returns 是否更新成功
     */
    private updateDefaultConfigValue<T>(key: string, value: T): boolean {
        const configKey = key.split('.')[0]; // 获取顶级配置键
        const existingConfig = configurationRegistry.get(configKey);
        
        if (!existingConfig) {
            newConsole.warn(`[Configuration] 默认配置 "${configKey}" 未找到，无法更新`);
            return false;
        }

        const updatedConfig = { ...existingConfig };
        utils.setByDotPath(updatedConfig, key, value);
        configurationRegistry.register(configKey, updatedConfig, { overwrite: true });
        newConsole.debug(`[Configuration] 已更新默认配置: ${key} = ${JSON.stringify(value)}`);
        return true;
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
