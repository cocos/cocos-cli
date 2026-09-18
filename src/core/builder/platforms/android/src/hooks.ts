'use strict';

import { join } from 'path';
import { IBuildResult, IAndroidInternalBuildOptions } from './type';
import { BuilderCache, IBuilder } from '../../../@types/protected';
import { generateAndroidOptions, checkAndroidAPILevels } from './utils';
import * as nativeCommonHook from '../../native-common/hooks';
import { GlobalPaths } from '../../../../../global';

export const onBeforeBuild = nativeCommonHook.onBeforeBuild;
export const onAfterBundleDataTask = nativeCommonHook.onAfterBundleDataTask;
export const onAfterCompressSettings = nativeCommonHook.onAfterCompressSettings;
export async function onAfterBuild(this: IBuilder, options: IAndroidInternalBuildOptions, result: IBuildResult, cache: BuilderCache) {
    console.log('[AndroidHooks] onAfterBuild called');
    await nativeCommonHook.onAfterBuild.call(this, options, result);
}
export const onBeforeMake = nativeCommonHook.onBeforeMake;
export const make = nativeCommonHook.make;
export const run = nativeCommonHook.run;

// 后续如果有自定义引擎的情况下需要使用到这个函数。某些 CLI/平台构建入口没有完整走到统一的 checkProjectSetting() 或其他初始化流程，
// 导致 options.engineInfo 没被注入。
function ensureEngineInfo(options: IAndroidInternalBuildOptions): void {
    if (options.engineInfo) {
        return;
    }

    const { Engine } = require(join(__dirname, '../../../../engine/index'));
    options.engineInfo = Engine.getInfo();
}

export async function onAfterInit(this: IBuilder, options: IAndroidInternalBuildOptions, result: IBuildResult, _cache: BuilderCache) {
    ensureEngineInfo(options);
    await nativeCommonHook.onAfterInit.call(this, options, result);

    const android = await generateAndroidOptions(options);
    options.packages.android = android;

    const renderBackEnd = android.renderBackEnd;

    const res = await checkAndroidAPILevels(android.apiLevel, options);
    if (!res.valid) {
        console.error(res.message);
        typeof res.fixedValue === 'number' && (android.apiLevel = res.fixedValue);
    }

    if (android.useDebugKeystore) {
        android.keystorePath = join(GlobalPaths.staticDir, 'tools/keystore/debug.keystore');
        android.keystoreAlias = 'debug_keystore';
        android.keystorePassword = '123456';
        android.keystoreAliasPassword = '123456';
    }

    const params = options.cocosParams;
    Object.assign(params.platformParams, android);

    if (renderBackEnd) {
        Object.keys(renderBackEnd).forEach((backend) => {
            // @ts-ignore
            params.cMakeConfig[`CC_USE_${backend.toUpperCase()}`] = renderBackEnd[backend as 'gles2' | 'gles3' | 'vulkan'];
        });
    }
    params.cMakeConfig.CC_ENABLE_SWAPPY = !!android.swappy;
    // ADPF was previously enabled on the android platform.
    params.cMakeConfig.USE_ADPF = true;
}

export async function onAfterBundleInit(options: IAndroidInternalBuildOptions) {
    await nativeCommonHook.onAfterBundleInit(options);
    const renderBackEnd = options.packages.android.renderBackEnd;

    options.assetSerializeOptions!['cc.EffectAsset'].glsl1 = renderBackEnd.gles2 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl3 = renderBackEnd.gles3 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl4 = renderBackEnd.vulkan ?? true;
}
