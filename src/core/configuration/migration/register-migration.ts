
import { IMigrationTarget } from './types';

/**
 * 获取迁移器注册数据列表
 * @returns 迁移器配置数组
 */
export function getMigrationList(): IMigrationTarget[] {
    const platforms = ['web-desktop', 'web-mobile'];

    const migrationList: IMigrationTarget[] = [];

    // 平台插件的偏好默认值迁移
    platforms.forEach(platform => {
        migrationList.push({
            sourceScope: 'local',
            pluginName: platform,
            targetPath: `builder.platforms.${platform}.packages.${platform}`,
            migrate: async (oldConfig: Record<string, any>) => {
                return oldConfig.builder.common;
            }
        });
    });

    // Builder 本地配置迁移
    migrationList.push({
        sourceScope: 'local',
        pluginName: 'builder',
        targetPath: 'builder.common',
        migrate: async (oldConfig: Record<string, any>) => {
            delete oldConfig.common.platform;
            return oldConfig.common;
        }
    });

    // Builder 项目配置迁移
    migrationList.push({
        sourceScope: 'project',
        pluginName: 'builder',
        targetPath: 'builder',
        migrate: async (oldConfig: Record<string, any>) => {
            return {
                bundleConfig: oldConfig.bundleConfig,
                textureCompressConfig: oldConfig.textureCompressConfig,
                splashScreen: oldConfig['splash-setting'],
            };
        }
    });

    // Builder 项目配置迁移（第二个）
    migrationList.push({
        sourceScope: 'project',
        pluginName: 'builder',
        targetPath: 'builder',
        migrate: async (oldConfig: Record<string, any>) => {
            return {
                bundleConfig: oldConfig.bundleConfig,
                textureCompressConfig: oldConfig.textureCompressConfig,
            };
        }
    });

    // Engine 配置迁移
    migrationList.push({
        sourceScope: 'project',
        pluginName: 'engine',
        targetPath: 'engine',
        migrate: async (oldConfig: Record<string, any>) => {
            const configKeys = Object.keys(oldConfig.modules.configs);
            if (configKeys.length > 0) {
                configKeys.forEach(key => {
                    delete oldConfig.modules.configs[key].cache;
                });
            }
            return {
                macroConfig: oldConfig.macroConfig,
                configs: oldConfig.modules.configs,
                globalConfigKey: oldConfig.modules.globalConfigKey,
                graphics: oldConfig.modules.graphics,
            };
        }
    });

    // Project 配置迁移
    migrationList.push({
        sourceScope: 'project',
        pluginName: 'project',
        migrate: async (oldConfig: Record<string, any>) => {
            return {
                engine: {
                    designResolution: oldConfig.general.designResolution,
                    downloadMaxConcurrency: oldConfig.general.downloadMaxConcurrency,
                    physicsConfig: oldConfig.physics,
                    macroConfig: oldConfig.macroConfig,
                    sortingLayers: oldConfig['sorting-layer'],
                    customLayers: oldConfig.layer,
                    graphics: oldConfig.graphics,
                    highQuality: oldConfig.highQuality,
                    renderPipeline: oldConfig.general.renderPipeline,
                },
                script: oldConfig.script,
                import: {
                    fbx: oldConfig.fbx,
                }
            };
        }
    });

    return migrationList;
}
