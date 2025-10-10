'use strict';

import { ensureDirSync, copyFileSync } from 'fs-extra';
import { dirname, join } from 'path';
import { ScriptBuilder } from '../../asset-handler/script';
import { buildEngineX, buildSplitEngine, queryEngineImportMap } from '../../asset-handler/script/engine';
import { BuilderAssetCache } from '../../manager/asset';
import { InternalBuildResult } from '../../manager/build-result';
import { removeDbHeader } from '../../utils';
import { newConsole } from '../../../../../base/console';
import i18n from '../../../../../base/i18n';
import { IBuilder, IInternalBuildOptions } from '../../../../@types/protected';

export const title = 'i18n:builder.tasks.build_script';

export async function handle(this: IBuilder, options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderAssetCache) {

    newConsole.trackTimeStart('builder:build-script-total');
    const hasPolyFill = await ScriptBuilder.buildPolyfills(options.polyfills, result.paths.polyfillsJs!);
    if (!hasPolyFill) {
        delete result.paths.polyfillsJs;
    }
    this.updateProcess('Generate systemJs...');
    await ScriptBuilder.buildSystemJs({
        dest: result.paths.systemJs!,
        sourceMaps: options.sourceMaps,
        debug: options.debug,
        platform: options.platform,
        hotModuleReload: options.buildScriptParam.hotModuleReload,
    });

    // 编译 bundle 项目脚本
    const buildProjectScriptRes = await this.bundleManager.buildScript();

    if (buildProjectScriptRes) {
        if (buildProjectScriptRes.scriptPackages) {
            result.scriptPackages.push(...buildProjectScriptRes.scriptPackages);
        }
        // TODO Bundle 的脚本构建不应该依赖 importmap
        if (buildProjectScriptRes.importMappings) {
            Object.assign(result.importMap.imports, buildProjectScriptRes.importMappings);
        }
    }

    if (!options.buildEngineParam.skip) {
        options.buildEngineParam.targets = options.buildScriptParam.targets;
        options.buildEngineParam.flags = options.buildScriptParam.flags;
        // 兼容旧版本
        if (options.buildEngineParam.platform && !options.buildEngineParam.platformType) {
            options.buildEngineParam.platformType = options.buildEngineParam.platform;
        }
        // 编译引擎
        this.updateProcess(`${i18n.t('builder.tasks.build_engine')} start...`);
        const { separateEngineOptions } = options.buildEngineParam;
        let useSeparateEngine = !!separateEngineOptions;
        newConsole.trackTimeStart('builder:build-engine');
        if (useSeparateEngine && separateEngineOptions) {
            const res = await buildSplitEngine({
                ...options.buildEngineParam,
                ...separateEngineOptions,
                platform: options.platform,
                engine: options.buildEngineParam.entry,
                importMapOutFile: result.paths.importMap,
                useCacheForce: true,
            });
            result.paths.engineMeta = res.paths.meta;
            Object.assign(result.importMap.imports, res.importMap);
            result.separateEngineResult = res;
        } else {
            const { metaFile } = await buildEngineX(options.buildEngineParam, ScriptBuilder.projectOptions.ccEnvConstants);
            result.paths.engineMeta = metaFile;
            const importMaps = await queryEngineImportMap(metaFile, options.buildEngineParam.output, dirname(result.paths.importMap));
            Object.assign(result.importMap.imports, importMaps);
        }
        const buildEngineTime = await newConsole.trackTimeEnd('builder:build-engine');
        this.updateProcess(`${i18n.t('builder.tasks.build_engine')} in (${buildEngineTime} ms) √`);
    }

    this.updateProcess(`Copy plugin script ...`);
    // ---- 拷贝插件脚本 ----
    for (const pluginInfo of result.pluginScripts) {
        const url = removeDbHeader(pluginInfo.url);
        const output = join(result.paths.dir, 'src', url);
        ensureDirSync(dirname(output));
        copyFileSync(pluginInfo.file, output);
        result.paths.plugins[pluginInfo.uuid] = output;
    }

    // 生成 import-map
    this.updateProcess('Generate import-map...');
    await ScriptBuilder.outputImportMap(result.importMap, {
        dest: result.paths.importMap,
        importMapFormat: options.buildScriptParam.importMapFormat,
        debug: options.debug,
    });
}
