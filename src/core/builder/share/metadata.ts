import type { IBuildCacheUseConfig } from '../@types';
import type { BuildConfiguration } from '../@types/config-export';
import type { IBuilderConfigItem } from '../@types/protected';
import type { ICocosConfigurationNode, ICocosConfigurationPropertySchema, IConfigurationItem } from '../../configuration/script/metadata';
import { DefaultBundleConfig } from './bundle-utils';
import {
    convertConfigItem,
    createNode,
    hasConfigItemShape,
    objectSchema,
    translateMetadataText,
} from '../../configuration/script/metadata';

interface IBuilderMetadataSource {
    commonOptionConfigs: Record<string, IConfigurationItem>;
    useCacheDefaults: IBuildCacheUseConfig;
    bundleConfigDefault?: BuildConfiguration['bundleConfig'];
    textureCompressConfigDefault?: BuildConfiguration['textureCompressConfig'];
    commonOptionConfig: Record<string, Record<string, IConfigurationItem>>;
    configMap: Record<string, Record<string, {
        displayName?: string;
        options?: Record<string, IConfigurationItem>;
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

const PLATFORM_HIDDEN_SCHEMA_OPTIONS: Record<string, string[]> = {
    'web-mobile': [
        'binGroupConfig',
        'skipCompressTexture',
        'packAutoAtlas',
    ],
    android: [
        // Example: 'inputSDK',
    ],
};

function shouldHidePlatformSchemaOption(platform: string, key: string): boolean {
    return PLATFORM_HIDDEN_SCHEMA_OPTIONS[platform]?.includes(key) ?? false;
}

function convertBuilderConfigItem(
    item: IConfigurationItem,
    key: string,
    platform?: string
): ICocosConfigurationPropertySchema {
    const schema = convertConfigItem(item, key);
    if (platform && shouldHidePlatformSchemaOption(platform, key)) {
        schema.hidden = true;
    }
    return schema;
}

export function createBuilderCoreMetadataNodes(
    commonOptionConfigs: Record<string, IConfigurationItem>,
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

export function createBuilderRenderSchema(
    config: Record<string, IBuilderConfigItem>,
    platform?: string
): ICocosConfigurationPropertySchema {
    const properties: Record<string, ICocosConfigurationPropertySchema> = {};
    const required: string[] = [];

    for (const [key, item] of Object.entries(config)) {
        if (!hasConfigItemShape(item)) {
            continue;
        }

        const schema = convertBuilderConfigItem(item, key, platform);
        properties[key] = schema;

        if (!schema.hidden && item.verifyRules?.includes('required')) {
            required.push(key);
        }
    }

    const result: ICocosConfigurationPropertySchema = { type: 'object', properties };
    if (required.length) {
        result.required = required;
    }
    return result;
}

function createBuilderCommonNode(
    commonOptionConfigs: Record<string, IConfigurationItem>,
    order: number
): ICocosConfigurationNode {
    const properties: Record<string, ReturnType<typeof convertConfigItem>> = {};

    for (const [key, item] of Object.entries(commonOptionConfigs)) {
        if (hasConfigItemShape(item)) {
            properties[`builder.common.${key}`] = convertBuilderConfigItem(item, key);
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
        const packageProperties: Record<string, ReturnType<typeof convertConfigItem>> = {};
        for (const [key, item] of Object.entries(config.options ?? {})) {
            if (hasConfigItemShape(item)) {
                packageProperties[key] = convertBuilderConfigItem(item, key, platform);
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

    const platformTitle = translateMetadataText(source.platformTitles[platform], platform) ?? platform;
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
