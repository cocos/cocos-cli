import { join } from "path";
import { IBaseConfiguration, ConfigurationScope, configurationRegistry } from "../../configuration";
import { IBuildCommonOptions, Platform } from "../@types";
import { PLATFORMS } from "./platforms-options";
import { BuildConfiguration } from "../../assets/@types/config-export";

export const BuildGlobalInfo = {
    // 一些常量
    LIBRARY_NAME: 'library',
    IMPORT_HEADER: 'import',
    RESOURCES: 'resources',
    SUBPACKAGES_HEADER: 'subpackages',
    ASSETS_HEADER: 'assets',
    REMOTE_HEADER: 'remote',
    NATIVE_HEADER: 'native',
    BUNDLE_SCRIPTS_HEADER: 'bundle-scripts',
    SCRIPT_NAME: 'index.js',
    CONFIG_NAME: 'config.json',
    BUNDLE_ZIP_NAME: 'res.zip',
    projectRoot: '',
    buildTemplateDir: '',
    // globalTempDir: '',
    projectTempDir: '',
    projectName: 'projectName',

    platforms: [] as Platform[],
    debugMode: false,
    isCommand: false,

    buildOptionsFileName: 'cocos.compile.config.json',
};
export function getBuildCommonOptions(): IBuildCommonOptions {
    return {
        name: 'gameName',
        outputName: 'web-desktop',
        buildPath: 'project://build',
        taskName: 'build task',
        platform: 'web-desktop',
        scenes: [],
        skipCompressTexture: false,
        sourceMaps: false,
        experimentalEraseModules: false,
        bundleCommonChunk: false,
        startScene: '',
        debug: false,
        mangleProperties: false,
        inlineEnum: true,
        inlineSpriteFrames: true,
        md5Cache: false,
        mainBundleCompressionType: 'merge_dep',
        mainBundleIsRemote: false,
        startSceneAssetBundle: false,
        moveRemoteBundleScript: false,
        nativeCodeBundleMode: 'asmjs',
    }
}

export function getDefaultConfig(): BuildConfiguration {
    return {
        common: getBuildCommonOptions(),
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
                "default": {
                    "name": "Default Opaque",
                    "options": {
                        "miniGame": {
                            "etc1_rgb": {
                                "quality": "fast"
                            },
                            "pvrtc_4bits_rgb": {
                                "quality": "fast"
                            },
                            "jpg": {
                                "quality": 80
                            }
                        },
                        "android": {
                            "astc_8x8": {
                                "quality": "medium"
                            },
                            "etc1_rgb": {
                                "quality": "fast"
                            },
                            "jpg": {
                                "quality": 80
                            }
                        },
                        "harmonyos-next": {
                            "astc_8x8": {
                                "quality": "medium"
                            },
                            "etc1_rgb": {
                                "quality": "fast"
                            },
                            "jpg": {
                                "quality": 80
                            }
                        },
                        "ios": {
                            "astc_8x8": {
                                "quality": "medium"
                            },
                            "pvrtc_4bits_rgb": {
                                "quality": "fast"
                            },
                            "jpg": {
                                "quality": 80
                            }
                        },
                        "web": {
                            "astc_8x8": {
                                "quality": "medium"
                            },
                            "etc1_rgb": {
                                "quality": "fast"
                            },
                            "pvrtc_4bits_rgb": {
                                "quality": "fast"
                            },
                            "png": {
                                "quality": 80
                            }
                        },
                        "pc": {}
                    }
                },
                "transparent": {
                    "name": "Default Transparent",
                    "options": {
                        "miniGame": {
                            "etc1_rgb_a": {
                                "quality": "fast"
                            },
                            "pvrtc_4bits_rgb_a": {
                                "quality": "fast"
                            },
                            "png": {
                                "quality": 80
                            }
                        },
                        "android": {
                            "astc_8x8": {
                                "quality": "medium"
                            },
                            "etc1_rgb_a": {
                                "quality": "fast"
                            },
                            "png": {
                                "quality": 80
                            }
                        },
                        "harmonyos-next": {
                            "astc_8x8": {
                                "quality": "medium"
                            },
                            "etc1_rgb_a": {
                                "quality": "fast"
                            },
                            "png": {
                                "quality": 80
                            }
                        },
                        "ios": {
                            "astc_8x8": {
                                "quality": "medium"
                            },
                            "pvrtc_4bits_rgb_a": {
                                "quality": "fast"
                            },
                            "png": {
                                "quality": 80
                            }
                        },
                        "web": {
                            "astc_8x8": {
                                "quality": "medium"
                            },
                            "etc1_rgb_a": {
                                "quality": "fast"
                            },
                            "pvrtc_4bits_rgb_a": {
                                "quality": "fast"
                            },
                            "png": {
                                "quality": 80
                            }
                        },
                        "pc": {}
                    }
                }
            },
            userPresetMode: "config",
            customConfigs: {},
            genMipmaps: true
        }
    };
}

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

    constructor() {

    }

    _init = false;

    async init(platforms?: Platform[]) {
        if (this._init) {
            return;
        }
        BuildGlobalInfo.platforms = platforms || PLATFORMS
        const project = await import('../../project');
        const projectInfo = project.default.getInfo();
        BuildGlobalInfo.projectName = projectInfo.name;
        BuildGlobalInfo.projectRoot = project.default.path;
        BuildGlobalInfo.buildTemplateDir = join(BuildGlobalInfo.projectRoot, 'build-template');
        BuildGlobalInfo.projectTempDir = join(BuildGlobalInfo.projectRoot, 'temp', 'builder', );
        // BuildGlobalInfo.globalTempDir = join(projectInfo.path, 'builder', 'temp', 'global');
        this._init = true;
        this._configInstance = await configurationRegistry.register('builder', getDefaultConfig());
        const data = await this.getProject<Record<string, any>>();
        console.log('builderConfig', data);
    }
}

export default new BuilderConfig();