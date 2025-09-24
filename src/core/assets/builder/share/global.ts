import { join } from 'path';
import { Platform, IMD5Options } from '../@types/protected';

// 接口定义

/**
 * 日志配置接口
 * 控制构建过程中的日志输出行为
 */
export interface LogConfig {
    /** 日志级别，数值越大输出越详细，默认值: 3 */
    level: number;
    /** 日志打开方式，默认值: 'openFile' */
    openType: 'openFile' | 'openFileDir';
}

/**
 * 序列化选项接口
 * 控制场景和预制体的序列化行为
 */
export interface SerializedOptions {
    /** 是否保持节点UUID，默认值: false */
    keepNodeUuid: boolean;
}

/**
 * 项目设置覆盖配置接口
 * 用于覆盖项目中的宏定义和模块包含设置
 */
export interface OverwriteProjectSettings {
    /** 宏配置覆盖 */
    macroConfig: {
        /** 图像缓存清理设置，默认值: 'inherit-project-setting' */
        cleanupImageCache: string;
    };
    /** 模块包含配置覆盖 */
    includeModules: {
        /** 物理模块，默认值: 'inherit-project-setting' */
        physics: string;
        /** 2D物理模块，默认值: 'inherit-project-setting' */
        'physics-2d': string;
        /** WebGL2图形模块，默认值: 'inherit-project-setting' */
        'gfx-webgl2': string;
    };
}

/**
 * 通用构建配置接口
 * 包含构建过程中的基础配置选项
 */
export interface CommonConfig {
    /** 游戏名称，默认值: 'gameName' */
    name: string;
    /** 服务器地址，默认值: '' */
    server: string;
    /** 引擎模块配置键，默认值: '' */
    engineModulesConfigKey: string;
    /** 目标平台，默认值: 'web-desktop' */
    platform: string;
    /** 构建输出路径，默认值: 'project://build' */
    buildPath: string;
    /** 是否开启调试模式，默认值: false */
    debug: boolean;
    /** 构建模式，默认值: 'normal' */
    buildMode: string;
    /** 是否混淆属性名，默认值: false */
    mangleProperties: boolean;
    /** 是否启用MD5缓存，默认值: false */
    md5Cache: boolean;
    /** 是否跳过纹理压缩，默认值: false */
    skipCompressTexture: boolean;
    /** 是否生成源码映射，默认值: false */
    sourceMaps: boolean;
    /** 项目设置覆盖配置 */
    overwriteProjectSettings: OverwriteProjectSettings;
    /** 原生代码打包模式，默认值: 'both' */
    nativeCodeBundleMode: string;

    md5CacheOptions: IMD5Options;
}

/**
 * 全局配置接口
 * 包含编辑器级别的全局设置
 */
export interface GlobalConfig {
    /** 日志配置 */
    log: LogConfig;
    /** 序列化选项 */
    serializedOptions: SerializedOptions;
    /** 是否支持任务队列，默认值: true */
    supportTaskQueue: boolean;
    /** 是否使用构建资源缓存，默认值: true */
    useBuildAssetCache: boolean;
    /** 排序类型，默认值: 'buildTime' */
    sortType: string;
    /** 通用构建配置 */
    common: CommonConfig;
    /** 是否使用构建引擎缓存，默认值: true */
    useBuildEngineCache: boolean;
    /** 是否使用构建纹理压缩缓存，默认值: true */
    useBuildTextureCompressCache: boolean;
    /** 是否使用构建自动图集缓存，默认值: true */
    useBuildAutoAtlasCache: boolean;
}

/**
 * 纹理压缩选项接口
 * 定义单个纹理格式的压缩参数
 */
export interface TextureCompressOptions {
    /** 压缩质量，可以是字符串('fast', 'medium', 'high')或数值，默认值: 'fast' */
    quality?: string | number;
}

/**
 * 平台纹理选项接口
 * 定义特定平台支持的纹理格式
 */
export interface PlatformTextureOptions {
    /** 纹理格式配置，键为格式名，值为压缩选项 */
    [format: string]: TextureCompressOptions;
}

/**
 * 纹理预设接口
 * 定义一套完整的纹理压缩配置
 */
export interface TexturePreset {
    /** 预设名称 */
    name: string;
    /** 各平台的纹理选项配置 */
    options: {
        /** 平台配置，键为平台名，值为该平台的纹理选项 */
        [platform: string]: PlatformTextureOptions;
    };
}

/**
 * 纹理压缩配置接口
 * 管理所有纹理压缩相关的设置
 */
export interface TextureCompressConfig {
    /** 用户自定义预设，默认值: {} */
    userPreset: Record<string, any>;
    /** 默认配置预设，包含 'default' 和 'transparent' 两个预设 */
    defaultConfig: {
        /** 预设配置，键为预设名，值为纹理预设 */
        [presetName: string]: TexturePreset;
    };
    /** 用户预设模式，默认值: 'config' */
    userPresetMode: string;
    /** 自定义配置模式，默认值: 'config' */
    customConfigsMode: string;
    /** 自定义配置，默认值: {} */
    customConfigs: Record<string, any>;
    /** 是否生成Mipmaps，默认值: true */
    genMipmaps: boolean;
}

/**
 * 颜色接口
 * 使用RGBA格式表示颜色
 */
export interface Color {
    /** 红色分量 (0-1)，默认值: 0.0156862745098039 */
    x: number;
    /** 绿色分量 (0-1)，默认值: 0.0352941176470588 */
    y: number;
    /** 蓝色分量 (0-1)，默认值: 0.0392156862745098 */
    z: number;
    /** 透明度分量 (0-1)，默认值: 1 */
    w: number;
}

/**
 * 启动画面Logo配置接口
 * 定义启动画面中Logo的显示设置
 */
export interface SplashLogo {
    /** Logo类型，默认值: 'default' */
    type: string;
    /** Logo图片路径，默认值: '' */
    image: string;
}

/**
 * 启动画面背景配置接口
 * 定义启动画面背景的显示设置
 */
export interface SplashBackground {
    /** 背景类型，默认值: 'default' */
    type: string;
    /** 背景颜色 */
    color: Color;
    /** 背景图片路径，默认值: '' */
    image: string;
}

/**
 * 启动画面设置接口
 * 控制游戏启动时的启动画面显示
 */
export interface SplashSetting {
    /** 显示比例，默认值: 1 */
    displayRatio: number;
    /** 总显示时间(毫秒)，默认值: 2000 */
    totalTime: number;
    /** Logo配置 */
    logo: SplashLogo;
    /** 背景配置 */
    background: SplashBackground;
    /** 水印位置，默认值: 'default' */
    watermarkLocation: string;
    /** 是否自动适配，默认值: true */
    autoFit: boolean;
}

/**
 * 资源包配置接口
 * 管理资源包的自定义配置
 */
export interface BundleConfig {
    /** 自定义配置，默认值: {} */
    custom: Record<string, any>;
}

/**
 * 项目配置接口
 * 包含项目级别的配置设置
 */
export interface ProjectConfig {
    /** 纹理压缩配置 */
    textureCompressConfig: TextureCompressConfig;
    /** 启动画面设置 */
    splashSetting: SplashSetting;
    /** 是否已设置启动画面，默认值: false */
    hasSetSplash: boolean;
    /** 资源包配置 */
    bundleConfig: BundleConfig;
}

/**
 * 构建器总配置接口
 * 包含构建器的所有配置项
 */
export interface BuilderConfig {
    /** 全局配置 */
    global: GlobalConfig;
    /** 项目配置 */
    project: ProjectConfig;
}


let projectRoot = '';
let hasInit = false;
export function init(root: string) {
    if (hasInit) {
        return;
    }
    hasInit = true;
    BuildGlobalInfo.projectRoot = root;
    projectRoot = root;
}


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
    projectName: 'projectName',
    platforms: [] as Platform[],

    get buildTemplateDir() {
        return join(projectRoot, 'build-templates')
    },
    // 缓存目录
    get projectTempDir() {
        return join(projectRoot, 'temp', 'builder');
    },
    globalTempDir: join('', 'builder'),
    debugMode: false,
    init: false,
    isCommand: false,

    buildOptionsFileName: 'cocos.compile.config.json',
};



export function getDefaultConfig(): BuilderConfig {
    return {
        global: {
            log: {
                level: 3,
                openType: 'openFile'
            },
            serializedOptions: {
                keepNodeUuid: false
            },
            supportTaskQueue: true,
            useBuildAssetCache: true,
            sortType: 'buildTime',
            common: {
                name: 'gameName',
                server: '',
                engineModulesConfigKey: '',
                platform: 'web-desktop',
                buildPath: 'project://build',
                debug: false,
                buildMode: 'normal',
                mangleProperties: false,
                md5Cache: false,
                skipCompressTexture: false,
                sourceMaps: false,
                overwriteProjectSettings: {
                    macroConfig: {
                        cleanupImageCache: 'inherit-project-setting'
                    },
                    includeModules: {
                        physics: 'inherit-project-setting',
                        'physics-2d': 'inherit-project-setting',
                        'gfx-webgl2': 'inherit-project-setting'
                    }
                },
                nativeCodeBundleMode: 'both',
                md5CacheOptions: {
                    excludes: [],
                    includes: [],
                    replaceOnly: [],
                    handleTemplateMd5Link: true,
                },
            },
            useBuildEngineCache: true,
            useBuildTextureCompressCache: true,
            useBuildAutoAtlasCache: true,
        },
        project: {
            textureCompressConfig: {
                userPreset: {},
                defaultConfig: {
                    default: {
                        name: 'Default Opaque',
                        options: {
                            miniGame: {
                                etc1_rgb: { quality: 'fast' },
                                pvrtc_4bits_rgb: { quality: 'fast' },
                                jpg: { quality: 80 }
                            },
                            android: {
                                astc_8x8: { quality: 'medium' },
                                etc1_rgb: { quality: 'fast' },
                                jpg: { quality: 80 }
                            },
                            'harmonyos-next': {
                                astc_8x8: { quality: 'medium' },
                                etc1_rgb: { quality: 'fast' },
                                jpg: { quality: 80 }
                            },
                            ios: {
                                astc_8x8: { quality: 'medium' },
                                pvrtc_4bits_rgb: { quality: 'fast' },
                                jpg: { quality: 80 }
                            },
                            web: {
                                astc_8x8: { quality: 'medium' },
                                etc1_rgb: { quality: 'fast' },
                                pvrtc_4bits_rgb: { quality: 'fast' },
                                png: { quality: 80 }
                            },
                            pc: {}
                        }
                    },
                    transparent: {
                        name: 'Default Transparent',
                        options: {
                            miniGame: {
                                etc1_rgb_a: { quality: 'fast' },
                                pvrtc_4bits_rgb_a: { quality: 'fast' },
                                png: { quality: 80 }
                            },
                            android: {
                                astc_8x8: { quality: 'medium' },
                                etc1_rgb_a: { quality: 'fast' },
                                png: { quality: 80 }
                            },
                            'harmonyos-next': {
                                astc_8x8: { quality: 'medium' },
                                etc1_rgb_a: { quality: 'fast' },
                                png: { quality: 80 }
                            },
                            ios: {
                                astc_8x8: { quality: 'medium' },
                                pvrtc_4bits_rgb_a: { quality: 'fast' },
                                png: { quality: 80 }
                            },
                            web: {
                                astc_8x8: { quality: 'medium' },
                                etc1_rgb_a: { quality: 'fast' },
                                pvrtc_4bits_rgb_a: { quality: 'fast' },
                                png: { quality: 80 }
                            },
                            pc: {}
                        }
                    }
                },
                userPresetMode: 'config',
                customConfigsMode: 'config',
                customConfigs: {},
                genMipmaps: true
            },
            splashSetting: {
                displayRatio: 1,
                totalTime: 2000,
                logo: {
                    type: 'default',
                    image: ''
                },
                background: {
                    type: 'default',
                    color: {
                        x: 0.0156862745098039,
                        y: 0.0352941176470588,
                        z: 0.0392156862745098,
                        w: 1
                    },
                    image: ''
                },
                watermarkLocation: 'default',
                autoFit: true
            },
            hasSetSplash: false,
            bundleConfig: {
                custom: {}
            }
        }
    };
}

export const config = {
    ...getDefaultConfig(),
};