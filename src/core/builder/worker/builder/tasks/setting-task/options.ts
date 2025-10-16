'use strict';

import { IInternalBuildOptions } from '../../../../@types/protected';
import { BuilderAssetCache } from '../../manager/asset';
import { InternalBuildResult } from '../../manager/build-result';
import { formatSplashScreen, patchOptionsToSettings } from './utils/project-options';

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
export async function handle(options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderAssetCache) {
    await patchOptionsToSettings(options, result.settings);
}
