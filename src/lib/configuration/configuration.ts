import { IConfiguration } from '../../core/configuration/script/interface';

export class ConfigurationLib {
    static async migrateFromProject(): Promise<IConfiguration> {
        const project = await import('../../core/project/index');
        const { configurationManager } = await import('../../core/configuration/index');
        return await configurationManager.migrateFromProject(project.default.path);
    }

    static async reload(): Promise<void> {
        const { configurationManager } = await import('../../core/configuration/index');
        await configurationManager.reload();
    }
}
