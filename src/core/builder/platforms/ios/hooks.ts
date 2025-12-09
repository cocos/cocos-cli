'use strict';

import { IBuildResult, IIOSInternalBuildOptions } from './type';
import { BuilderCache, IBuilder, InternalBuildResult, ISettingsDesignResolution } from '../../@types/protected';
import * as nativeCommonHook from '../native-common/hooks';
import { executableNameOrDefault } from './utils';
import { ResolutionPolicy } from 'cc';
import { copyFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureDirSync } from 'fs-extra';
import { ISplashSetting } from '../../../engine/@types/public';

export const throwError = true;
export const onBeforeBuild = nativeCommonHook.onBeforeBuild;
export const onAfterBundleDataTask = nativeCommonHook.onAfterBundleDataTask;
export const onAfterCompressSettings = nativeCommonHook.onAfterCompressSettings;
export const onBeforeMake = nativeCommonHook.onBeforeMake;
export const make = nativeCommonHook.make;
export const run = nativeCommonHook.run;


/**
 * 在开始构建之前构建出 native 项目
 * @param options
 * @param cache
 */
export async function onAfterInit(this: IBuilder, options: IIOSInternalBuildOptions, result: IBuildResult, cache: BuilderCache) {
    await nativeCommonHook.onAfterInit.call(this, options, result);
    // const output = join(result.paths.dir, '..');
    const renderBackEnd = options.packages.ios.renderBackEnd = {
        gles2: false,
        gles3: false,
        metal: true,
    };

    // 补充一些平台必须的参数
    const params = options.cocosParams;
    Object.keys(renderBackEnd).forEach((backend) => {
        // @ts-ignore
        params.cMakeConfig[`CC_USE_${backend.toUpperCase()}`] = renderBackEnd[backend];
    });
    const pkgOptions = options.packages.ios;
    params.platformParams.orientation = options.packages.ios.orientation;
    params.platformParams.bundleId = options.packages.ios.packageName;
    params.cMakeConfig.MACOSX_BUNDLE_GUI_IDENTIFIER = `set(MACOSX_BUNDLE_GUI_IDENTIFIER ${(params as any).packageName})`;
    if (pkgOptions.developerTeam) {
        // 面板上通过 value_hash 作为标识，这里需要取出 value
        const developerTeam = pkgOptions.developerTeam.split('_')[0];
        params.cMakeConfig.DEVELOPMENT_TEAM = `set(DEVELOPMENT_TEAM ${developerTeam})`;
        params.platformParams.teamid = developerTeam;
    }
    params.cMakeConfig.TARGET_IOS_VERSION = `set(TARGET_IOS_VERSION ${pkgOptions.targetVersion || '12.0'})`;
    params.cMakeConfig.USE_PORTRAIT = !!pkgOptions.orientation.portrait;
    params.cMakeConfig.CUSTOM_COPY_RESOURCE_HOOK = pkgOptions.skipUpdateXcodeProject;
    params.platformParams.skipUpdateXcodeProject = pkgOptions.skipUpdateXcodeProject;
    params.executableName = executableNameOrDefault(params.projectName, options.packages.ios.executableName);
    if (params.executableName === 'CocosGame') {
        console.warn(`The provided project name "${params.projectName}" is not suitable for use as an executable name. 'CocosGame' is applied instead.`);
    }
    params.cMakeConfig.CC_EXECUTABLE_NAME = `set(CC_EXECUTABLE_NAME "${params.executableName}")`;

    if (pkgOptions.osTarget) {
        pkgOptions.osTarget.simulator !== undefined && (params.platformParams.simulator = pkgOptions.osTarget.simulator);
        pkgOptions.osTarget.iphoneos !== undefined && (params.platformParams.iphoneos = pkgOptions.osTarget.iphoneos);
    }
}

export async function onAfterBundleInit(options: IIOSInternalBuildOptions) {
    await nativeCommonHook.onAfterBundleInit(options);
    const renderBackEnd = options.packages.ios.renderBackEnd = {
        gles2: false,
        gles3: false,
        metal: true,
    };
    options.assetSerializeOptions!['cc.EffectAsset'].glsl1 = renderBackEnd.gles2 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl3 = renderBackEnd.gles3 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl4 = renderBackEnd.metal ?? true;
}

export async function onAfterBuildAssets(options: IIOSInternalBuildOptions, result: InternalBuildResult, cache: BuilderCache) {
    // 380 防止构建过程中修改启用插屏，问卷校验失败
    if (!options.useSplashScreen) {
        options.useSplashScreen = true;
    }
}

export async function onBeforeCompressSettings(options: IIOSInternalBuildOptions, result: InternalBuildResult, cache: BuilderCache) {
    // 校验完插屏后，压缩 settings 前，关闭 iOS 平台插屏
    result.settings.splashScreen && (result.settings.splashScreen.totalTime = 0);
}

export async function onAfterBuild(this: IBuilder, options: IIOSInternalBuildOptions, result: InternalBuildResult) {
    await nativeCommonHook.onAfterBuild.call(this, options, result);
    // generate 之后 make 之前，生成插屏图片，暂时屏蔽
 //   await buildSplash(options, result);
}

async function buildSplash(options: IIOSInternalBuildOptions, result: InternalBuildResult) {
    const splashScreenSettings = result.settings.splashScreen;
    if (splashScreenSettings && splashScreenSettings.logo && splashScreenSettings.background) {
        const destDir = join(options.packages.ios.projectDistPath, 'native/engine/ios');
        ensureDirSync(destDir);
        const imageOptions = [{
            width: 1242,
            height: 2208,
            outputPath: join(destDir, 'LaunchScreenBackgroundPortrait.png'),
        }, {
            width: 2208,
            height: 1242,
            outputPath: join(destDir, 'LaunchScreenBackgroundLandscape.png'),
        }];

        try {
            // 生成横竖屏图
            for (const option of imageOptions) {
                await generateSplashPicture(option, splashScreenSettings, result.settings.screen.designResolution);
            }
            // 引擎会优先读取目标图，所以还要拷贝一张目标图
            const baseImg = options.packages.ios.orientation.portrait ? join(destDir, 'LaunchScreenBackgroundPortrait.png') : join(destDir, 'LaunchScreenBackgroundLandscape.png');
            copyFileSync(baseImg, join(destDir, 'LaunchScreenBackground.png'));
            console.debug('Generate splash to:', join(destDir, 'LaunchScreenBackgroundPortrait.png'));
        } catch (error) {
            console.warn('Failed to generate splash:', error);
        }
    }
}

async function generateSplashPicture(option: { width: number; height: number; outputPath: string }, splashSettings: ISplashSetting, designResolution: ISettingsDesignResolution) {
    // 新建画布
    const canvas = document.createElement('canvas');
    canvas.width = option.width;
    canvas.height = option.height;
    // 将图片画到画布上
    const context = canvas.getContext('2d')!;

    if (splashSettings.background?.type === 'custom' && splashSettings.background.base64) {
        const policy = designResolution.policy;

        // 绘制自定义图片背景
        const bgImage = new Image();
        bgImage.src = splashSettings.background.base64;
        await loadImage(bgImage);
        // 背景图填充满，背景图根据画布宽高等比例缩放后，以背景图中心展示，超出四周的裁剪
        const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
        let width;
        let height;
        if (policy === ResolutionPolicy.FIXED_HEIGHT) {
            width = bgImage.width * canvas.height / bgImage.height;
            height = canvas.height;
        } else if (policy === ResolutionPolicy.FIXED_WIDTH) {
            width = canvas.width;
            height = bgImage.height * canvas.width / bgImage.width;
        } else if (policy === ResolutionPolicy.SHOW_ALL) {
            if ((bgImage.width / bgImage.height) > (canvas.width / canvas.height)) {
                width = canvas.width;
                height = bgImage.height * canvas.width / bgImage.width;
            } else {
                width = bgImage.width * canvas.height / bgImage.height;
                height = canvas.height;
            }
        } else if (policy === ResolutionPolicy.NO_BORDER) {
            if ((bgImage.width / bgImage.height) > (canvas.width / canvas.height)) {
                width = bgImage.width * canvas.height / bgImage.height;
                height = canvas.height;
            } else {
                width = canvas.width;
                height = bgImage.height * canvas.width / bgImage.width;
            }
        } else {
            width = canvas.width;
            height = canvas.height;
        }

        const offsetX = (canvas.width - width) / 2;
        const offsetY = (canvas.height - height) / 2;
        context.beginPath();
        context.rect(offsetX, offsetY, width, height);
        context.closePath();
        context.clip();
        context.drawImage(bgImage, offsetX, offsetY, width, height);
    } else if (splashSettings.background?.type === 'color' && splashSettings.background.color) {
        // 绘制自定义颜色背景
        const color = splashSettings.background.color;
        context.fillStyle = `rgba(${color.x * 255}, ${color.y * 255}, ${color.z * 255}, ${color.w * 255})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        // 绘制默认 #04090A 背景
        context.fillStyle = 'rgba(4, 9, 10, 1)';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    if ((splashSettings.logo?.type === 'custom' || splashSettings.logo?.type === 'default') && splashSettings.logo.base64) {
        // 绘制自定义 logo 图片
        const logoImage = new Image();
        logoImage.src = splashSettings.logo.base64;
        await loadImage(logoImage);
        const logoAspectRatio = logoImage.height / logoImage.width;
        const logoHeightPercentage = 0.185; // 如果设置的是 100%，logo的高度固定占预览区域的 18.5%
        const logoAreaHeightPercentage = 5 / 6; // logo 区域高度占设备高度的 5 / 6
        const logoHeight = canvas.height * logoHeightPercentage * splashSettings.displayRatio;
        const logoWidth = logoHeight / logoAspectRatio;
        const logoX = (canvas.width - logoWidth) / 2;
        let logoY = (canvas.height * logoAreaHeightPercentage - logoHeight) / 2;
        if (logoHeight > canvas.height * logoAreaHeightPercentage) {
            logoY = (canvas.height - logoHeight) / 2;
        }
        context.drawImage(logoImage, logoX, logoY, logoWidth, logoHeight);

        // 绘制水印
        if (splashSettings.logo.type === 'default') {
            context.font = `400 36px Arial`;
            context.textBaseline = 'top';
            context.textAlign = 'center';
            context.fillStyle = 'rgba(250, 250, 250, 0.4)';
            context.lineWidth = 2;
            context.strokeStyle = 'rgba(5, 5, 5, 0.3)';
            context.strokeText('Created with Cocos', canvas.width / 2, logoY + logoHeight + 48);
            context.fillText('Created with Cocos', canvas.width / 2, logoY + logoHeight + 48);
        }
    }

    // 将画布转换为 base64
    const mergedImage = canvas.toDataURL('image/png');
    // 将 base64 转为二进制
    const binaryData = atob(mergedImage.split(',')[1]);
    // 写入到本地文件
    writeFileSync(option.outputPath, binaryData, 'binary');
    console.log('Generate splash to:', option.outputPath);

    function loadImage(image: HTMLImageElement) {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            if (image.complete) {
                resolve(image);
            } else {
                image.addEventListener('load', () => {
                    resolve(image);
                });
                image.addEventListener('error', error => {
                    reject(error);
                });
            }
        });
    }
}
