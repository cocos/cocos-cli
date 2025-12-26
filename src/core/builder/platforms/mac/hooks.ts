'use strict';

import { IBuildResult, IMacInternalBuildOptions } from './type';
import { BuilderCache, IBuilder } from '../../@types/protected';
import * as nativeCommonHook from '../native-common/hooks';
import { executableNameOrDefault } from './utils';

export const throwError = true;
export const onBeforeBuild = nativeCommonHook.onBeforeBuild;
export const onAfterBundleDataTask = nativeCommonHook.onAfterBundleDataTask;
export const onAfterCompressSettings = nativeCommonHook.onAfterCompressSettings;
export const onAfterBuild = nativeCommonHook.onAfterBuild;
export const onBeforeMake = nativeCommonHook.onBeforeMake;
export const make = nativeCommonHook.make;
export const run = nativeCommonHook.run;

export async function onAfterInit(this: IBuilder, options: IMacInternalBuildOptions, result: IBuildResult, cache: BuilderCache) {
    await nativeCommonHook.onAfterInit.call(this, options, result);
    const renderBackEnd = options.packages.mac.renderBackEnd = {
        gles2: false,
        gles3: false,
        metal: true,
    };
    const pkgOptions = options.packages.mac;
    // 补充一些平台必须的参数
    const params = options.cocosParams;
    params.cMakeConfig.TARGET_OSX_VERSION = `set(TARGET_OSX_VERSION ${pkgOptions.targetVersion || '10.14'})`;
    params.cMakeConfig.CUSTOM_COPY_RESOURCE_HOOK = pkgOptions.skipUpdateXcodeProject;
    params.cMakeConfig.MACOSX_BUNDLE_GUI_IDENTIFIER = `set(MACOSX_BUNDLE_GUI_IDENTIFIER ${pkgOptions.packageName})`;
    params.platformParams.skipUpdateXcodeProject = pkgOptions.skipUpdateXcodeProject;
    params.executableName = executableNameOrDefault(params.projectName, options.packages.mac.executableName);
    if (params.executableName === 'CocosGame') {
        console.warn(`The provided project name "${params.projectName}" is not suitable for use as an executable name. 'CocosGame' is applied instead.`);
    }
    params.cMakeConfig.CC_EXECUTABLE_NAME = `set(CC_EXECUTABLE_NAME "${params.executableName}")`;

    params.platformParams.bundleId = pkgOptions.packageName;
    Object.keys(renderBackEnd).forEach((backend) => {
        // @ts-ignore
        params.cMakeConfig[`CC_USE_${backend.toUpperCase()}`] = renderBackEnd[backend];
    });
    // TODO 仅部分平台支持的选项，需要放在平台插件里自行注册
    if (!options.packages.native) {
        options.packages.native = {};
    }
    params.cMakeConfig.USE_SERVER_MODE = `set(USE_SERVER_MODE ${options.packages.native!.serverMode ? 'ON' : 'OFF'})`;
    let netMode = Number(options.packages.native!.netMode);
    netMode = options.packages.native!.netMode = (isNaN(netMode) || netMode > 2 || netMode < 0) ? 0 : netMode;
    params.cMakeConfig.NET_MODE = `set(NET_MODE ${netMode})`;
}

export async function onAfterBundleInit(options: IMacInternalBuildOptions) {
    await nativeCommonHook.onAfterBundleInit(options);
    const renderBackEnd = options.packages.mac.renderBackEnd;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl1 = renderBackEnd.gles2 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl3 = renderBackEnd.gles3 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl4 = renderBackEnd.metal ?? true;
    let netMode = Number(options.packages.native!.netMode);
    netMode = options.packages.native!.netMode = (isNaN(netMode) || netMode > 2 || netMode < 0) ? 0 : netMode;
    options.buildScriptParam.flags.SERVER_MODE = !!options.packages.native.serverMode;
    options.buildScriptParam.flags.NET_MODE = options.packages.native!.netMode;
}
