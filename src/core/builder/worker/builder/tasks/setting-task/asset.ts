'use strict';

import i18n from '../../../../../base/i18n';
import { IBuilder, IInternalBuildOptions, IBundle } from '../../../../@types/protected';
import { BuiltinBundleName } from '../../../../share/bundle-utils';
import { BuilderAssetCache } from '../../manager/asset';
import { buildAssetLibrary } from '../../manager/asset-library';
import { InternalBuildResult } from '../../manager/build-result';
import { compressUuid } from '../../utils';

export const title = 'i18n:builder.tasks.settings.options';

const layerMask: number[] = [];
for (let i = 0; i <= 19; i++) {
    layerMask[i] = 1 << i;
}

/**
 * 根据选项填充 settings
 * @param options
 * @param settings
 */
export async function handle(this: IBuilder, options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderAssetCache) {
    const bundles = this.bundleManager.bundles.filter((bundle) => bundle.output);
    for (const bundle of bundles) {
        if (bundle.name === BuiltinBundleName.RESOURCES) {
            result.settings.assets.preloadBundles.push({ bundle: BuiltinBundleName.RESOURCES });
        } else if (bundle.name === BuiltinBundleName.START_SCENE) {
            result.settings.assets.preloadBundles.push({ bundle: BuiltinBundleName.START_SCENE });
        } else if (bundle.name === BuiltinBundleName.MAIN) {
            result.settings.assets.preloadBundles.push({ bundle: BuiltinBundleName.MAIN });
        }
        if (bundle.isRemote) {
            result.settings.assets.remoteBundles.push(bundle.name);
        }
        if (bundle.isSubpackage) {
            result.settings.assets.subpackages.push(bundle.name);
        }
    }
    if (!options.preview) {
        const startSceneAsset = buildAssetLibrary.getAsset(options.startScene);
        if (!startSceneAsset) {
            // 理论上进入构建前应该已经校验过，这里还是校验一下给一个可阅读的报错
            throw new Error(i18n.t('builder.error.invalidStartScene'));
        }
        options.startScene = startSceneAsset.url;
    }
    if (!options.debug) {
        result.settings.rendering.renderPipeline = compressUuid(result.settings.rendering.renderPipeline, true);
    }
    result.settings.assets.projectBundles = bundles.map((bundle: IBundle) => bundle.name);
    result.settings.engine.builtinAssets = Array.from(this.bundleManager.bundleMap[BuiltinBundleName.INTERNAL]._rootAssets);
}
