'use strict';

import { readFileSync } from 'fs-extra';
import { isEqual } from 'lodash';
import { join } from 'path';
import i18n from '../../../../../../base/i18n';
import { ISettings, IPhysicsConfig } from '../../../../../@types';
import { IInternalBuildOptions } from '../../../../../@types/protected';
import utils from '../../../../../../base/utils';
import { Engine } from '../../../../../../engine';
import { configurationManager } from '../../../../../../configuration';
import { ISplashSetting } from '../../../../../../engine/@types/config';
import { GlobalPaths } from '../../../../../../../global';

const layerMask: number[] = [];
for (let i = 0; i <= 19; i++) {
    layerMask[i] = 1 << i;
}

/**
 * 根据构建选项补充 settings 数据
 * @param options 
 * @param settings 
 */
export async function patchOptionsToSettings(options: IInternalBuildOptions, settings: ISettings) {
    settings.launch.launchScene = options.startScene;
    settings.engine.debug = options.debug;
    settings.screen.designResolution = options.resolution;
    settings.engine.platform = options.platform || settings.engine.platform;
    settings.assets.server = options.server || '';
    settings.CocosEngine = Engine.getInfo().version;
    settings.engine.customLayers = options.customLayers.map((layer) => {
        const index = layerMask.findIndex((num) => { return layer.value === num; });
        return {
            name: layer.name,
            bit: index,
        };
    });
    settings.engine.customLayers.sort((a, b) => a.bit - b.bit);
    settings.engine.sortingLayers = options.sortingLayers;

    const { renderPipeline: defaultPipeline, splashScreen: defaultSplashScreen } = Engine.getConfig(true);
    settings.rendering.renderPipeline = options.renderPipeline === defaultPipeline ? '' : options.renderPipeline;
    settings.rendering.customPipeline = options.customPipeline;
    const { customJointTextureLayouts, downloadMaxConcurrency, splashScreen } = Engine.getConfig();
    settings.animation.customJointTextureLayouts = customJointTextureLayouts || [];
    if (options.includeModules.includes('custom-pipeline')) {
        settings.rendering.effectSettingsPath = 'src/effect.bin';
    }
    // 自定义插屏写入
    settings.splashScreen = await getSplashSettings(!!options.useSplashScreen, !!options.preview, defaultSplashScreen, splashScreen);
    settings.physics = await getPhysicsConfig(options.includeModules, options.physicsConfig);
    settings.engine.macros = options.macroConfig || {};
    settings.assets.downloadMaxConcurrency = downloadMaxConcurrency;
}

export async function getSplashSettings(useSplashScreen: boolean, preview: boolean, defaultSplashScreen: ISplashSetting, splashScreen: ISplashSetting): Promise<ISplashSetting> {
    if (useSplashScreen !== false || preview) {
        try {
            splashScreen = Object.assign({}, defaultSplashScreen, splashScreen);
            return formatSplashScreen(splashScreen);
        } catch (error) {
            console.error(error);
            console.error(i18n.t('builder.error.missingSplashTips', {
                splashScreen: JSON.stringify(splashScreen),
            }));
            return formatSplashScreen(defaultSplashScreen!);
        }
    } else {
        const defaultSplashSettings = formatSplashScreen(defaultSplashScreen!);
        defaultSplashSettings.totalTime = 0;
        delete defaultSplashSettings.logo;
        delete defaultSplashSettings.background;
        return defaultSplashSettings;
    }
}

export async function getPhysicsConfig(includeModules: string[], physicsConfig: IPhysicsConfig): Promise<IPhysicsConfig> {
    // 添加物理引擎模块标记
    let physicsEngine = '';
    const engineList = ['physics-cannon', 'physics-ammo', 'physics-builtin', 'physics-physx'];
    for (let i = 0; i < engineList.length; i++) {
        if (includeModules.indexOf(engineList[i]) >= 0) {
            physicsEngine = engineList[i];
            break;
        }
    }

    // 不论引擎对物理模块的剔除情况，物理配置都输出
    return Object.assign({ physicsEngine }, physicsConfig);
}

export function formatSplashScreen(splashScreen: ISplashSetting) {
    if (splashScreen.logo) {
        if (splashScreen.logo.type === 'custom') {
            const path = utils.Path.resolveToRaw(splashScreen.logo.image!);
            splashScreen.logo.base64 = `data:image/png;base64,${readFileSync(path).toString('base64')}`;
        } else if (splashScreen.logo.type === 'default') {
            // 先不从 defaultSplashSettings 里获取默认图片
            const defaultLogoPath = join(GlobalPaths.staticDir, 'build-templates/launcher/icon.png');
            splashScreen.logo.base64 = `data:image/png;base64,${readFileSync(defaultLogoPath).toString('base64')}`;
        }
        delete splashScreen.logo.image;
    }
    if (splashScreen.background) {
        if (splashScreen.background.type === 'custom') {
            const path = utils.Path.resolveToRaw(splashScreen.background.image!);
            splashScreen.background.base64 = `data:image/png;base64,${readFileSync(path).toString('base64')}`;
            delete splashScreen.background.color;
        } else if (splashScreen.background.type === 'default') {
            splashScreen.background.color = {
                x: 4 / 255,
                y: 9 / 255,
                z: 10 / 255,
                w: 1 / 255,
            };
        }
        delete splashScreen.background.image;
    }
    return splashScreen;
}
