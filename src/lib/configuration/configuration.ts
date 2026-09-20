import type { IConfiguration, ConfigurationScope } from '../../core/configuration/script/interface';
import type { ICocosConfigurationNode } from '../../core/configuration/script/metadata';

export { IConfiguration, ConfigurationScope } from '../../core/configuration/script/interface';
export { IBaseConfiguration } from '../../core/configuration/script/config';

export async function init(projectPath: string): Promise<void> {
    const { ensureProjectOwnership } = await import('../../core/project-backend/ownership');
    await ensureProjectOwnership(projectPath);
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.initialize(projectPath);
}

export async function migrateFromProject(): Promise<IConfiguration> {
    const project = await import('../../core/project/index');
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.migrateFromProject(project.default.path);
}

export async function reload(): Promise<void> {
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.reload();
}

export async function migrate(): Promise<void> {
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.migrate();
}

export async function get<T>(key: string, scope?: ConfigurationScope): Promise<T> {
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.get<T>(key, scope);
}

export async function set<T>(key: string, value: T, scope?: ConfigurationScope): Promise<boolean> {
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.set<T>(key, value, scope);
}

export async function remove(key: string, scope?: ConfigurationScope): Promise<boolean> {
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.remove(key, scope);
}

/**
 * 将配置写入磁盘
 * @param force 是否强制写入（跳过节流/脏检查）
 * @param scope 'project'(默认) -> settings/cocos.config.json；'local' -> profiles/cocos.config.json
 */
export async function save(force?: boolean, scope: ConfigurationScope = 'project'): Promise<void> {
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.save(force, scope);
}

/**
 * 获取指定作用域配置文件的绝对路径
 * @param scope 'project'(默认) -> settings/cocos.config.json；'local' -> profiles/cocos.config.json
 */
export async function getConfigPath(scope: ConfigurationScope = 'project'): Promise<string> {
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.getConfigPath(scope);
}

/**
 * 注册配置保存事件的监听器
 * @param callback 对应作用域配置文件被写入磁盘时触发
 * @param scope 'project'(默认) -> settings/cocos.config.json；'local' -> profiles/cocos.config.json
 * @returns 取消监听的函数
 */
export function onDidSave(callback: () => void, scope: ConfigurationScope = 'project'): () => void {
    // 同步引入：调用时 configurationManager 必定已初始化
    const { configurationManager } = require('../../core/configuration/index');
    const handler = (_config: unknown, savedScope: ConfigurationScope = 'project') => {
        if (savedScope === scope) {
            callback();
        }
    };
    configurationManager.on('configuration:save', handler);
    return () => configurationManager.off('configuration:save', handler);
}

// ==================== Metadata ====================

export { ICocosConfigurationNode, ICocosConfigurationPropertySchema } from '../../core/configuration/script/metadata';

export async function getMetadata(): Promise<ICocosConfigurationNode[]> {
    const { configurationRegistry } = await import('../../core/configuration');
    return configurationRegistry.getMetadata();
}
