'use strict';

import path from 'path';
import os from 'os';
import { accessSync, existsSync, constants, outputJSON } from 'fs-extra';
import * as nativeCommonHook from '../native-common/hooks';
import { BuilderCache, IBuilder } from '../../@types/protected';
export const throwError = true;
import { IBuildResult, IOhosInternalBuildOptions } from './type';
import { generateOptions } from './utils';

export const onBeforeBuild = nativeCommonHook.onBeforeBuild;
export const onAfterBundleDataTask = nativeCommonHook.onAfterBundleDataTask;
export const onAfterCompressSettings = nativeCommonHook.onAfterCompressSettings;
export async function onAfterBuild(this: IBuilder, options: IOhosInternalBuildOptions, result: IBuildResult, cache: BuilderCache) {
    console.log('[AndroidHooks] onAfterBuild called');
    await nativeCommonHook.onAfterBuild.call(this, options, result);
}
export const onBeforeMake = nativeCommonHook.onBeforeMake;
export const make = nativeCommonHook.make;
export const run = nativeCommonHook.run;

/**
 * 在开始构建之前构建出 native 项目
 * @param options
 * @param result
 */
export async function onAfterInit(this: IBuilder, options: IOhosInternalBuildOptions, result: IBuildResult, _cache: BuilderCache) {
    await nativeCommonHook.onAfterInit.call(this, options, result);

    const ohos = await generateOptions(options);
    const renderBackEnd = ohos.renderBackEnd;
    if (renderBackEnd) {
        Object.keys(renderBackEnd).forEach((backend) => {
            // @ts-ignore
            options.cocosParams.cMakeConfig[`CC_USE_${backend.toUpperCase()}`] = renderBackEnd[backend];
        });
    }
    // 目前项目参数都直接在 console 内处理了，暂时不需要单独处理
    // 但是差异化的处理理论上应该放在平台自己内部
    Object.assign(options.cocosParams.platformParams, ohos);
}

export function onAfterBundleInit(options: IOhosInternalBuildOptions) {
    options.assetSerializeOptions!['cc.EffectAsset'].glsl1 = false;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl3 = true;
    options.assetSerializeOptions!['cc.EffectAsset'].glsl4 = false;
}