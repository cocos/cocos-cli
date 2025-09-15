'use strict';

import { IBuilder, IInternalBuildOptions } from '../../../../@types/protected';
import { BuilderAssetCache } from '../../manager/asset';
import { InternalBuildResult } from '../../manager/build-result';

export const title = 'i18n:builder.tasks.sort_asset_bundle';

export const name = 'data-task/asset_bundle';

export async function handle(this: IBuilder, options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderAssetCache) {
    await this.bundleManager.initAsset();
    if (options.preview) {
        return;
    }
    await this.bundleManager.bundleDataTask();

}
