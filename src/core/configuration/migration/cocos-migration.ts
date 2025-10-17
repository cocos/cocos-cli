import { IMigrationTarget } from './types';
import { CocosConfigLoader } from './cocos-config-loader';
import { newConsole } from '../../base/console';

/**
 * CocosCreator 配置迁移器实现
 */
export class CocosMigration {
    private static loader: CocosConfigLoader = new CocosConfigLoader();

    /**
     * 执行迁移
     * @param projectPath 项目路径
     * @param target 迁移目标配置
     * @returns 迁移后的新配置
     */
    public static async migrate(projectPath: string, target: IMigrationTarget): Promise<any> {
        try {
            CocosMigration.loader.initialize(projectPath);
            const oldPluginConfig = await CocosMigration.loader.loadConfig(target.sourceScope, target.pluginName);
            if (!oldPluginConfig) return {};

            let migratedConfig: any = await target.migrate(oldPluginConfig);

            // 应用目标路径
            if (target.targetPath) {
                migratedConfig = CocosMigration.applyTargetPath(migratedConfig, target.targetPath);
            }

            return migratedConfig;
        } catch (error) {
            newConsole.warn(`[Migration] 迁移目标失败: ${target.pluginName} - ${error}`);
            return {};
        }
    }

    /**
     * 应用目标路径
     * @param config 配置对象
     * @param targetPath 目标路径
     * @returns 应用路径后的配置
     */
    private static applyTargetPath(config: any, targetPath: string): any {
        if (!targetPath) return config;

        const pathParts = targetPath.split('.');
        let result = config;

        // 从后往前构建嵌套对象
        for (let i = pathParts.length - 1; i >= 0; i--) {
            result = { [pathParts[i]]: result };
        }

        return result;
    }
}
