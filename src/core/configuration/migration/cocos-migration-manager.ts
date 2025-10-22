import { CocosCLIConfigScope, IMigrationTarget } from './types';
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

    if (!source || typeof source !== 'object') {
        return result;
    }

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
 * CocosCreator 3.x 配置迁移管理器
 */
export class CocosMigrationManager {
    private static _targets: Map<CocosCLIConfigScope, IMigrationTarget[]> = new Map();
    private static _initialized: boolean = false;

    /**
     * 迁移器列表
     */
    public static get migrationTargets(): Map<CocosCLIConfigScope, IMigrationTarget[]> {
        return this._targets;
    }

    /**
     * 注册所有迁移器
     */
    private static async registerMigration(): Promise<void> {
        if (this._initialized) {
            return;
        }

        const { getMigrationList } = await import('./register-migration');
        const migrationList = getMigrationList();

        // 清空现有迁移器
        this.clear();

        // 注册所有迁移器
        this.register(migrationList);

        this._initialized = true;
        newConsole.log(`[Migration] 已注册 ${migrationList.length} 个迁移器`);
    }

    /**
     * 注册迁移器
     * @param migrationTarget 迁移器实例
     */
    public static register(migrationTarget: IMigrationTarget | IMigrationTarget[]): void {
        migrationTarget = !Array.isArray(migrationTarget) ? [migrationTarget] : migrationTarget;
        for (const target of migrationTarget) {
            const scope = target.targetScope || 'project';
            const items = this._targets.get(scope) || [];
            items.push(target);
            this._targets.set(scope, items);
            newConsole.debug(`[Migration] 已注册迁移插件: ${target.pluginName}`);
        }
    }

    /**
     * 执行迁移
     * @param projectPath 项目路径
     * @returns 迁移后的新配置
     */
    public static async migrate(projectPath: string): Promise<Record<CocosCLIConfigScope, Record<string, any>>> {
        await this.registerMigration();
        if (this._targets.size === 0) {
            throw new Error('[Migration] 没有注册任何迁移器');
        }
        const result: Record<CocosCLIConfigScope, Record<string, any>> = CocosMigrationManager.createConfigList();

        newConsole.log(`[Migration] 开始执行迁移`);
        let success = true;
        // 执行所有注册的迁移
        for (const items of this._targets.values()) {
            for (const target of items) {
                try {
                    const targetScope = target.targetScope || 'project';
                    const migratedConfig = await CocosMigration.migrate(projectPath, target);
                    result[targetScope] = mergeConfigs(result[targetScope], migratedConfig);
                    newConsole.debug(`[Migration] 迁移完成: ${target.pluginName}`);
                } catch (error) {
                    success = false;
                    console.error(error);
                    newConsole.error(`[Migration] 迁移失败: ${target.pluginName}`);
                }
            }
        }
        if (!success) {
            throw new Error('[Migration] 迁移失败, 详情请查看日志');
        }

        newConsole.log('[Migration] 所有迁移执行成功');
        return result;
    }

    /**
     * 清空所有迁移器
     */
    public static clear(): void {
        this._targets.clear();
        newConsole.debug('[Migration] 已清空所有迁移器');
    }

    /**
     * 生成新的配置
     * @private
     */
    private static createConfigList(): Record<CocosCLIConfigScope, Record<string, any>> {
        return {
            project: {},
        };
    }
}
