'use strict';

import { CocosParams, ICustomBuildScriptParam } from '../../@types/platforms/native';
import { IBuildResult, ITaskOptionPackages } from '../../@types/platforms/windows';
import { BuilderAssetCache, IInternalBuildOptions } from '../../@types/protected';
import { executableNameOrDefault } from './utils';
export interface ITaskOption extends IInternalBuildOptions<'windows'> {
    packages: ITaskOptionPackages;
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<any>;
}
export async function onAfterInit(options: ITaskOption, result: IBuildResult, cache: BuilderAssetCache) {
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

export async function onAfterBundleInit(options: IInternalBuildOptions<'windows'>) {
    const renderBackEnd = options.packages.windows.renderBackEnd;

    options.assetSerializeOptions!['cc.EffectAsset'].glsl1 = renderBackEnd.gles2 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl3 = renderBackEnd.gles3 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl4 = renderBackEnd.vulkan ?? true;
    const netMode = Number(options.packages.windows.netMode);
    options.buildScriptParam.flags.NET_MODE = (isNaN(netMode) || netMode > 2 || netMode < 0) ? 0 : netMode;
    options.buildScriptParam.flags.SERVER_MODE = !!options.packages.windows.serverMode;
}
