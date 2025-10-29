
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
            targetPath: `builder.platforms.${platform}`,
            migrate: async (oldConfig: Record<string, any>) => {
                if (!oldConfig.builder) {
                    return;
                }
                delete oldConfig.builder.options[platform].__version__;
                return {
                    ...oldConfig.builder.common,
                    packages: {
                        [platform]: oldConfig.builder.options[platform],
                    },
                };
            }
        });
    });

    // Builder 本地配置迁移
    migrationList.push({
        sourceScope: 'local',
        pluginName: 'builder',
        targetPath: 'builder.common',
        migrate: async (oldConfig: Record<string, any>) => {
            if (!oldConfig?.common) {
                return;
            }
            delete oldConfig.common.platform;
            delete oldConfig.common.outputName;
            return oldConfig.common;
        }
    });

    // Builder 项目配置迁移
    migrationList.push({
        sourceScope: 'project',
        pluginName: 'builder',
        targetPath: 'builder',
        migrate: async (oldConfig: Record<string, any>) => {
            const res: any = {};

            if (oldConfig.bundleConfig) {
                res.bundleConfig = oldConfig.bundleConfig;
            }
            if (oldConfig.textureCompressConfig) {
                res.textureCompressConfig = oldConfig.textureCompressConfig;
            }
            if (oldConfig['splash-setting']) {
                res.splashScreen = oldConfig['splash-setting'];
            }
            return res;
        }
    });

    // Builder 项目配置迁移（第二个）
    migrationList.push({
        sourceScope: 'project',
        pluginName: 'builder',
        targetPath: 'builder',
        migrate: async (oldConfig: Record<string, any>) => {
            const res: any = {};
            if (oldConfig.bundleConfig) {
                res.bundleConfig = oldConfig.bundleConfig;
            }
            if (oldConfig.textureCompressConfig) {
                res.textureCompressConfig = oldConfig.textureCompressConfig;
            }
            return res;
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
            const res: any = {};
            if (oldConfig.macroConfig) {
                res.macroConfig = oldConfig.macroConfig;
            }
            if (oldConfig.modules.configs) {
                res.configs = oldConfig.modules.configs;
            }
            if (oldConfig.modules.globalConfigKey) {
                res.globalConfigKey = oldConfig.modules.globalConfigKey;
            }
            if (oldConfig.modules.graphics) {
                return res;
            }
        }
    });

    // Project 配置迁移
    migrationList.push({
        sourceScope: 'project',
        pluginName: 'project',
        migrate: async (oldConfig: Record<string, any>) => {
            const res: any = {};
            if (oldConfig.general) {
                res.engine = {
                    designResolution: oldConfig.general.designResolution,
                    downloadMaxConcurrency: oldConfig.general.downloadMaxConcurrency,
                };
            }
            if (oldConfig.physics) {
                res.engine.physicsConfig = oldConfig.physics;
            }
            if (oldConfig.macroConfig) {
                res.engine.macroConfig = oldConfig.macroConfig;
            }
            if (oldConfig['sorting-layer']) {
                res.engine.sortingLayers = oldConfig['sorting-layer'];
            }
            if (oldConfig.layer) {
                res.engine.customLayers = oldConfig.layer;
            }
            if (oldConfig.graphics) {
                res.engine.graphics = oldConfig.graphics;
            }
            if (oldConfig.highQuality) {
                res.engine.highQuality = oldConfig.highQuality;
            }
            if (oldConfig.general?.renderPipeline) {
                res.engine.renderPipeline = oldConfig.general.renderPipeline;
            }
            if (oldConfig.script) {
                res.script = oldConfig.script;
            }
            if (oldConfig.import) {
                res.import = {
                    fbx: oldConfig.import.fbx,
                };
            }
            return res;
        }
    });

    return migrationList;
}
