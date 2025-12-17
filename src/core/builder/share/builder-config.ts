import { basename, join } from 'path';
import { getOptionsDefault } from './utils';
import { IBaseConfiguration, ConfigurationScope, configurationRegistry } from '../../configuration';
import { IBuildCommonOptions } from '../@types';
import { IBuilderConfigItem } from '../@types/protected';
import { BuildConfiguration } from '../@types/config-export';

class BuilderConfig {
    /**
     * 持有的可双向绑定的配置管理实例
     */
    private _configInstance!: IBaseConfiguration;
    getProject<T>(path?: string, scope?: ConfigurationScope): Promise<T> {
        return this._configInstance.get(path, scope);
    }

    setProject(path: string, value: any, scope?: ConfigurationScope) {
        return this._configInstance.set(path, value, scope);
    }

    commonOptionConfigs: Record<string, IBuilderConfigItem> = {
        platform: {
            label: 'i18n:builder.options.platform',
            default: 'web-mobile',
            type: 'string',
        },
        name: {
            label: 'i18n:builder.options.name',
            type: 'string',
            // will update in init
            default: 'gameName',
            verifyRules: ['required'],
        },
        polyfills: {
            label: 'i18n:builder.options.polyfills',
            description: 'i18n:builder.options.polyfills_tips',
            type: 'object',
            hidden: true,
            default: {
                asyncFunctions: false,
            },
            properties: {
                asyncFunctions: {
                    label: 'i18n:builder.options.async_functions',
                    description: 'i18n:builder.options.async_functions_tips',
                    type: 'boolean',
                    default: false,
                },
                coreJs: {
                    label: 'i18n:builder.options.core_js',
                    description: 'i18n:builder.options.core_js_tips',
                    type: 'boolean',
                    default: false,
                },
            },
        },
        buildScriptTargets: {
            label: 'i18n:builder.options.buildScriptTargets',
            description: 'i18n:builder.options.buildScriptTargetsTips',
            hidden: true,
            type: 'string',
            default: '',
        },
        server: {
            label: 'i18n:builder.options.remote_server_address',
            description: 'i18n:builder.options.remote_server_address_tips',
            default: '',
            type: 'string',
            verifyRules: ['http'],
        },
        sourceMaps: {
            label: 'i18n:builder.options.sourceMap',
            default: 'inline',
            description: 'i18n:builder.options.sourceMapTips',
            type: 'enum',
            items: [{
                label: 'i18n:builder.off',
                value: 'false',
            }, {
                label: 'i18n:builder.options.sourceMapsInline',
                value: 'inline',
            }, {
                label: 'i18n:builder.options.standaloneSourceMaps',
                value: 'true',
            }],
        },
        experimentalEraseModules: {
            label: 'i18n:builder.options.experimental_erase_modules',
            description: 'i18n:builder.options.experimental_erase_modules_tips',
            default: false,
            experiment: true,
            type: 'boolean',
        },
        startSceneAssetBundle: {
            label: 'i18n:builder.options.start_scene_asset_bundle',
            description: 'i18n:builder.options.start_scene_asset_bundle_tips',
            default: false,
            hidden: true,
            type: 'boolean',
        },
        bundleConfigs: {
            label: 'i18n:builder.options.includeBundles',
            default: [],
            type: 'array',
            items: {
                type: 'object',
                properties: {}, // Placeholder for bundle config properties if needed
            },
            verifyLevel: 'warn',
        },
        // 之前 ios-app-clip 有隐藏 buildPath 的需求
        buildPath: {
            label: 'i18n:builder.options.build_path',
            description: 'i18n:builder.tips.build_path',
            default: 'project://build',
            type: 'string',
            verifyRules: ['required'],
        },
        debug: {
            label: 'i18n:builder.options.debug',
            description: 'i18n:builder.options.debugTips',
            default: true,
            type: 'boolean',
        },
        mangleProperties: {
            label: 'i18n:builder.options.mangleProperties',
            description: 'i18n:builder.options.manglePropertiesTip',
            default: false,
            type: 'boolean',
        },
        inlineEnum: {
            label: 'i18n:builder.options.inlineEnum',
            description: 'i18n:builder.options.inlineEnumTip',
            default: true,
            type: 'boolean',
        },
        md5Cache: {
            label: 'i18n:builder.options.md5_cache',
            description: 'i18n:builder.options.md5CacheTips',
            default: false,
            type: 'boolean',
        },
        md5CacheOptions: {
            default: {
                excludes: [],
                includes: [],
                replaceOnly: [],
                handleTemplateMd5Link: true,
            },
            type: 'object',
            properties: {
                excludes: { type: 'array', items: { type: 'string' }, default: [] },
                includes: { type: 'array', items: { type: 'string' }, default: [] },
                replaceOnly: { type: 'array', items: { type: 'string' }, default: [] },
                handleTemplateMd5Link: { type: 'boolean', default: true },
            },
        },
        mainBundleIsRemote: {
            label: 'i18n:builder.options.main_bundle_is_remote',
            description: 'i18n:builder.asset_bundle.remote_bundle_invalid_tooltip',
            default: false,
            type: 'boolean',
        },
        mainBundleCompressionType: {
            label: 'i18n:builder.options.main_bundle_compression_type',
            description: 'i18n:builder.asset_bundle.compression_type_tooltip',
            default: 'merge_dep',
            type: 'string',
        },
        useSplashScreen: {
            label: 'i18n:builder.use_splash_screen',
            default: true,
            type: 'boolean',
        },
        bundleCommonChunk: {
            label: 'i18n:builder.bundleCommonChunk',
            description: 'i18n:builder.bundleCommonChunkTips',
            default: false,
            type: 'boolean',
        },
        skipCompressTexture: {
            label: 'i18n:builder.options.skip_compress_texture',
            default: false,
            type: 'boolean',
        },
        packAutoAtlas: {
            label: 'i18n:builder.options.pack_autoAtlas',
            default: true,
            type: 'boolean',
        },
        startScene: {
            label: 'i18n:builder.options.start_scene',
            description: 'i18n:builder.options.startSceneTips',
            default: '',
            type: 'string',
        },
        outputName: {
            // 这个数据界面不显示，不需要 i18n
            description: '构建的输出目录名，将会作为后续构建任务上的名称',
            default: '',
            type: 'string',
            verifyRules: ['required', 'normalName'],
        },
        taskName: {
            default: '',
            type: 'string',
            verifyRules: ['required'],
        },
        scenes: {
            label: 'i18n:builder.options.scenes',
            description: 'i18n:builder.tips.build_scenes',
            default: [],
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    url: { type: 'string' },
                    uuid: { type: 'string' },
                },
            },
        },
        overwriteProjectSettings: {
            default: {
                macroConfig: {
                    cleanupImageCache: 'inherit-project-setting',
                },
                includeModules: {
                    physics: 'inherit-project-setting',
                    'physics-2d': 'inherit-project-setting',
                    'gfx-webgl2': 'off',
                },
            },
            type: 'object',
            properties: {
                macroConfig: {
                    type: 'object',
                    properties: {
                        cleanupImageCache: { type: 'string', default: 'inherit-project-setting' },
                    },
                },
                includeModules: {
                    type: 'object',
                    properties: {
                        physics: { type: 'string', default: 'inherit-project-setting' },
                        'physics-2d': { type: 'string', default: 'inherit-project-setting' },
                        'gfx-webgl2': { type: 'string', default: 'off' },
                    },
                },
            },
        },
        nativeCodeBundleMode: {
            default: 'asmjs',
            type: 'string',
        },
        wasmCompressionMode: {
            hidden: true,
            default: false,
            type: 'boolean',
        },
        binGroupConfig: {
            default: {
                threshold: 16,
                enable: false,
            },
            type: 'object',
            label: 'i18n:builder.options.bin_group_config',
            properties: {
                enable: {
                    label: 'i18n:builder.options.enable_cconb_group',
                    description: 'i18n:builder.options.enable_cconb_group_tips',
                    type: 'boolean',
                    default: false,
                },
                threshold: {
                    type: 'number',
                    default: 16,
                },
            },
        },
    };

    getBuildCommonOptions(): IBuildCommonOptions {
        if (!this._init) {
            throw new Error('BuilderConfig is not initialized');
        }
        const defaultOptions = getOptionsDefault(this.commonOptionConfigs);
        return {
            ...defaultOptions,
            moveRemoteBundleScript: false,
            packages: {},
        } as IBuildCommonOptions;
    }

    getDefaultConfig(): BuildConfiguration {
        return {
            common: this.getBuildCommonOptions(),
            platforms: {
                // 'web-desktop': { xxx }
            },
            useCacheConfig: {
                serializeData: true,
                engine: true,
                textureCompress: true,
                autoAtlas: true,
            },
            bundleConfig: {
                custom: {},
            },
            textureCompressConfig: {
                userPreset: {},
                defaultConfig: {
                    default: {
                        name: 'Default Opaque',
                        options: {
                            miniGame: {
                                etc1_rgb: {
                                    quality: 'fast'
                                },
                                pvrtc_4bits_rgb: {
                                    quality: 'fast'
                                },
                                jpg: {
                                    quality: 80
                                }
                            },
                            android: {
                                astc_8x8: {
                                    quality: 'medium'
                                },
                                etc1_rgb: {
                                    quality: 'fast'
                                },
                                jpg: {
                                    quality: 80
                                }
                            },
                            'harmonyos-next': {
                                astc_8x8: {
                                    quality: 'medium'
                                },
                                etc1_rgb: {
                                    quality: 'fast'
                                },
                                jpg: {
                                    quality: 80
                                }
                            },
                            ios: {
                                astc_8x8: {
                                    quality: 'medium'
                                },
                                pvrtc_4bits_rgb: {
                                    quality: 'fast'
                                },
                                jpg: {
                                    quality: 80
                                }
                            },
                            web: {
                                astc_8x8: {
                                    quality: 'medium'
                                },
                                etc1_rgb: {
                                    quality: 'fast'
                                },
                                pvrtc_4bits_rgb: {
                                    quality: 'fast'
                                },
                                png: {
                                    quality: 80
                                }
                            },
                            pc: {}
                        }
                    },
                    transparent: {
                        name: 'Default Transparent',
                        options: {
                            miniGame: {
                                etc1_rgb_a: {
                                    quality: 'fast'
                                },
                                pvrtc_4bits_rgb_a: {
                                    quality: 'fast'
                                },
                                png: {
                                    quality: 80
                                }
                            },
                            android: {
                                astc_8x8: {
                                    quality: 'medium'
                                },
                                etc1_rgb_a: {
                                    quality: 'fast'
                                },
                                png: {
                                    quality: 80
                                }
                            },
                            'harmonyos-next': {
                                astc_8x8: {
                                    quality: 'medium'
                                },
                                etc1_rgb_a: {
                                    quality: 'fast'
                                },
                                png: {
                                    quality: 80
                                }
                            },
                            ios: {
                                astc_8x8: {
                                    quality: 'medium'
                                },
                                pvrtc_4bits_rgb_a: {
                                    quality: 'fast'
                                },
                                png: {
                                    quality: 80
                                }
                            },
                            web: {
                                astc_8x8: {
                                    quality: 'medium'
                                },
                                etc1_rgb_a: {
                                    quality: 'fast'
                                },
                                pvrtc_4bits_rgb_a: {
                                    quality: 'fast'
                                },
                                png: {
                                    quality: 80
                                }
                            },
                            pc: {}
                        }
                    }
                },
                customConfigs: {},
                genMipmaps: true
            }
        };
    }

    private _projectRoot = '';
    private _buildTemplateDir = '';
    private _projectTempDir = '';

    get projectRoot() {
        if (!this._init) {
            throw new Error('BuilderConfig is not initialized');
        }
        return this._projectRoot;
    }

    get buildTemplateDir() {
        if (!this._init) {
            throw new Error('BuilderConfig is not initialized');
        }
        return this._buildTemplateDir;
    }

    get projectTempDir() {
        if (!this._init) {
            throw new Error('BuilderConfig is not initialized');
        }
        return this._projectTempDir;
    }

    private _init = false;

    async init() {
        if (this._init) {
            return;
        }
        const project = await import('../../project');

        this._projectRoot = project.default.path;
        this._buildTemplateDir = join(this._projectRoot, 'build-template');
        this._projectTempDir = join(this._projectRoot, 'temp', 'builder',);
        this.commonOptionConfigs.name.default = project.default.getInfo().name || 'gameName';

        this._init = true;
        this._configInstance = await configurationRegistry.register('builder', this.getDefaultConfig());
    }
}

export default new BuilderConfig();
