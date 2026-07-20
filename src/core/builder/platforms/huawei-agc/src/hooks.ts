'use strict';

import { join } from 'path';
import { BuilderCache, IBuilder } from '../../../@types/protected';
import { IAndroidInternalBuildOptions } from '../../android/src/type';
import { checkAndroidAPILevels, generateAndroidOptions } from '../../android/src/utils';
import * as nativeCommonHook from '../../native-common/hooks';
import { GlobalPaths } from '../../../../../global';
import { IBuildResult, IHuaweiAgcInternalBuildOptions, IOptions } from './type';
import { getAgconnectConfigPath, importAgconnectConfig } from './utils';

export const throwError = true;
export const onAfterBundleDataTask = nativeCommonHook.onAfterBundleDataTask;
export const onBeforeMake = nativeCommonHook.onBeforeMake;
export const make = nativeCommonHook.make;
export const run = nativeCommonHook.run;

function asAndroidOptions(options: IHuaweiAgcInternalBuildOptions): IAndroidInternalBuildOptions {
    return {
        ...options,
        platform: 'android',
        packages: {
            ...options.packages,
            android: options.packages['huawei-agc'],
        },
    } as unknown as IAndroidInternalBuildOptions;
}

export async function onBeforeBuild(this: IBuilder, options: IHuaweiAgcInternalBuildOptions, result: IBuildResult): Promise<void> {
    if (options.polyfills) {
        options.polyfills.asyncFunctions = false;
    }

    const agc = options.packages['huawei-agc'];
    const projectPath = result.paths.projectRoot;
    const configuredPath = agc.serviceConfigPath || getAgconnectConfigPath(projectPath);
    const config = await importAgconnectConfig(configuredPath, projectPath);
    if (!config.path) {
        throw new Error('agconnect-services.json file is required for Huawei AGC builds.');
    }

    if (config.packageName) {
        agc.packageName = config.packageName;
    }
    await nativeCommonHook.onBeforeBuild(options);
}

export async function onAfterInit(this: IBuilder, options: IHuaweiAgcInternalBuildOptions, result: IBuildResult, _cache: BuilderCache): Promise<void> {
    await nativeCommonHook.onAfterInit.call(this, options, result);

    const androidOptions = asAndroidOptions(options);
    const agc = await generateAndroidOptions(androidOptions) as IOptions;
    options.packages['huawei-agc'] = agc;

    const apiLevelResult = await checkAndroidAPILevels(agc.apiLevel, androidOptions);
    if (!apiLevelResult.valid && typeof apiLevelResult.fixedValue === 'number') {
        agc.apiLevel = apiLevelResult.fixedValue;
    }

    if (agc.useDebugKeystore) {
        agc.keystorePath = join(GlobalPaths.staticDir, 'tools/keystore/debug.keystore');
        agc.keystoreAlias = 'debug_keystore';
        agc.keystorePassword = '123456';
        agc.keystoreAliasPassword = '123456';
    }

    const params = options.cocosParams;
    Object.assign(params.platformParams, agc);
    if (agc.renderBackEnd) {
        for (const [backend, enabled] of Object.entries(agc.renderBackEnd)) {
            params.cMakeConfig[`CC_USE_${backend.toUpperCase()}`] = enabled;
        }
    }
    params.cMakeConfig.CC_ENABLE_SWAPPY = !!agc.swappy;
    params.cMakeConfig.USE_ADPF = true;
}

export async function onAfterBuild(this: IBuilder, options: IHuaweiAgcInternalBuildOptions, result: IBuildResult, cache: BuilderCache): Promise<void> {
    await nativeCommonHook.onAfterBuild.call(this, options, result);
}

export async function onAfterBundleInit(options: IHuaweiAgcInternalBuildOptions): Promise<void> {
    await nativeCommonHook.onAfterBundleInit(options);
    const renderBackEnd = options.packages['huawei-agc'].renderBackEnd || {};
    options.assetSerializeOptions!['cc.EffectAsset'].glsl1 = renderBackEnd.gles2 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl3 = renderBackEnd.gles3 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl4 = renderBackEnd.vulkan ?? true;
}
