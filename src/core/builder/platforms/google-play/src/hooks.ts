'use strict';

import { join } from 'path';
import { IBuildResult, IGooglePlayInternalBuildOptions } from './type';
import { BuilderCache, IBuilder } from '../../../@types/protected';
import { checkAndroidAPILevels } from './utils';
import * as nativeCommonHook from '../../native-common/hooks';
import { GlobalPaths } from '../../../../../global';
import { getCustomIconInfo } from './custom-icon';

// export const onBeforeBuild = nativeCommonHook.onBeforeBuild;
export const onAfterBundleDataTask = nativeCommonHook.onAfterBundleDataTask;
export const onAfterCompressSettings = nativeCommonHook.onAfterCompressSettings;
export const onBeforeMake = nativeCommonHook.onBeforeMake;
export const make = nativeCommonHook.make;
export const run = nativeCommonHook.run;
export const throwError = true;

export async function onBeforeBuild(this: IBuilder, options: IGooglePlayInternalBuildOptions, result: IBuildResult, _cache: BuilderCache) {
    console.log('[GooglePlayHooks] onBeforeBuild called',JSON.stringify(options));
    
    await  nativeCommonHook.onBeforeBuild.call(this, options);
}
export async function onAfterBuild(this: IBuilder, options: IGooglePlayInternalBuildOptions, result: IBuildResult, _cache: BuilderCache) {
    console.log('[GooglePlayHooks] onAfterBuild called',JSON.stringify(options));
    
    await nativeCommonHook.onAfterBuild.call(this, options, result);
}

export async function onAfterInit(this: IBuilder, options: IGooglePlayInternalBuildOptions, result: IBuildResult, _cache: BuilderCache) {
    await nativeCommonHook.onAfterInit.call(this, options, result);

    const googlePlay = options.packages['google-play'];
    googlePlay.orientation = googlePlay.orientation || {
        landscapeRight: true,
        landscapeLeft: true,
        portrait: false,
        upsideDown: false,
    };
    const renderBackEnd = googlePlay.renderBackEnd;

    const res = await checkAndroidAPILevels(googlePlay.apiLevel, options);
    if (!res.valid) {
        console.error(res.message);
        if (typeof res.fixedValue === 'number') {
            googlePlay.apiLevel = res.fixedValue;
        }
    }

    if (googlePlay.useDebugKeystore) {
        googlePlay.keystorePath = join(GlobalPaths.staticDir, '../tools/keystore/debug.keystore');
        googlePlay.keystoreAlias = 'debug_keystore';
        googlePlay.keystorePassword = '123456';
        googlePlay.keystoreAliasPassword = '123456';
    }

    const params = options.cocosParams;
    Object.assign(params.platformParams, googlePlay);

    if (renderBackEnd) {
        Object.keys(renderBackEnd).forEach((backend) => {
            params.cMakeConfig[`CC_USE_${backend.toUpperCase()}`] = renderBackEnd[backend as 'gles2' | 'gles3' | 'vulkan'];
        });
    }

    params.cMakeConfig.CC_ENABLE_SWAPPY = !!googlePlay.swappy;
    params.cMakeConfig.USE_ADPF = !!googlePlay.adpf;

    if (!options.includeModules.includes('vendor-google')) {
        options.includeModules.push('vendor-google');
    }
    if (googlePlay.googleBilling) {
        params.cMakeConfig.USE_GOOGLE_BILLING = true;
    }
    if (googlePlay.playGames) {
        params.cMakeConfig.USE_GOOGLE_PLAY_GAMES = true;
    }

    params.platformParams.customIconInfo = getCustomIconInfo(params.projDir, googlePlay.customIcon, options.outputName);
}

export async function onAfterBundleInit(options: IGooglePlayInternalBuildOptions) {
    await nativeCommonHook.onAfterBundleInit(options);
    const renderBackEnd = options.packages['google-play'].renderBackEnd;

    options.assetSerializeOptions!['cc.EffectAsset'].glsl1 = renderBackEnd.gles2 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl3 = renderBackEnd.gles3 ?? true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl4 = renderBackEnd.vulkan ?? true;
}
