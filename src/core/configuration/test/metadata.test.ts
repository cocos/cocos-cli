import { TestGlobalEnv } from '../../../tests/global-env';
import type { ICocosConfigurationNode, ICocosConfigurationPropertySchema } from '../script/metadata';

interface IMetadataRuntime {
    getMetadata: typeof import('../../../lib/configuration/configuration').getMetadata;
    i18n: typeof import('../../base/i18n').default;
    project: typeof import('../../project').default;
    Engine: typeof import('../../engine').Engine;
    builderConfig: typeof import('../../builder/share/builder-config').default;
    DefaultBundleConfig: typeof import('../../builder/share/bundle-utils').DefaultBundleConfig;
    pluginManager: typeof import('../../builder/manager/plugin').pluginManager;
    assetConfig: typeof import('../../assets/asset-config').default;
    scriptConfig: typeof import('../../scripting/shared/query-shared-settings').scriptConfig;
}

function findNode(nodes: ICocosConfigurationNode[], id: string): ICocosConfigurationNode {
    const node = nodes.find((item) => item.id === id);
    if (!node) {
        throw new Error(`Node not found: ${id}`);
    }
    return node;
}

function findProperty(
    node: ICocosConfigurationNode,
    key: string
): ICocosConfigurationPropertySchema {
    const property = node.properties[key];
    if (!property) {
        throw new Error(`Property not found: ${key}`);
    }
    return property;
}

function tryFindNode(nodes: ICocosConfigurationNode[], id: string): ICocosConfigurationNode | undefined {
    return nodes.find((item) => item.id === id);
}

async function loadFreshRuntime(): Promise<IMetadataRuntime> {
    jest.resetModules();
    try {
        const { getMetadata } = require('../../../lib/configuration/configuration') as typeof import('../../../lib/configuration/configuration');
        const i18n = (require('../../base/i18n') as typeof import('../../base/i18n')).default;
        const project = (require('../../project') as typeof import('../../project')).default;
        const { Engine } = require('../../engine') as typeof import('../../engine');
        const builderConfig = (require('../../builder/share/builder-config') as typeof import('../../builder/share/builder-config')).default;
        const { DefaultBundleConfig } = require('../../builder/share/bundle-utils') as typeof import('../../builder/share/bundle-utils');
        const { pluginManager } = require('../../builder/manager/plugin') as typeof import('../../builder/manager/plugin');
        const assetConfig = (require('../../assets/asset-config') as typeof import('../../assets/asset-config')).default;
        const { scriptConfig } = require('../../scripting/shared/query-shared-settings') as typeof import('../../scripting/shared/query-shared-settings');

        return {
            getMetadata,
            i18n,
            project,
            Engine,
            builderConfig,
            DefaultBundleConfig,
            pluginManager,
            assetConfig,
            scriptConfig,
        };
    } catch (error) {
        // Keep the thrown object visible in Jest output; otherwise some module-load failures render as blank.
        console.error('loadFreshRuntime failed:', error);
        throw error;
    }
}

describe('configuration metadata', () => {
    it('should return no metadata before any module has registered metadata', async () => {
        const { getMetadata } = await loadFreshRuntime();

        await expect(getMetadata()).resolves.toEqual([]);
    });

    it('should expose engine module metadata using config profile defaults', async () => {
        const runtime = await loadFreshRuntime();
        await runtime.project.open(TestGlobalEnv.projectRoot);
        await runtime.Engine.init(TestGlobalEnv.engineRoot);

        const nodes = await runtime.getMetadata();
        const engineModuleNode = findNode(nodes, 'engine.moduleConfig');
        const engineMacroNode = findNode(nodes, 'engine.macroConfig');
        const globalConfigKeyProperty = findProperty(engineModuleNode, 'engine.globalConfigKey');
        const configsProperty = findProperty(engineModuleNode, 'engine.configs');
        const macroProperty = findProperty(engineMacroNode, 'engine.macroConfig.ENABLE_TILEDMAP_CULLING');
        const configItemSchema = configsProperty.additionalProperties as ICocosConfigurationPropertySchema | undefined;

        expect(engineModuleNode.properties['engine.includeModules']).toBeUndefined();
        expect(engineModuleNode.properties['engine.flags.LOAD_PHYSX_MANUALLY']).toBeUndefined();
        expect(engineModuleNode.properties['engine.noDeprecatedFeatures']).toBeUndefined();
        expect(globalConfigKeyProperty.type).toBe('string');
        expect(globalConfigKeyProperty.default).toBe('defaultConfig');
        expect(globalConfigKeyProperty).not.toHaveProperty('scope');
        expect(configsProperty.type).toBe('object');
        expect(configsProperty.default).toEqual({
            defaultConfig: {
                name: '默认配置',
                includeModules: runtime.Engine.getConfig(true).includeModules,
                flags: runtime.Engine.getConfig(true).flags,
                noDeprecatedFeatures: {
                    value: false,
                    version: '',
                },
            },
        });
        expect(configsProperty).not.toHaveProperty('scope');
        expect(configItemSchema?.properties?.name?.type).toBe('string');
        expect(configItemSchema?.properties?.includeModules?.type).toBe('array');
        expect(configItemSchema?.properties?.flags?.type).toBe('object');
        expect(configItemSchema?.properties?.noDeprecatedFeatures?.type).toBe('object');
        expect(macroProperty.type).toBe('boolean');
        expect(macroProperty).not.toHaveProperty('scope');
        expect(engineMacroNode.properties['engine.macroConfig']).toBeUndefined();
    });

    it('should describe engine.macroCustom using the customMacroList item structure', async () => {
        const runtime = await loadFreshRuntime();
        await runtime.project.open(TestGlobalEnv.projectRoot);
        await runtime.Engine.init(TestGlobalEnv.engineRoot);

        const nodes = await runtime.getMetadata();
        const engineMacroNode = findNode(nodes, 'engine.macroConfig');
        const macroCustomProperty = findProperty(engineMacroNode, 'engine.macroCustom');
        const macroCustomItemSchema = Array.isArray(macroCustomProperty.items)
            ? macroCustomProperty.items[0]
            : macroCustomProperty.items;

        expect(macroCustomProperty.type).toBe('array');
        expect(macroCustomProperty.default).toEqual(runtime.Engine.getConfig(true).macroCustom);
        expect(macroCustomItemSchema?.type).toBe('object');
        expect(macroCustomItemSchema?.properties?.key?.type).toBe('string');
        expect(macroCustomItemSchema?.properties?.value?.type).toBe('boolean');
    });

    it('should only expose builder platform metadata after the corresponding platform plugin has registered', async () => {
        const runtime = await loadFreshRuntime();
        await runtime.project.open(TestGlobalEnv.projectRoot);
        await runtime.builderConfig.init();
        await runtime.pluginManager.init();

        const beforePlatformRegister = await runtime.getMetadata();
        const textureCompressNode = findNode(beforePlatformRegister, 'builder.textureCompressConfig');
        const bundleConfigNode = findNode(beforePlatformRegister, 'builder.bundleConfig');
        const textureCompressProperty = findProperty(textureCompressNode, 'builder.textureCompressConfig');
        const bundleConfigProperty = findProperty(bundleConfigNode, 'builder.bundleConfig.custom');

        expect(findNode(beforePlatformRegister, 'builder.common')).toBeDefined();
        expect(findNode(beforePlatformRegister, 'builder.useCacheConfig')).toBeDefined();
        expect(textureCompressProperty.type).toBe('object');
        expect(textureCompressProperty.default).toEqual(runtime.builderConfig.getDefaultConfig().textureCompressConfig);
        expect(textureCompressProperty.properties).toBeUndefined();
        expect(bundleConfigNode.properties['builder.bundleConfig']).toBeUndefined();
        expect(bundleConfigProperty.type).toBe('object');
        expect(bundleConfigProperty.default).toEqual({
            default: runtime.DefaultBundleConfig,
            ...runtime.builderConfig.getDefaultConfig().bundleConfig.custom,
        });
        expect(bundleConfigProperty.properties).toBeUndefined();
        expect(tryFindNode(beforePlatformRegister, 'builder.platforms.web-mobile')).toBeUndefined();

        await runtime.pluginManager.register('web-mobile');

        const afterPlatformRegister = await runtime.getMetadata();
        expect(findNode(afterPlatformRegister, 'builder.platforms.web-mobile')).toBeDefined();
    });

    it('should expose import and script metadata only after those modules register themselves', async () => {
        const runtime = await loadFreshRuntime();
        await runtime.project.open(TestGlobalEnv.projectRoot);
        await runtime.Engine.init(TestGlobalEnv.engineRoot);

        const beforeRegister = await runtime.getMetadata();
        expect(tryFindNode(beforeRegister, 'import')).toBeUndefined();
        expect(tryFindNode(beforeRegister, 'script')).toBeUndefined();

        await runtime.assetConfig.init();
        await runtime.scriptConfig.init();

        const afterRegister = await runtime.getMetadata();
        const importNode = findNode(afterRegister, 'import');
        const scriptNode = findNode(afterRegister, 'script');

        expect(findProperty(importNode, 'import.restoreAssetDBFromCache').type).toBe('boolean');
        expect(findProperty(importNode, 'import.fbx.material.smart').type).toBe('boolean');
        expect(importNode.properties['import.fbx']).toBeUndefined();
        expect(findProperty(scriptNode, 'script.useDefineForClassFields').type).toBe('boolean');
    });

    it('should keep import defaults aligned with metadata defaults', async () => {
        const runtime = await loadFreshRuntime();
        await runtime.project.open(TestGlobalEnv.projectRoot);
        await runtime.Engine.init(TestGlobalEnv.engineRoot);
        await runtime.assetConfig.init();

        const nodes = await runtime.getMetadata();
        const importNode = findNode(nodes, 'import');

        await expect(runtime.assetConfig.getProject<string[]>('globList', 'default')).resolves.toEqual([]);
        await expect(runtime.assetConfig.getProject<string>('createTemplateRoot', 'default')).resolves.toEqual('.creator/templates');
        await expect(runtime.assetConfig.getProject<boolean>('fbx.material.smart', 'default')).resolves.toEqual(false);
        expect(findProperty(importNode, 'import.createTemplateRoot').default).toBe('.creator/templates');
        expect(findProperty(importNode, 'import.fbx.material.smart').default).toBe(false);
    });

    it('should preserve readable localized titles and descriptions in registered metadata', async () => {
        const runtime = await loadFreshRuntime();
        runtime.i18n.setLanguage('zh');
        await runtime.project.open(TestGlobalEnv.projectRoot);
        await runtime.Engine.init(TestGlobalEnv.engineRoot);
        await runtime.builderConfig.init();
        await runtime.pluginManager.init();
        await runtime.assetConfig.init();
        await runtime.scriptConfig.init();

        const nodes = await runtime.getMetadata();
        const enginePhysicsNode = findNode(nodes, 'engine.physicsConfig');
        const builderCommonNode = findNode(nodes, 'builder.common');
        const builderCacheNode = findNode(nodes, 'builder.useCacheConfig');
        const importNode = findNode(nodes, 'import');
        const scriptNode = findNode(nodes, 'script');

        expect(enginePhysicsNode.title).toBe('物理配置');
        expect(findProperty(enginePhysicsNode, 'engine.physicsConfig.gravity').title).toBe('重力');
        expect(findProperty(enginePhysicsNode, 'engine.physicsConfig.gravity').description).toBe('物理世界重力向量');
        expect(builderCommonNode.title).toBe('构建通用配置');
        expect(builderCacheNode.title).toBe('缓存配置');
        expect(findProperty(builderCacheNode, 'builder.useCacheConfig.textureCompress').title).toBe('纹理压缩缓存');
        expect(importNode.title).toBe('资源导入');
        expect(findProperty(importNode, 'import.globList').title).toBe('Glob 列表');
        expect(findProperty(importNode, 'import.globList').description).toBe('资源导入 glob 匹配规则');
        expect(scriptNode.title).toBe('脚本');
        expect(findProperty(scriptNode, 'script.useDefineForClassFields').title).toBe('使用 defineProperty 定义类字段');
    });

    it('should localize metadata titles after switching the global language', async () => {
        const runtime = await loadFreshRuntime();
        runtime.i18n.setLanguage('zh');
        await runtime.project.open(TestGlobalEnv.projectRoot);
        await runtime.Engine.init(TestGlobalEnv.engineRoot);
        await runtime.builderConfig.init();
        await runtime.pluginManager.init();
        await runtime.assetConfig.init();
        await runtime.scriptConfig.init();

        const zhNodes = await runtime.getMetadata();
        runtime.i18n.setLanguage('en');
        const enNodes = await runtime.getMetadata();

        expect(findNode(zhNodes, 'script').title).toBe('脚本');
        expect(findNode(enNodes, 'script').title).toBe('Script');
        expect(findProperty(findNode(zhNodes, 'builder.common'), 'builder.common.platform').title).toBe('平台');
        expect(findProperty(findNode(enNodes, 'builder.common'), 'builder.common.platform').title).toBe('Platform');
        expect(findProperty(findNode(zhNodes, 'import'), 'import.globList').description).toBe('资源导入 glob 匹配规则');
        expect(findProperty(findNode(enNodes, 'import'), 'import.globList').description).toBe('Asset import glob matching rules');
    });

    it('should localize dynamic engine feature metadata only after Engine.init registers engine i18n', async () => {
        const runtime = await loadFreshRuntime();
        runtime.i18n.setLanguage('en');
        const { getEngineDynamicConfigContribution } = jest.requireActual('../../engine/dynamic-metadata') as typeof import('../../engine/dynamic-metadata');
        const getIncludeModuleDescriptions = () => (
            ((getEngineDynamicConfigContribution({
                engineRoot: TestGlobalEnv.engineRoot,
                fallbackConfig: {
                    includeModules: ['2d'],
                    flags: { LOAD_SPINE_MANUALLY: false },
                    macroConfig: { ENABLE_TILEDMAP_CULLING: true },
                },
            }).metadata.includeModules.items as any)?.enumDescriptions ?? []) as string[]
        );

        expect(getIncludeModuleDescriptions()).not.toContain('Core - Cocos Creator core functionalities.');

        await runtime.project.open(TestGlobalEnv.projectRoot);
        await runtime.Engine.init(TestGlobalEnv.engineRoot);

        expect(getIncludeModuleDescriptions()).toContain('Core - Cocos Creator core functionalities.');
    });
});
