import type { IConfiguration, ConfigurationScope } from '../../core/configuration/script/interface';
import { ICocosConfigurationNode } from '../../core/configuration/script/metadata';

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

// ==================== Metadata ====================

export { ICocosConfigurationNode, ICocosConfigurationPropertySchema } from '../../core/configuration/script/metadata';

export async function getMetadata(): Promise<ICocosConfigurationNode[]> {
    const { getCocosConfigNodes } = await import('../../core/configuration/script/metadata');
    return getCocosConfigNodes();
}

