'use strict';

import { basename } from 'path';
import { BuilderAssetCache } from '../../manager/asset';
import { InternalBuildResult } from '../../manager/build-result';
import { relativeUrl, removeDbHeader } from '../../utils';
import { IBuilder, IInternalBuildOptions } from '../../../../@types/protected';

export const title = 'i18n:builder.tasks.settings.script';

/**
 * 填充脚本数据
 * @param options
 * @param settings
 */
export async function handle(this: IBuilder, options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderAssetCache) {
    const settings = result.settings;
    settings.scripting.scriptPackages = result.scriptPackages.map((path) => relativeUrl(result.paths.engineDir!, path));
    settings.plugins.jsList = result.pluginScripts.map((script) => {
        let fileDbUrlNoProtocolHeader = removeDbHeader(script.url);
        if (options.md5Cache && result.paths.plugins[script.uuid]) {
            fileDbUrlNoProtocolHeader = fileDbUrlNoProtocolHeader.replace(/[^\/]*$/, () => basename(result.paths.plugins[script.uuid]));
        }
        return fileDbUrlNoProtocolHeader;
    });
}
