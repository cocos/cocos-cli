'use strict';

import { IInternalBuildOptions } from '../../../../@types/protected';
import { defaultConfigs } from '../../../../share/common-options-validator';
import { BuilderAssetCache } from '../../manager/asset';
import { InternalBuildResult } from '../../manager/build-result';
import { formatSplashScreen, patchOptionsToSettings } from './utils/project-options';
import { isEqual } from 'lodash';

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
    // const settingDest = Editor.Utils.Path.join(result.paths!.dir, 'res', 'settings.json');
    // if (!existsSync(settingDest)) {
    //     throw new Error('Get cache settings failed!');
    // }
    await patchOptionsToSettings(options, result.settings);
    // 发送插屏设置统计
    await postSplashSettingsMetric(result);
}

async function postSplashSettingsMetric(result: InternalBuildResult) {
    const splashScreenSettings = result.settings.splashScreen;
    const defaultSplashScreenSettings = formatSplashScreen(defaultConfigs.splashScreenSetting);
    let metricSplash = 2;
    if (splashScreenSettings?.totalTime === 0) {
        metricSplash = 3;
    } else if (!isEqual(defaultSplashScreenSettings, splashScreenSettings)) {
        metricSplash = 1;
    }
}
