import type { IConfiguration } from '../../core/configuration/script/interface';

export class ConfigurationLib {
    static async init(projectPath: string): Promise<void> {
        const { configurationManager } = await import('../../core/configuration');
        return await configurationManager.initialize(projectPath);
    }

    static async migrateFromProject(): Promise<IConfiguration> {
        const project = await import('../../core/project/index');
        const { configurationManager } = await import('../../core/configuration/index');
        return await configurationManager.migrateFromProject(project.default.path);
    }

    static async reload(): Promise<void> {
        const { configurationManager } = await import('../../core/configuration/index');
        return await configurationManager.reload();
    }
}
