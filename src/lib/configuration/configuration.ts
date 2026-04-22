import type { IConfiguration, ConfigurationScope } from '../../core/configuration/script/interface';
import type { ICocosConfigurationNode } from '../../core/configuration/script/metadata';

export { IConfiguration, ConfigurationScope } from '../../core/configuration/script/interface';
export { IBaseConfiguration } from '../../core/configuration/script/config';

export async function init(projectPath: string): Promise<void> {
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

export async function save(force?: boolean): Promise<void> {
    const { configurationManager } = await import('../../core/configuration/index');
    return await configurationManager.save(force);
}

/**
 * 注册 configurationManager 保存事件的监听器
 * 每次 cocos.config.json 被写入磁盘时触发
 * @returns 取消监听的函数
 */
export function onDidSave(callback: () => void): () => void {
    // 同步引入：调用时 configurationManager 必定已初始化
    const { configurationManager } = require('../../core/configuration/index');
    const handler = () => callback();
    configurationManager.on('configuration:save', handler);
    return () => configurationManager.off('configuration:save', handler);
}

// ==================== Metadata ====================

export { ICocosConfigurationNode, ICocosConfigurationPropertySchema } from '../../core/configuration/script/metadata';

export async function getMetadata(): Promise<ICocosConfigurationNode[]> {
    const { configurationRegistry } = await import('../../core/configuration');
    return configurationRegistry.getMetadata();
}
