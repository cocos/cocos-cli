'use strict';

import { ICustomBuildScriptParam } from '../native-common/type';
import { IBuildResult, ITaskOptionPackages } from './type';
import { BuilderAssetCache, IBuilder, IInternalBuildOptions } from '../../@types/protected';
import { executableNameOrDefault } from './utils';
import * as nativeCommonHook from '../native-common/hooks';
import { CocosParams } from '../native-common/pack-tool/base/default';

export interface ITaskOption extends IInternalBuildOptions<'windows'> {
    packages: ITaskOptionPackages;
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<any>;
}
export const onBeforeBuild = nativeCommonHook.onBeforeBuild;
export const onAfterBundleDataTask = nativeCommonHook.onAfterBundleDataTask;
export const onAfterCompressSettings = nativeCommonHook.onAfterCompressSettings;
export const onAfterBuild = nativeCommonHook.onAfterBuild;
export const onBeforeMake = nativeCommonHook.onBeforeMake;
export const make = nativeCommonHook.make;
export const run = nativeCommonHook.run;

export async function onAfterInit(this: IBuilder, options: ITaskOption, result: IBuildResult, cache: BuilderAssetCache) {
    await nativeCommonHook.onAfterInit.call(this, options, result);
    const renderBackEnd = options.packages.windows.renderBackEnd;
    // 补充一些平台必须的参数
    const params = options.cocosParams;
    params.platformParams.targetPlatform = 'x64';
    params.platformParams.vsVersion = options.packages.windows.vsData || '';
    // TODO 仅部分平台支持的选项，需要放在平台插件里自行注册
    params.cMakeConfig.USE_SERVER_MODE = `set(USE_SERVER_MODE ${options.packages.windows.serverMode ? 'ON' : 'OFF'})`;
    const netMode = Number(options.packages.windows.netMode);
    params.cMakeConfig.NET_MODE = `set(NET_MODE ${(isNaN(netMode) || netMode > 2 || netMode < 0) ? 0 : netMode})`;
    // @ts-ignore
    options.buildScriptParam.flags.NET_MODE = (isNaN(netMode) || netMode > 2 || netMode < 0) ? 0 : netMode;
    params.cMakeConfig.NET_MODE = `set(NET_MODE ${(isNaN(netMode) || netMode > 2 || netMode < 0) ? 0 : netMode})`;
    params.executableName = executableNameOrDefault(params.projectName, options.packages.windows.executableName);
    if (params.executableName === 'CocosGame') {
        console.warn(`The provided project name "${params.projectName}" is not suitable for use as an executable name. 'CocosGame' is applied instead.`);
    }
    params.cMakeConfig.CC_EXECUTABLE_NAME = `set(CC_EXECUTABLE_NAME "${params.executableName}")`;

    if (renderBackEnd) {
        Object.keys(renderBackEnd).forEach((backend) => {
            // @ts-ignore
            params.cMakeConfig[`CC_USE_${backend.toUpperCase()}`] = renderBackEnd[backend];
        });
    }
}

export async function onAfterBundleInit(options: ITaskOption) {
    await nativeCommonHook.onAfterBundleInit(options);
    const renderBackEnd = options.packages.windows.renderBackEnd;

    options.assetSerializeOptions!['cc.EffectAsset'].glsl1 = renderBackEnd.gles2 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl3 = renderBackEnd.gles3 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl4 = renderBackEnd.vulkan ?? true;
    const netMode = Number(options.packages.windows.netMode);
    options.buildScriptParam.flags.NET_MODE = (isNaN(netMode) || netMode > 2 || netMode < 0) ? 0 : netMode;
    options.buildScriptParam.flags.SERVER_MODE = !!options.packages.windows.serverMode;
}
