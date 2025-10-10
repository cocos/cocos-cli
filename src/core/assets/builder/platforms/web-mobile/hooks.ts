'use strict';

import Ejs from 'ejs';
import { copyFileSync, outputFileSync } from 'fs-extra';
import { basename, join } from 'path';
import { InternalBuildResult, BuilderAssetCache, IBuilder, IInternalBuildOptions } from '../../@types/protected';
import { relativeUrl, transformCode } from '../../worker/builder/utils';
import { IBuildResult } from '../../@types/platforms/web-mobile';

export const throwError = true;

export async function onAfterInit(options: IInternalBuildOptions<'web-mobile'>, result: InternalBuildResult, cache: BuilderAssetCache) {

    // 添加统计信息
    const packageOptions = options.packages['web-mobile'];
    options.buildEngineParam.split = false;
    options.buildEngineParam.assetURLFormat = 'runtime-resolved';
    if (options.server && !options.server.endsWith('/')) {
        options.server += '/';
    }
}

export function onAfterBundleInit(options: IInternalBuildOptions<'web-mobile'>) {
    options.buildScriptParam.system = { preset: 'web' };
    const useWebGPU = options.packages['web-mobile'].useWebGPU;
    options.buildScriptParam.flags['WEBGPU'] = useWebGPU;
    if (useWebGPU) {
        if (!options.includeModules.includes('gfx-webgpu')) {
            options.includeModules.push('gfx-webgpu');
        }
        options.assetSerializeOptions['cc.EffectAsset']!.glsl4 = true;
    } else if (options.includeModules.includes('gfx-webgpu')) {
        const index = options.includeModules.indexOf('gfx-webgpu');
        options.includeModules.splice(index, 1);
    }
}

/**
 * 剔除不需要参与构建的资源
 * @param options
 * @param settings
 */
export async function onBeforeCompressSettings(options: IInternalBuildOptions<'web-mobile'>, result: InternalBuildResult, cache: BuilderAssetCache) {
    if (!result.paths.dir) {
        return;
    }
    const packageOptions = options.packages['web-mobile'];
    result.settings.screen.orientation = packageOptions.orientation;
}

export async function onBeforeCopyBuildTemplate(this: IBuilder, options: IInternalBuildOptions<'web-mobile'>, result: IBuildResult) {
    const staticDir = join(options.engineInfo.typescript.builtin, 'templates/web-mobile');
    const packageOptions = options.packages['web-mobile'];

    // 拷贝内部提供的模板文件
    const cssFilePath = join(result.paths.dir, 'style.css');
    options.md5CacheOptions.includes.push('style.css');
    if (!this.buildTemplate.findFile('style.css')) {
        // 生成 style.css
        copyFileSync(join(staticDir, 'style.css'), cssFilePath);
    }

    let webDebuggerSrc = '';
    if (packageOptions.embedWebDebugger) {
        const webDebuggerPath = join(result.paths.dir, 'vconsole.min.js');
        if (!this.buildTemplate.findFile('vconsole.min.js')) {
            // 生成 vconsole
            copyFileSync(join(staticDir, 'vconsole.min.js'), webDebuggerPath);
            options.md5CacheOptions.excludes.push('vconsole.min.js');
        }
        webDebuggerSrc = './vconsole.min.js';
    }

    // index.js 模板生成
    const indexJsTemplate = this.buildTemplate.initUrl('index.js.ejs', 'indexJs') || join(staticDir, 'index.js.ejs');
    const indexJsContent: string = await Ejs.renderFile(indexJsTemplate, {
        applicationJS: './' + relativeUrl(result.paths.dir, result.paths.applicationJS),
    });
    // TODO 需要优化，不应该直接读到内存里
    const indexJsSourceTransformedCode = await transformCode(indexJsContent, {
        importMapFormat: 'systemjs',
    });
    if (!indexJsSourceTransformedCode) {
        throw new Error('Cannot generate index.js');
    }
    const indexJsDest = join(result.paths.dir, `index.js`);
    result.paths.indexJs = indexJsDest;
    options.md5CacheOptions.includes.push(`index.js`);

    outputFileSync(indexJsDest, indexJsSourceTransformedCode, 'utf8');

    // index.html 模板生成
    const indexEjsTemplate = this.buildTemplate.initUrl('index.ejs') || join(staticDir, 'index.ejs');
    // 处理平台模板
    const data = {
        polyfillsBundleFile: result.paths.polyfillsJs && relativeUrl(result.paths.dir, result.paths.polyfillsJs) || false,
        systemJsBundleFile: relativeUrl(result.paths.dir, result.paths.systemJs!),
        projectName: options.name,
        engineName: options.buildEngineParam.engineName,
        webDebuggerSrc: webDebuggerSrc,
        cocosTemplate: join(staticDir, 'index-plugin.ejs'),
        importMapFile: relativeUrl(result.paths.dir, result.paths.importMap),
        indexJsName: basename(indexJsDest),
        cssUrl: basename(cssFilePath),
    };
    const content = await Ejs.renderFile(indexEjsTemplate, data);
    result.paths.indexHTML = join(result.paths.dir, 'index.html');
    outputFileSync(result.paths.indexHTML, content, 'utf8');
    options.md5CacheOptions.replaceOnly.push('index.html');
}

export async function onAfterBuild(options: IInternalBuildOptions<'web-mobile'>, result: InternalBuildResult) {
    // 放在最后处理 url ，否则会破坏 md5 的处理
    result.settings.plugins.jsList.forEach((url: string, i: number) => {
        result.settings.plugins.jsList[i] = url.split('/').map(encodeURIComponent).join('/');
    });
    outputFileSync(result.paths.settings, JSON.stringify(result.settings, null, options.debug ? 4 : 0));
}