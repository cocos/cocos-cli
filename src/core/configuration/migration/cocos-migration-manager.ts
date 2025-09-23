import { IMigrationTarget } from './types';
import { CocosMigration } from './cocos-migration';
import { newConsole } from '../../base/console';

/**
 * 深度合并配置对象
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
function mergeConfigs(target: any, source: any): any {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            // 递归合并对象
            result[key] = mergeConfigs(result[key] || {}, value);
        } else {
            // 直接赋值
            result[key] = value;
        }
    }

    return result;
}

/**
 * CocosCreator 配置迁移管理器
 */
export class CocosMigrationManager {
    private static migrationTargets: IMigrationTarget[] = [];

    /**
     * 注册迁移器
     * @param migrationTarget 迁移器实例
     */
    public static register(migrationTarget: IMigrationTarget): void {
        this.migrationTargets.push(migrationTarget);
        newConsole.debug(`[Migration] 已注册迁移插件: ${migrationTarget.pluginName}`);
    }


    /**
     * 批量注册迁移器
     * @param targets 迁移器数组
     */
    public static registerBatch(targets: IMigrationTarget[]): void {
        targets.forEach(target => this.register(target));
    }

    /**
     * 执行迁移
     * @param projectPath 项目路径
     * @returns 迁移后的新配置
     */
    public static async migrate(projectPath: string): Promise<Record<string, any>> {
        if (this.migrationTargets.length === 0) {
            newConsole.warn('[Migration] 没有注册任何迁移器');
            return {};
        }

        newConsole.log(`[Migration] 开始执行 ${this.migrationTargets.length} 个迁移器`);

        // 执行所有注册的迁移
        let result = {};
        for (const target of this.migrationTargets) {
            try {
                const migratedConfig = await CocosMigration.migrate(projectPath, target);
                result = mergeConfigs(result, migratedConfig);
                newConsole.debug(`[Migration] 迁移完成: ${target.pluginName}`);
            } catch (error) {
                newConsole.error(`[Migration] 迁移失败: ${target.pluginName} - ${error}`);
                throw error;
            }
        }

        newConsole.log('[Migration] 所有迁移执行完成');
        return result;
    }


    /**
     * 获取已注册的迁移器数量
     * @returns 迁移器数量
     */
    public static getRegisteredCount(): number {
        return this.migrationTargets.length;
    }




    /**
     * 清空所有迁移器
     */
    public static clear(): void {
        this.migrationTargets.length = 0;
        newConsole.debug('[Migration] 已清空所有迁移器');
    }
}
