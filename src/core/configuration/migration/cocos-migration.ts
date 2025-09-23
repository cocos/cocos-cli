import { IMigrationTarget, RedirectRule, DetailedRedirect } from './types';
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
            const oldPluginConfig = await CocosMigration.loader.loadConfig(target.scope, target.pluginName);
            if (!oldPluginConfig) return {};

            let migratedConfig: any;

            // 如果提供了自定义 migrate 函数，使用它
            if (target.migrate) {
                migratedConfig = await target.migrate(oldPluginConfig);
            } else {
                // 否则使用自动重定向
                migratedConfig = CocosMigration.autoRedirect(oldPluginConfig, target.redirects || {});
            }

            // 执行后处理
            if (target.postProcess) {
                migratedConfig = await target.postProcess(migratedConfig);
            }

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
     * 自动重定向配置字段
     * @param oldConfig 旧配置
     * @param redirects 重定向规则
     * @returns 重定向后的配置
     */
    private static autoRedirect(oldConfig: Record<string, any>, redirects: Record<string, RedirectRule>): Record<string, any> {
        const newConfig: Record<string, any> = { ...oldConfig };

        for (const [oldKey, rule] of Object.entries(redirects)) {
            const oldValue = CocosMigration.getNestedValue(oldConfig, oldKey);
            
            if (typeof rule === 'string') {
                // 简单重定向：直接重命名字段
                CocosMigration.setNestedValue(newConfig, rule, oldValue);
                if (oldKey !== rule) {
                    CocosMigration.deleteNestedValue(newConfig, oldKey);
                }
            } else {
                // 详细重定向：支持值转换和默认值
                const detailedRule = rule as DetailedRedirect;
                let newValue = oldValue;

                // 如果原值为 undefined 且有默认值，使用默认值
                if (oldValue === undefined && detailedRule.defaultValue !== undefined) {
                    newValue = detailedRule.defaultValue;
                }

                // 应用值转换函数
                if (newValue !== undefined && detailedRule.transform) {
                    try {
                        newValue = detailedRule.transform(newValue);
                    } catch (error) {
                        newConsole.warn(`[Migration] 值转换失败: ${oldKey} - ${error}`);
                    }
                }

                // 设置新值
                CocosMigration.setNestedValue(newConfig, detailedRule.newKey, newValue);

                // 如果指定了移除原字段，则删除
                if (detailedRule.remove || (oldKey !== detailedRule.newKey)) {
                    CocosMigration.deleteNestedValue(newConfig, oldKey);
                }
            }
        }

        return newConfig;
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

    /**
     * 获取嵌套对象的值
     * @param obj 对象
     * @param path 路径（支持点号分隔）
     * @returns 值
     */
    private static getNestedValue(obj: any, path: string): any {
        const keys = path.split('.');
        let current = obj;

        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return undefined;
            }
        }

        return current;
    }

    /**
     * 设置嵌套对象的值
     * @param obj 对象
     * @param path 路径（支持点号分隔）
     * @param value 值
     */
    private static setNestedValue(obj: any, path: string, value: any): void {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
    }

    /**
     * 删除嵌套对象的值
     * @param obj 对象
     * @param path 路径（支持点号分隔）
     */
    private static deleteNestedValue(obj: any, path: string): void {
        const keys = path.split('.');
        let current = obj;
        const pathStack: Array<{ obj: any; key: string }> = [];

        // 构建路径栈
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
                return; // 路径不存在
            }
            pathStack.push({ obj: current, key });
            current = current[key];
        }

        // 删除目标键
        delete current[keys[keys.length - 1]];

        // 从后往前清理空对象
        for (let i = pathStack.length - 1; i >= 0; i--) {
            const { obj: parentObj, key } = pathStack[i];
            if (Object.keys(parentObj[key]).length === 0) {
                delete parentObj[key];
            } else {
                break; // 如果父对象不为空，停止清理
            }
        }
    }
}
