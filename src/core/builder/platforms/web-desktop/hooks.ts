'use-strict';

import { copyFileSync, outputFileSync } from 'fs-extra';
import { join } from 'path';
import Ejs from 'ejs';
import { InternalBuildResult, BuilderAssetCache, IBuilder, IBuildTaskOption, IInternalBuildOptions } from '../../@types/protected';
import { IBuildResult } from '../../@types/platforms/web-desktop';
import { relativeUrl, transformCode } from '../../worker/builder/utils';

export const throwError = true;

export function onAfterInit(options: IInternalBuildOptions<'web-desktop'>, result: InternalBuildResult, cache: BuilderAssetCache) {
    options.buildEngineParam.assetURLFormat = 'runtime-resolved';
    if (options.server && !options.server.endsWith('/')) {
        options.server += '/';
    }
}

export function onAfterBundleInit(options: IInternalBuildOptions<'web-desktop'>) {
    options.buildScriptParam.system = { preset: 'web' };
    const useWebGPU = options.packages['web-desktop'].useWebGPU;
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
export async function onBeforeCompressSettings(options: IInternalBuildOptions<'web-desktop'>, result: InternalBuildResult, cache: BuilderAssetCache) {
    if (!result.paths.dir) {
        return;
    }
    const settings = result.settings;
    settings.screen.exactFitScreen = false;
}

export async function onBeforeCopyBuildTemplate(this: IBuilder, options: IInternalBuildOptions<'web-desktop'>, result: IBuildResult) {
    const staticDir = join(options.engineInfo.typescript.path, 'templates/web-desktop');
    const packageOptions = options.packages['web-desktop'];

    // 拷贝内部提供的模板文件
    const cssFilePath = join(result.paths.dir, 'style.css');
    options.md5CacheOptions.includes.push('style.css');
    if (!this.buildTemplate.findFile('style.css')) {
        // 生成 style.css
        copyFileSync(join(staticDir, 'style.css'), cssFilePath);
    }
    if (!this.buildTemplate.findFile('favicon.ico')) {
        copyFileSync(join(staticDir, 'favicon.ico'), join(result.paths.dir, 'favicon.ico'));
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
    const data = {
        polyfillsBundleFile: (result.paths.polyfillsJs && relativeUrl(result.paths.dir, result.paths.polyfillsJs)) || false,
        systemJsBundleFile: relativeUrl(result.paths.dir, result.paths.systemJs!),
        projectName: options.name,
        engineName: options.buildEngineParam.engineName,
        previewWidth: packageOptions.resolution.designWidth,
        previewHeight: packageOptions.resolution.designHeight,
        cocosTemplate: join(staticDir, 'index-plugin.ejs'),
        importMapFile: relativeUrl(result.paths.dir, result.paths.importMap),
        indexJsName: './index.js',
        cssUrl: './style.css',
    };
    const content = await Ejs.renderFile(indexEjsTemplate, data);
    result.paths.indexHTML = join(result.paths.dir, 'index.html');
    outputFileSync(result.paths.indexHTML, content, 'utf8');
    // 入口文件排除 md5 写入
    options.md5CacheOptions.replaceOnly.push('index.html');
}
export async function onAfterBuild(options: IInternalBuildOptions<'web-desktop'>, result: InternalBuildResult) {
    // 放在最后处理 url ，否则会破坏 md5 的处理
    result.settings.plugins.jsList.forEach((url: string, i: number) => {
        result.settings.plugins.jsList[i] = url.split('/').map(encodeURIComponent).join('/');
    });
    outputFileSync(result.paths.settings, JSON.stringify(result.settings, null, options.debug ? 4 : 0));
}
