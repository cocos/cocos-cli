import type { IConfiguration } from '../../core/configuration/script/interface';

export { IConfiguration } from '../../core/configuration/script/interface';

export async function init(projectPath: string): Promise<void> {
    const { configurationManager } = await import('../../core/configuration');
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

