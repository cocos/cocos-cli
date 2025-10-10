/**
 * 校验构建通用配置参数
 */

import { basename, isAbsolute, join } from 'path';
import { BundleCompressionTypes } from './bundle-utils';
import { builtinPlugins, PLATFORMS } from './platforms-options';
import { Validator } from './validator';
import { validatorManager } from './validator-manager';
import { NATIVE_PLATFORM } from './platforms-options';
import { Platform, IBuildSceneItem, IBuildTaskItemJSON, IConfigItem, IBuildTaskOption, IBuildCommonOptions } from '../@types';
import { IInternalBuildSceneItem } from '../@types/options';
import { BuildCheckResult, BundleCompressionType, IInternalBuildOptions, IInternalBundleBuildOptions, IPhysicsConfig } from '../@types/protected';
import i18n from '../../base/i18n';
import Utils from '../../base/utils';
import { assetManager } from '../../assets/manager/asset';
import engine from '../../engine';
import builderConfig, { BuildGlobalInfo, getBuildCommonOptions } from './builder-config';
import { fa } from 'zod/v4/locales';
interface ModuleConfig {
    match: (module: string) => boolean;
    default: string | boolean;
}

export const overwriteModuleConfig: Record<string, ModuleConfig> = {
    physics: {
        match: (key: string) => {
            return key.startsWith('physics-') && !key.startsWith('physics-2d');
        },
        default: 'inherit-project-setting',
    },
    'physics-2d': {
        match: (key: string) => {
            return key.startsWith('physics-2d-');
        },
        default: 'inherit-project-setting',
    },
};

/**
  * 是否为构建支持平台
  * @param platform 
  * @returns 
  */
function supportPlatform(platform: Platform): boolean {
    return platform && !!builtinPlugins.includes(platform);
}

/**
 * 校验场景数据
 * @returns 校验结果
 * @param scenes
 */
async function checkScenes(scenes: IBuildSceneItem[]): Promise<boolean | Error> {
    if (!Array.isArray(scenes) || !scenes.length) {
        return new Error('Scenes is empty');
    }
    const validScenes = scenes.filter((scene) => scene && scene.uuid);
    if (validScenes.length !== scenes.length) {
        return new Error(i18n.t('builder.error.missingScenes'));
    }

    const res = validScenes.map((scene) => assetManager.queryUrl(scene.uuid));
    const invalidIndex = res.findIndex((url) => !url);
    if (invalidIndex !== -1) {
        return new Error(i18n.t('builder.error.missingScenes', {
            url: validScenes[invalidIndex].url,
        }));
    }
    return true;
}

/**
  * 确认初始场景对错
  * @param uuid 
  */
export async function checkStartScene(uuid: string): Promise<boolean> {
    if (typeof uuid !== 'string' || !uuid) {
        return false;
    }
    const assetUrl = assetManager.queryUrl(uuid);
    if (!assetUrl) {
        return false;
    }
    if (assetUrl.startsWith('db://internal')) {
        return false;
    }
    const bundleDirInfos = assetManager.queryAssets({ isBundle: true });
    if (bundleDirInfos.find((info) => assetUrl.startsWith(info.url + '/'))) {
        return false;
    }

    return true;
}

/**
  * 根据输入的文件夹和目标名称计算不和本地冲突的文件地址
  * @param root
  * @param dirName
  */
export async function calcValidOutputName(root: string, dirName: string, platform: string, id?: string) {
    if (!root || !dirName) {
        return '';
    }
    let dest = join(Utils.Path.resolveToRaw(root), dirName);
    dest = Utils.File.getName(dest);
    return basename(dest);
}

// 创建 taskMap 中 buildPath 字典
function createBuildPathDict(taskMap: Record<string, IBuildTaskItemJSON>) {
    const buildPathDict: Record<string, string[]> = {};
    for (const key in taskMap) {
        const task: IBuildTaskItemJSON = taskMap[key];
        const taskBuildPath = Utils.Path.resolveToRaw(task.options.buildPath);
        if (!buildPathDict[taskBuildPath]) {
            buildPathDict[taskBuildPath] = [];
        }
        buildPathDict[taskBuildPath].push(task.options.outputName);
    }
    return buildPathDict;
}

// 判断输出路径是否与 taskMap 中的路径冲突
export function checkConflict(buildPath: string, outputName: string, buildPathDict: Record<string, string[]>) {
    // 同 buildPath 下 outputName 是否重复
    const outputNames = buildPathDict[buildPath] || [];
    for (const name of outputNames) {
        if (outputName === name) {
            return true;
        }
    }
    return false;
}

// 生成新的输出目录名称
export function generateNewOutputName(buildPath: string, platform: string, buildPathDict: Record<string, string[]>) {
    // 获取同 buildPath 下 platform 输出目录的最高序号
    const outputNames = buildPathDict[buildPath] || [];
    let maxIndex = 0;
    for (const name of outputNames) {
        if (name.startsWith(platform + '-')) {
            const index = parseInt(name.substring(platform.length + 1), 10);
            if (!isNaN(index) && index > maxIndex) {
                maxIndex = index;
            }
        }
    }
    // 生成新的输出目录名
    const newIndex = (maxIndex + 1).toString().padStart(3, '0');
    return `${platform}-${newIndex}`;
}

/**
 * 检查路径是否无效
 * @param path 
 * @returns 
 */
export function checkBuildPathIsInvalid(path: string) {
    if (!path) {
        return true;
    }
    if (path.startsWith('project://')) {
        const matchInfo = path.match(/^([a-zA-z]*):\/\/(.*)$/);
        if (matchInfo) {
            const relPath = matchInfo[2].replace(/\\/g, '/');
            // 超出项目外的相对路径以及 project:// 下为绝对路径的地址无效
            if (isAbsolute(relPath) || relPath.includes('../') || relPath.startsWith('/')) {
                return true;
            }
        }
    } else {
        if (!isAbsolute(path)) {
            return true;
        }
    }
    return false;
}

/**
  * 校验传入的引擎模块信息
  * @param value[]
  * @returns 校验结果
  */
function checkIncludeModules(modules: string[]): boolean | string {
    if (!Array.isArray(modules)) {
        return ` includeModules(${modules}) should be an array!`;
    }
    // TODO 校验是否包含一些引擎的必须模块
    return true;
}

Validator.addRule('supportPlatform', {
    func: supportPlatform,
    message: 'i18n:builder.error.unknown_platform',
});

export const commonOptionConfigs: Record<string, IConfigItem> = {
    platform: {
        label: 'i18n:builder.options.platform',
        default: 'web-desktop',
        verifyRules: ['required', 'supportPlatform'],
    },
    name: {
        label: 'i18n:builder.options.name',
        render: {
            ui: 'ui-input',
            attributes: {
                placeholder: 'i18n:builder.tips.enter_name',
            },
        },
        default: basename(BuildGlobalInfo.projectRoot),
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
        itemConfigs: {
            asyncFunctions: {
                label: 'i18n:builder.options.async_functions',
                description: 'i18n:builder.options.async_functions_tips',
                render: {
                    ui: 'ui-checkbox',
                },
            },
            coreJs: {
                label: 'i18n:builder.options.core_js',
                description: 'i18n:builder.options.core_js_tips',
                render: {
                    ui: 'ui-checkbox',
                },
            },
        },
    },
    buildScriptTargets: {
        label: 'i18n:builder.options.buildScriptTargets',
        description: 'i18n:builder.options.buildScriptTargetsTips',
        hidden: true,
        render: {
            ui: 'ui-input',
            attributes: {
                placeholder: i18n.t('builder.example', {
                    example: '> 0.4%',
                }),
            },
        },
    },
    server: {
        label: 'i18n:builder.options.remote_server_address',
        description: 'i18n:builder.options.remote_server_address_tips',
        default: '',
        render: {
            ui: 'ui-input',
            attributes: {
                placeholder: 'https://resources',
            },
        },
        verifyRules: ['http'],
    },
    sourceMaps: {
        label: 'i18n:builder.options.sourceMap',
        default: 'false',
        description: 'i18n:builder.options.sourceMapTips',
        render: {
            ui: 'ui-select-pro',
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
    },
    experimentalEraseModules: {
        label: 'i18n:builder.options.experimental_erase_modules',
        description: 'i18n:builder.options.experimental_erase_modules_tips',
        default: false,
        experiment: true,
        render: {
            ui: 'ui-checkbox',
        },
    },
    startSceneAssetBundle: {
        label: 'i18n:builder.options.start_scene_asset_bundle',
        description: 'i18n:builder.options.start_scene_asset_bundle_tips',
        default: false,
        hidden: true,
        render: {
            ui: 'ui-checkbox',
        },
    },
    bundleConfigs: {
        label: 'i18n:builder.options.includeBundles',
        default: [],
        verifyLevel: 'warn',
    },
    // 之前 ios-app-clip 有隐藏 buildPath 的需求
    buildPath: {
        label: 'i18n:builder.options.build_path',
        description: 'i18n:builder.tips.build_path',
        default: 'project://build',
        verifyRules: ['required'],
    },
    debug: {
        label: 'i18n:builder.options.debug',
        description: 'i18n:builder.options.debugTips',
        default: false,
        render: {
            ui: 'ui-checkbox',
        },
    },
    mangleProperties: {
        label: 'i18n:builder.options.mangleProperties',
        description: 'i18n:builder.options.manglePropertiesTip',
        default: false,
        render: {
            ui: 'ui-checkbox',
        },
    },
    inlineEnum: {
        label: 'i18n:builder.options.inlineEnum',
        description: 'i18n:builder.options.inlineEnumTip',
        default: true,
        render: {
            ui: 'ui-checkbox',
        },
    },
    md5Cache: {
        label: 'i18n:builder.options.md5_cache',
        description: 'i18n:builder.options.md5CacheTips',
        default: false,
        render: {
            ui: 'ui-checkbox',
        },
    },
    md5CacheOptions: {
        default: {
            excludes: [],
            includes: [],
            replaceOnly: [],
            handleTemplateMd5Link: true,
        },
    },
    mainBundleIsRemote: {
        label: 'i18n:builder.options.main_bundle_is_remote',
        description: 'i18n:builder.asset_bundle.remote_bundle_invalid_tooltip',
        default: false,
        render: {
            ui: 'ui-checkbox',
        },
    },
    mainBundleCompressionType: {
        label: 'i18n:builder.options.main_bundle_compression_type',
        description: 'i18n:builder.asset_bundle.compression_type_tooltip',
        default: 'merge_dep',
    },
    useSplashScreen: {
        label: 'i18n:builder.use_splash_screen',
        default: true,
        render: {
            ui: 'ui-checkbox',
        },
    },
    bundleCommonChunk: {
        label: 'i18n:builder.bundleCommonChunk',
        description: 'i18n:builder.bundleCommonChunkTips',
        default: false,
        render: {
            ui: 'ui-checkbox',
        },
    },
    skipCompressTexture: {
        label: 'i18n:builder.options.skip_compress_texture',
        default: false,
        render: {
            ui: 'ui-checkbox',
        },
    },
    packAutoAtlas: {
        label: 'i18n:builder.options.pack_autoAtlas',
        default: true,
    },
    startScene: {
        label: 'i18n:builder.options.start_scene',
        description: 'i18n:builder.options.startSceneTips',
        default: '',
    },
    outputName: {
        // 这个数据界面不显示，不需要 i18n
        description: '构建的输出目录名，将会作为后续构建任务上的名称',
        default: '',
        verifyRules: ['required', 'normalName'],
    },
    taskName: {
        default: '',
        verifyRules: ['required'],
    },
    scenes: {
        label: 'i18n:builder.options.scenes',
        description: 'i18n:builder.tips.build_scenes',
        default: [],
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
    },
    nativeCodeBundleMode: {
        default: 'asmjs',
    },
    wasmCompressionMode: {
        hidden: true,
        default: false,
    },
    binGroupConfig: {
        default: {
            threshold: 16,
            enable: false,
        },
        label: 'i18n:builder.options.bin_group_config',
        itemConfigs: {
            enable: {
                label: 'i18n:builder.options.enable_cconb_group',
                description: 'i18n:builder.options.enable_cconb_group_tips',
                render: {
                    ui: 'ui-checkbox',
                },
            },
        },
    },
};

// export async function getCommonOptions(platform: Platform, useDefault = false) {
//     const commonConfig = await builderConfig.getProject<IBuildCommonOptions>('common', useDefault ? 'default' : 'project');
//     const result: IBuildTaskOption<Platform> = JSON.parse(JSON.stringify(commonConfig));
//     if (!useDefault) {
//         const platformCustomCommonOptions = await builderConfig.getProject<IBuildCommonOptions>(`platforms.${platform}`);
//         if (platformCustomCommonOptions) {
//             Object.keys(platformCustomCommonOptions).forEach((key) => {
//                 if (platformCustomCommonOptions[key as keyof IBuildCommonOptions] !== undefined) {
//                     // @ts-ignore
//                     result[key] = platformCustomCommonOptions[key as keyof IBuildCommonOptions];
//                 }
//             });
//         }
//     }
//     // 场景信息不使用用户修改过的数据，这部分信息和资源相关联数据经常会变化，不存储使用
//     result.scenes = await getDefaultScenes();
//     if (!(await checkStartScene(result.startScene))) {
//         result.startScene = await getDefaultStartScene();
//     }
//     if (!result.startScene) {
//         console.error(i18n.t('builder.error.invalidStartScene'));
//     }
//     result.platform = platform;
//     return result;
// }

export function getDefaultScenes(): IInternalBuildSceneItem[] {
    const scenes = assetManager.queryAssets({ ccType: 'cc.SceneAsset', pattern: '!db://internal/default_file_content/**/*' });
    if (!scenes) {
        return [];
    }
    const directory = assetManager.queryAssets({ isBundle: true });
    return scenes.map((asset) => {
        return {
            url: asset.url,
            uuid: asset.uuid,
            bundle: directory.find((dir) => asset.url.startsWith(dir.url + '/'))?.url || '',
        };
    });
}

export async function getDefaultStartScene() {
    const scenes = await getDefaultScenes();
    const realScenes = scenes.filter((item: any) => !item.bundle);
    return realScenes[0] && realScenes[0].uuid;
}

export async function checkBuildCommonOptionsByKey(key: string, value: any, options: IBuildTaskOption): Promise<BuildCheckResult | null> {
    const res: BuildCheckResult = {
        error: '',
        newValue: value,
        level: 'error',
    };
    switch (key) {
        case 'scenes':
            {
                const error = await checkScenes(value) || false;
                if (error instanceof Error) {
                    res.error = error.message;
                    res.newValue = await getDefaultScenes();
                }
                return res;
            }
        case 'startScene':
            {
                const valid = await checkStartScene(value) || false;
                if (!valid) {
                    res.error = 'i18n:builder.error.invalidStartScene';
                }

                if (res.error) {
                    res.newValue = await getDefaultStartScene();
                }
                return res;
            }
        case 'platform':
            if (!PLATFORMS.includes(value)) {
                res.error = 'InValid platform!';
                res.newValue = null;
            }
            break;
        case 'mainBundleIsRemote':
            if (value && options.mainBundleCompressionType === BundleCompressionTypes.SUBPACKAGE) {
                res.newValue = false;
                res.error = ' bundle can not be remote when compression type is subpackage!';
            } else if (!value && options.mainBundleCompressionType === BundleCompressionTypes.ZIP) {
                res.newValue = true;
                res.error = ' bundle must be remote when compression type is zip!';
            }
            return res;
        case 'outputName':
            if (!value) {
                res.error = ' outputName can not be empty';
                res.newValue = await calcValidOutputName(options.buildPath, options.platform, options.platform);
            } else {
                // HACK 原生平台不支持中文和特殊符号
                if (NATIVE_PLATFORM.includes(options.platform) && checkIncludeChineseAndSymbol(value)) {
                    res.error = 'i18n:builder.error.buildPathContainsChineseAndSymbol';
                }
            }
            break;
        case 'taskName':
            if (!value) {
                res.error = ' taskName can not be empty';
                res.newValue = options.outputName;
            }
            break;
        case 'buildPath':
            if (!value || value === 'project://') {
                res.error = ' buildPath can not be empty';
                res.newValue = 'project://build';
            } else if (checkBuildPathIsInvalid(value)) {
                res.error = 'buildPath is invalid!';
                res.newValue = 'project://build';
            } else {
                // 添加对旧版本相对路径的转换支持
                if (typeof value === 'string' && value.startsWith('.')) {
                    value = 'project://' + value;
                }
                if (!value || !isAbsolute(Utils.Path.resolveToRaw(value))) {
                    res.error = `buildPath(${value}) is invalid!`;
                    res.newValue = 'project://build';
                }
                // hack 原生平台不支持中文和特殊符号
                if (NATIVE_PLATFORM.includes(options.platform) && checkIncludeChineseAndSymbol(value)) {
                    res.error = 'i18n:builder.error.buildPathContainsChineseAndSymbol';
                }
            }
            break;
        case 'md5Cache':
        case 'debug':
        case 'useSplashScreen':
        case 'mergeStartScene':
        case 'experimentalEraseModules':
        case 'sourceMaps':
            if (value === 'true') {
                res.newValue = true;
            } else if (value === 'false') {
                res.newValue = false;
            }
            break;
        case 'server':
            {
                res.error = await validatorManager.check(
                    value,
                    commonOptionConfigs.server.verifyRules || [],
                    options,
                    options.platform + options.platform,
                );
            }
            break;
        default:
            return null;
    }
    return res;
}

function checkIncludeChineseAndSymbol(value: string) {
    return /[`~!#$%^&*+=<>?'{}|,;'·~！#￥%……&*（）+={}|《》？：“”【】、；‘'，。、@\u4e00-\u9fa5]/im.test(value);
}

export async function checkBuildCommonOptions(options: any) {
    const commonOptions = getBuildCommonOptions();
    const checkResMap: Record<string, BuildCheckResult> = {};
    // const checkKeys = Array.from(new Set(Object.keys(commonOptions).concat(Object.keys(options))))
    // 正常来说应该检查默认值和 options 整合的 key
    for (const key of Object.keys(commonOptions)) {
        checkResMap[key] = await checkBuildCommonOptionsByKey(key, options[key], options) || { newValue: options[key], error: '', level: 'error' };
    }
    return checkResMap;
}

export function checkBundleCompressionSetting(value: BundleCompressionType, supportedCompressionTypes: BundleCompressionType[]) {
    const result = {
        error: '',
        newValue: value,
    };
    if (supportedCompressionTypes && -1 === supportedCompressionTypes.indexOf(value)) {
        result.newValue = BundleCompressionTypes.MERGE_DEP;
        result.error = ` compression type(${value}) is invalid for this platform!`;
    }
    return result;
}
/**
 * 整合构建配置的引擎模块配置
 * 规则：
 *   字段值为布尔值，则当前值作为此模块的开关
 *   字段值为字符串，则根据 overwriteModuleConfig 配置值进行剔除替换
 * @param options 
 */
export function handleOverwriteProjectSettings(options: IBuildTaskOption) {
    const overwriteModules = options.overwriteProjectSettings?.includeModules;
    let includeModules = options.includeModules;
    if (includeModules && overwriteModules && includeModules.length) {
        for (const module in overwriteModules) {
            if (overwriteModules[module] !== 'inherit-project-setting') {
                switch (overwriteModules[module]) {
                    case 'on':
                        includeModules.push(module);
                        break;
                    case 'off':
                        includeModules = includeModules.filter((engineModule) => engineModule !== module);
                        break;
                    default:
                        if (overwriteModuleConfig[module]) {
                            const overwriteModuleIndex = includeModules.findIndex(overwriteModuleConfig[module].match);
                            if (overwriteModuleIndex === -1) {
                                // 未开启模块时，替换无效
                                return;
                            }
                            includeModules.splice(overwriteModuleIndex, 1, overwriteModules[module] as string);
                        } else {
                            console.warn('Invalid overwrite config of engine');
                        }
                }
            }
        }
        options.includeModules = Array.from(new Set(includeModules));
    }
}

export async function checkProjectSetting(options: IInternalBuildOptions | IInternalBundleBuildOptions) {
    const { designResolution, renderPipeline, physicsConfig, customLayers, sortingLayers, macroConfig, includeModules } = engine.getConfig();
    // 默认 Canvas 设置
    if (!options.designResolution) {
        options.designResolution = designResolution;
    }

    // renderPipeline
    if (!options.renderPipeline) {
        if (renderPipeline) {
            options.renderPipeline = renderPipeline;
        }
    }

    // physicsConfig
    if (!options.physicsConfig) {
        options.physicsConfig = physicsConfig;
        if (!options.physicsConfig.defaultMaterial) {
            options.physicsConfig.defaultMaterial = 'ba21476f-2866-4f81-9c4d-6e359316e448';
        }
    }

    // customLayers
    if (!options.customLayers) {
        options.customLayers = customLayers;
    }

    // sortingLayers
    if (!options.sortingLayers) {
        if (sortingLayers) {
            options.sortingLayers = sortingLayers;
        }
    }

    // macro 配置
    if (!options.macroConfig) {
        if (macroConfig) {
            options.macroConfig = macroConfig;
        }
    }

    if (!options.includeModules || !options.includeModules.length) {
        options.includeModules = includeModules;
    }

    if (!options.flags) {
        options.flags = {
            LOAD_BULLET_MANUALLY: false,
            LOAD_SPINE_MANUALLY: false,
        };
    }

}