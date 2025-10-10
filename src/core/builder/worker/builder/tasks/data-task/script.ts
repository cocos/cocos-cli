'use strict';

import { join } from 'path';
import { BuilderAssetCache } from '../../manager/asset';
import { InternalBuildResult } from '../../manager/build-result';
import { IBuilder, IInternalBuildOptions } from '../../../../@types/protected';
import { pluginManager } from '../../../../manager/plugin';
import { FilterPluginOptions } from '../../../../../scripting/interface';
import { assetManager } from '../../../../../assets/manager/asset';

export const title = 'i18n:builder.tasks.sort_asset_bundle';

export const name = 'data-task/asset_script';

export async function handle(this: IBuilder, options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderAssetCache) {
    let queryPluginOptions: FilterPluginOptions = {};
    try {
        const platformType = pluginManager.platformConfig[options.platform].type;
        if (platformType) {
            queryPluginOptions = {
                [`loadPluginIn${platformType[0].toUpperCase() + platformType.slice(1)}`]: true,
            };
        }
    } catch (error) {
        console.error(error);
        console.warn(`Can not find platform type for ${options.platform}`);
    }
    result.pluginScripts = assetManager.querySortedPlugins(queryPluginOptions);
    // 初始化一些脚本编译选项，路径等等，方便后续流程的修改
    if (options.preview) {
        return;
    }

    result.paths.polyfillsJs = join(result.paths.dir, 'src', 'polyfills.bundle.js');
    result.paths.systemJs = join(result.paths.dir, 'src', 'system.bundle.js');
    result.paths.engineDir = options.buildEngineParam.output;

    const { importMapFormat } = options.buildScriptParam;
    let extension: string;
    const importMapDir = join(result.paths.dir, 'src');

    if (importMapFormat === undefined) {
        extension = '.json';
    } else {
        extension = '.js';
    }
    const importMapOutFile = join(importMapDir, `import-map${extension}`);
    result.paths.importMap = importMapOutFile;
    options.buildScriptParam.commonDir = join(result.paths.dir, 'src', 'chunks');
}
