import lodash from 'lodash';
import type { IBuildCacheUseConfig } from '../@types';
import type { BuildConfiguration } from '../@types/config-export';
import type { ICocosConfigurationNode, ICocosConfigurationPropertySchema } from '../../configuration/script/metadata';
import { DefaultBundleConfig } from './bundle-utils';
import {
    convertConfigItem,
    createNode,
    hasConfigItemShape,
    objectSchema,
    translateMetadataText,
} from '../../configuration/script/metadata';

interface IBuilderMetadataSource {
    commonOptionConfigs: Record<string, ICocosConfigurationPropertySchema>;
    useCacheDefaults: IBuildCacheUseConfig;
    bundleConfigDefault?: BuildConfiguration['bundleConfig'];
    textureCompressConfigDefault?: BuildConfiguration['textureCompressConfig'];
    commonOptionConfig: Record<string, Record<string, ICocosConfigurationPropertySchema>>;
    configMap: Record<string, Record<string, {
        displayName?: string;
        options?: Record<string, ICocosConfigurationPropertySchema>;
    }>>;
    platformTitles: Record<string, string>;
}

const DEFAULT_BUNDLE_CONFIG: BuildConfiguration['bundleConfig'] = {
    custom: {},
};

const DEFAULT_TEXTURE_COMPRESS_CONFIG: BuildConfiguration['textureCompressConfig'] = {
    userPreset: {},
    defaultConfig: {},
    customConfigs: {},
    genMipmaps: false,
};

export function createBuilderCoreMetadataNodes(
    commonOptionConfigs: Record<string, ICocosConfigurationPropertySchema>,
    useCacheDefaults: IBuildCacheUseConfig,
    bundleConfigDefault: BuildConfiguration['bundleConfig'],
    textureCompressConfigDefault: BuildConfiguration['textureCompressConfig']
): ICocosConfigurationNode[] {
    return [
        createBuilderCommonNode(commonOptionConfigs, 11),
        createBuilderUseCacheNode(useCacheDefaults, 12),
        createBuilderTextureCompressNode(textureCompressConfigDefault, 13),
        createBuilderBundleConfigNode(bundleConfigDefault, 14),
    ];
}

export function createBuilderPlatformMetadataNodes(
    platform: string,
    source: IBuilderMetadataSource,
    order = 20
): ICocosConfigurationNode[] {
    const node = createBuilderPlatformNode(platform, source, order);
    return node ? [node] : [];
}

export function createBuilderMetadataNodes(source: IBuilderMetadataSource): ICocosConfigurationNode[] {
    const nodes: ICocosConfigurationNode[] = createBuilderCoreMetadataNodes(
        source.commonOptionConfigs,
        source.useCacheDefaults,
        source.bundleConfigDefault ?? DEFAULT_BUNDLE_CONFIG,
        source.textureCompressConfigDefault ?? DEFAULT_TEXTURE_COMPRESS_CONFIG
    );

    const registeredPlatforms = Object.keys(source.configMap);
    registeredPlatforms.forEach((platform, index) => {
        nodes.push(...createBuilderPlatformMetadataNodes(platform, source, 20 + index));
    });

    return nodes;
}

function createBuilderCommonNode(
    commonOptionConfigs: Record<string, ICocosConfigurationPropertySchema>,
    order: number
): ICocosConfigurationNode {
    const properties: Record<string, ReturnType<typeof convertConfigItem>> = {};

    for (const [key, item] of Object.entries(commonOptionConfigs)) {
        if (hasConfigItemShape(item)) {
            properties[`builder.common.${key}`] = convertConfigItem(item, key);
        }
    }

    return createNode('builder.common', 'i18n:configuration.builder.common.title', 'builder', properties, order);
}

function createBuilderUseCacheNode(
    defaults: IBuildCacheUseConfig,
    order: number
): ICocosConfigurationNode {
    return createNode('builder.useCacheConfig', 'i18n:configuration.builder.useCache.title', 'builder', {
        'builder.useCacheConfig.serializeData': {
            type: 'boolean',
            default: defaults.serializeData,
            title: 'i18n:configuration.builder.useCache.serializeData.title',
        },
        'builder.useCacheConfig.engine': {
            type: 'boolean',
            default: defaults.engine,
            title: 'i18n:configuration.builder.useCache.engine.title',
        },
        'builder.useCacheConfig.textureCompress': {
            type: 'boolean',
            default: defaults.textureCompress,
            title: 'i18n:configuration.builder.useCache.textureCompress.title',
        },
        'builder.useCacheConfig.autoAtlas': {
            type: 'boolean',
            default: defaults.autoAtlas,
            title: 'i18n:configuration.builder.useCache.autoAtlas.title',
        },
    }, order);
}

function createBuilderTextureCompressNode(
    defaults: BuildConfiguration['textureCompressConfig'],
    order: number
): ICocosConfigurationNode {
    return createNode('builder.textureCompressConfig', 'i18n:configuration.builder.textureCompressConfig.title', 'builder', {
        'builder.textureCompressConfig': objectSchema(undefined, {
            default: defaults,
            title: 'i18n:configuration.builder.textureCompressConfig.title',
            description: 'i18n:configuration.builder.textureCompressConfig.description',
        }),
    }, order);
}

function createBuilderBundleConfigNode(
    defaults: BuildConfiguration['bundleConfig'],
    order: number
): ICocosConfigurationNode {
    const customDefaults = {
        default: DefaultBundleConfig,
        ...defaults.custom,
    };

    return createNode('builder.bundleConfig', 'i18n:configuration.builder.bundleConfig.title', 'builder', {
        'builder.bundleConfig.custom': objectSchema(undefined, {
            default: customDefaults,
            title: 'i18n:configuration.builder.bundleConfig.title',
            description: 'i18n:configuration.builder.bundleConfig.description',
        }),
    }, order);
}

function createBuilderPlatformNode(
    platform: string,
    source: IBuilderMetadataSource,
    order: number
): ICocosConfigurationNode | undefined {
    const configs = source.configMap[platform];
    if (!configs || !Object.keys(configs).length) {
        return undefined;
    }

    const properties: Record<string, ReturnType<typeof objectSchema> | ReturnType<typeof convertConfigItem>> = {
        [`builder.platforms.${platform}.outputName`]: {
            type: 'string',
            default: platform,
            title: 'i18n:configuration.builder.platform.outputName.title',
        },
    };

    for (const [pkgName, config] of Object.entries(configs)) {
        const mergedCommonOptions = lodash.defaultsDeep(
            {},
            source.commonOptionConfig[platform] ?? {},
            source.commonOptionConfigs
        ) as Record<string, ICocosConfigurationPropertySchema>;

        const packageProperties: Record<string, ReturnType<typeof convertConfigItem>> = {};
        for (const [key, item] of Object.entries(mergedCommonOptions)) {
            if (hasConfigItemShape(item)) {
                packageProperties[key] = convertConfigItem(item, key);
            }
        }

        for (const [key, item] of Object.entries(config.options ?? {})) {
            if (hasConfigItemShape(item)) {
                packageProperties[key] = convertConfigItem(item, key);
            }
        }

        if (packageProperties.platform) {
            packageProperties.platform.default = platform;
        }

        if (packageProperties.outputName) {
            packageProperties.outputName.default = platform;
        }

        properties[`builder.platforms.${platform}.packages.${pkgName}`] = objectSchema(packageProperties, {
            title: 'i18n:configuration.builder.platform.packageOptions.title',
        });
    }

    const platformTitle = translateMetadataText(source.platformTitles[platform]) ?? platform;
    const configSuffix = translateMetadataText('i18n:configuration.builder.platform.configSuffix')
        ?? 'Platform Config';

    return createNode(
        `builder.platforms.${platform}`,
        `${platformTitle} ${configSuffix}`,
        'builder',
        properties,
        order
    );
}
