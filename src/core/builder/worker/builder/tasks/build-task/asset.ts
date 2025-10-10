'use strict';

import { copyFile } from 'fs-extra';
import { dirname, join } from 'path';
import { BuilderAssetCache } from '../../manager/asset';
import { InternalBuildResult } from '../../manager/build-result';
import { IBuilder, IInternalBuildOptions } from '../../../../@types/protected';
import utils from '../../../../../base/utils';
import { BuildGlobalInfo } from '../../../../share/builder-config';

export const title = 'Build Assets';

export async function handle(this: IBuilder, options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderAssetCache) {
    this.updateProcess('Build bundles...');
    await this.bundleManager.buildAsset();

    // 生成 effect.bin
    if (options.includeModules.includes('custom-pipeline')) {
        const file = join(BuildGlobalInfo.projectTempDir, 'asset-db/effect/effect.bin');
        result.paths.effectBin = join(dirname(result.paths.settings), 'effect.bin');
        await copyFile(file, result.paths.effectBin);
        options.md5CacheOptions.excludes.push(utils.Path.relative(result.paths.dir, result.paths.effectBin));
    }

    // 输出 bundle 文件夹内容
    await this.bundleManager.outputBundle();
}
