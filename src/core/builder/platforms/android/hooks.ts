'use strict';

import { IBuildResult, IAndroidInternalBuildOptions } from './type';
import { BuilderCache, IBuilder } from '../../@types/protected';
import { generateAndroidOptions, checkAndroidAPILevels } from './utils';
import * as nativeCommonHook from '../native-common/hooks';
import { join } from 'path';
import { GlobalPaths } from '../../../../global';

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

export async function onAfterInit(this: IBuilder, options: IAndroidInternalBuildOptions, result: IBuildResult, _cache: BuilderCache) {
    await nativeCommonHook.onAfterInit.call(this, options, result);
    
    // 生成 Android 选项
    const android = await generateAndroidOptions(options);
    options.packages.android = android;
    
    const renderBackEnd = android.renderBackEnd;
    
    // 检查 API Level
    const res = await checkAndroidAPILevels(android.apiLevel, options);
    if (res.error) {
        console.error(res.error);
        res.newValue && (android.apiLevel = res.newValue);
    }
    
    // 处理调试密钥库
    if (android.useDebugKeystore) {
        android.keystorePath = join(GlobalPaths.staticDir, 'tools/keystore/debug.keystore');
        android.keystoreAlias = 'debug_keystore';
        android.keystorePassword = '123456';
        android.keystoreAliasPassword = '123456';
    }
    
    // 补充一些平台必须的参数
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

