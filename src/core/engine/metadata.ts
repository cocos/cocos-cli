import type { IEngineConfig } from './@types/config';
import type { ICocosConfigurationNode, ICocosConfigurationPropertySchemaInput } from '../configuration/script/metadata';
import { arraySchema, createNode, objectSchema } from '../configuration/script/metadata';
import { getEngineDynamicConfigContribution } from './dynamic-metadata';

interface IEngineMetadataOptions {
    defaultConfig: IEngineConfig;
    engineRoot: string;
}

export function createEngineMetadataNodes(options: IEngineMetadataOptions): ICocosConfigurationNode[] {
    const dynamicMetadata = getEngineDynamicConfigContribution({
        engineRoot: options.engineRoot,
        fallbackConfig: {
            includeModules: options.defaultConfig.includeModules,
            flags: options.defaultConfig.flags,
            macroConfig: options.defaultConfig.macroConfig,
        },
    }).metadata;

    return [
        createNode('engine.physicsConfig', 'i18n:configuration.engine.physicsConfig.title', 'engine', {
            'engine.physicsConfig.gravity': {
                type: 'object',
                default: options.defaultConfig.physicsConfig.gravity,
                title: 'i18n:configuration.engine.physicsConfig.gravity.title',
                description: 'i18n:configuration.engine.physicsConfig.gravity.description',
            },
            'engine.physicsConfig.allowSleep': {
                type: 'boolean',
                default: options.defaultConfig.physicsConfig.allowSleep,
                title: 'i18n:configuration.engine.physicsConfig.allowSleep.title',
                description: 'i18n:configuration.engine.physicsConfig.allowSleep.description',
            },
            'engine.physicsConfig.sleepThreshold': {
                type: 'number',
                default: options.defaultConfig.physicsConfig.sleepThreshold,
                minimum: 0,
                title: 'i18n:configuration.engine.physicsConfig.sleepThreshold.title',
                description: 'i18n:configuration.engine.physicsConfig.sleepThreshold.description',
            },
            'engine.physicsConfig.autoSimulation': {
                type: 'boolean',
                default: options.defaultConfig.physicsConfig.autoSimulation,
                title: 'i18n:configuration.engine.physicsConfig.autoSimulation.title',
                description: 'i18n:configuration.engine.physicsConfig.autoSimulation.description',
            },
            'engine.physicsConfig.fixedTimeStep': {
                type: 'number',
                default: options.defaultConfig.physicsConfig.fixedTimeStep,
                minimum: 0,
                title: 'i18n:configuration.engine.physicsConfig.fixedTimeStep.title',
                description: 'i18n:configuration.engine.physicsConfig.fixedTimeStep.description',
            },
            'engine.physicsConfig.maxSubSteps': {
                type: 'number',
                default: options.defaultConfig.physicsConfig.maxSubSteps,
                minimum: 0,
                title: 'i18n:configuration.engine.physicsConfig.maxSubSteps.title',
                description: 'i18n:configuration.engine.physicsConfig.maxSubSteps.description',
            },
            'engine.physicsConfig.useNodeChains': {
                type: 'boolean',
                default: options.defaultConfig.physicsConfig.useNodeChains,
                title: 'i18n:configuration.engine.physicsConfig.useNodeChains.title',
            },
            'engine.physicsConfig.physicsEngine': {
                type: 'string',
                default: options.defaultConfig.physicsConfig.physicsEngine,
                title: 'i18n:configuration.engine.physicsConfig.physicsEngine.title',
                description: 'i18n:configuration.engine.physicsConfig.physicsEngine.description',
            },
            'engine.physicsConfig.collisionMatrix': {
                type: 'object',
                default: options.defaultConfig.physicsConfig.collisionMatrix,
                title: 'i18n:configuration.engine.physicsConfig.collisionMatrix.title',
                description: 'i18n:configuration.engine.physicsConfig.collisionMatrix.description',
            },
            'engine.physicsConfig.defaultMaterial': {
                type: 'string',
                default: options.defaultConfig.physicsConfig.defaultMaterial,
                title: 'i18n:configuration.engine.physicsConfig.defaultMaterial.title',
                description: 'i18n:configuration.engine.physicsConfig.defaultMaterial.description',
            },
            'engine.physicsConfig.physX': {
                type: 'object',
                default: options.defaultConfig.physicsConfig.physX,
                title: 'i18n:configuration.engine.physicsConfig.physX.title',
                description: 'i18n:configuration.engine.physicsConfig.physX.description',
            },
        }, 1),

        createNode('engine.designResolution', 'i18n:configuration.engine.designResolution.title', 'engine', {
            'engine.designResolution.width': {
                type: 'number',
                default: options.defaultConfig.designResolution.width,
                title: 'i18n:configuration.engine.designResolution.width.title',
            },
            'engine.designResolution.height': {
                type: 'number',
                default: options.defaultConfig.designResolution.height,
                title: 'i18n:configuration.engine.designResolution.height.title',
            },
            'engine.designResolution.fitWidth': {
                type: 'boolean',
                default: options.defaultConfig.designResolution.fitWidth,
                title: 'i18n:configuration.engine.designResolution.fitWidth.title',
            },
            'engine.designResolution.fitHeight': {
                type: 'boolean',
                default: options.defaultConfig.designResolution.fitHeight,
                title: 'i18n:configuration.engine.designResolution.fitHeight.title',
            },
        }, 2),

        createNode('engine.splashScreen', 'i18n:configuration.engine.splashScreen.title', 'engine', {
            'engine.splashScreen.displayRatio': {
                type: 'number',
                default: options.defaultConfig.splashScreen.displayRatio,
                title: 'i18n:configuration.engine.splashScreen.displayRatio.title',
            },
            'engine.splashScreen.totalTime': {
                type: 'number',
                default: options.defaultConfig.splashScreen.totalTime,
                minimum: 0,
                title: 'i18n:configuration.engine.splashScreen.totalTime.title',
            },
            'engine.splashScreen.watermarkLocation': {
                type: 'string',
                default: options.defaultConfig.splashScreen.watermarkLocation,
                title: 'i18n:configuration.engine.splashScreen.watermarkLocation.title',
                enum: ['default', 'topLeft', 'topRight', 'topCenter', 'bottomLeft', 'bottomCenter', 'bottomRight'],
                enumDescriptions: [
                    'i18n:configuration.engine.splashScreen.watermarkLocation.options.default',
                    'i18n:configuration.engine.splashScreen.watermarkLocation.options.topLeft',
                    'i18n:configuration.engine.splashScreen.watermarkLocation.options.topRight',
                    'i18n:configuration.engine.splashScreen.watermarkLocation.options.topCenter',
                    'i18n:configuration.engine.splashScreen.watermarkLocation.options.bottomLeft',
                    'i18n:configuration.engine.splashScreen.watermarkLocation.options.bottomCenter',
                    'i18n:configuration.engine.splashScreen.watermarkLocation.options.bottomRight',
                ],
            },
            'engine.splashScreen.autoFit': {
                type: 'boolean',
                default: options.defaultConfig.splashScreen.autoFit,
                title: 'i18n:configuration.engine.splashScreen.autoFit.title',
            },
            'engine.splashScreen.logo': {
                type: 'object',
                default: options.defaultConfig.splashScreen.logo,
                title: 'i18n:configuration.engine.splashScreen.logo.title',
            },
            'engine.splashScreen.background': {
                type: 'object',
                default: options.defaultConfig.splashScreen.background,
                title: 'i18n:configuration.engine.splashScreen.background.title',
            },
        }, 3),

        createNode('engine.moduleConfig', 'i18n:configuration.engine.moduleConfig.title', 'engine', {
            'engine.includeModules': dynamicMetadata.includeModules,
            ...prefixProperties('engine.flags', dynamicMetadata.flagProperties),
            'engine.noDeprecatedFeatures': {
                type: 'object',
                default: undefined,
                title: 'i18n:configuration.engine.moduleConfig.noDeprecatedFeatures.title',
                description: 'i18n:configuration.engine.moduleConfig.noDeprecatedFeatures.description',
            },
            'engine.globalConfigKey': {
                type: 'string',
                default: '',
                title: 'i18n:configuration.engine.projectConfig.globalConfigKey.title',
            },
            'engine.configs': objectSchema(undefined, {
                title: 'i18n:configuration.engine.projectConfig.configs.title',
                additionalProperties: objectSchema({
                    includeModules: dynamicMetadata.includeModules,
                    flags: dynamicMetadata.flagsObject,
                    noDeprecatedFeatures: objectSchema({
                        value: {
                            type: 'boolean',
                            title: 'i18n:configuration.engine.projectConfig.noDeprecatedFeatureConfig.value.title',
                        },
                        version: {
                            type: 'string',
                            title: 'i18n:configuration.engine.projectConfig.noDeprecatedFeatureConfig.version.title',
                        },
                    }, {
                        title: 'i18n:configuration.engine.projectConfig.noDeprecatedFeatureConfig.title',
                    }),
                }, {
                    title: 'i18n:configuration.engine.projectConfig.configItem.title',
                }),
            }),
        }, 4),

        createNode('engine.rendering', 'i18n:configuration.engine.rendering.title', 'engine', {
            'engine.renderPipeline': {
                type: 'string',
                default: options.defaultConfig.renderPipeline,
                title: 'i18n:configuration.engine.rendering.renderPipeline.title',
                description: 'i18n:configuration.engine.rendering.renderPipeline.description',
            },
            'engine.customPipeline': {
                type: 'boolean',
                default: options.defaultConfig.customPipeline,
                title: 'i18n:configuration.engine.rendering.customPipeline.title',
                description: 'i18n:configuration.engine.rendering.customPipeline.description',
            },
            'engine.highQuality': {
                type: 'boolean',
                default: options.defaultConfig.highQuality,
                title: 'i18n:configuration.engine.rendering.highQuality.title',
            },
            'engine.downloadMaxConcurrency': {
                type: 'number',
                default: options.defaultConfig.downloadMaxConcurrency,
                minimum: 1,
                title: 'i18n:configuration.engine.rendering.downloadMaxConcurrency.title',
            },
            'engine.customJointTextureLayouts': {
                type: 'array',
                default: options.defaultConfig.customJointTextureLayouts,
                title: 'i18n:configuration.engine.rendering.customJointTextureLayouts.title',
                description: 'i18n:configuration.engine.rendering.customJointTextureLayouts.description',
            },
        }, 5),

        createNode('engine.macroConfig', 'i18n:configuration.engine.macroConfig.title', 'engine', {
            ...prefixProperties('engine.macroConfig', dynamicMetadata.macroProperties),
            'engine.macroCustom': arraySchema(objectSchema({
                key: {
                    type: 'string',
                    title: 'i18n:configuration.engine.macroConfig.macroCustom.key.title',
                },
                value: {
                    type: 'boolean',
                    title: 'i18n:configuration.engine.macroConfig.macroCustom.value.title',
                },
            }, {
                title: 'i18n:configuration.engine.macroConfig.macroCustom.itemTitle',
                required: ['key', 'value'],
            }), {
                default: options.defaultConfig.macroCustom,
                title: 'i18n:configuration.engine.macroConfig.macroCustom.title',
                description: 'i18n:configuration.engine.macroConfig.macroCustom.description',
            }),
        }, 6),

        createNode('engine.customLayers', 'i18n:configuration.engine.layers.customLayers.title', 'engine', {
            'engine.customLayers': {
                type: 'array',
                default: options.defaultConfig.customLayers,
                title: 'i18n:configuration.engine.layers.customLayers.title',
                description: 'i18n:configuration.engine.layers.customLayers.description',
            },
        }, 7),

        createNode('engine.sortingLayers', 'i18n:configuration.engine.layers.sortingLayers.title', 'engine', {
            'engine.sortingLayers': {
                type: 'array',
                default: options.defaultConfig.sortingLayers,
                title: 'i18n:configuration.engine.layers.sortingLayers.title',
                description: 'i18n:configuration.engine.layers.sortingLayers.description',
            },
        }, 8),
    ];
}

function prefixProperties(
    prefix: string,
    properties: Record<string, ICocosConfigurationPropertySchemaInput>
): Record<string, ICocosConfigurationPropertySchemaInput> {
    return Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [`${prefix}.${key}`, value])
    );
}
