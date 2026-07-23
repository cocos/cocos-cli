'use-strict';

import { copyFileSync, outputFileSync } from 'fs-extra';
import { join } from 'path';
import Ejs from 'ejs';
import { InternalBuildResult, BuilderCache, IBuilder, IBuildStageTask } from '../../../@types/protected';
import { IBuildResult } from './type';
import { relativeUrl, transformCode } from '../../../worker/builder/utils';
import * as commonUtils from '../../web-common/utils';
import { ITaskOption } from '../../native-common/type';

export const throwError = true;

export function onAfterInit(options:ITaskOption, result: InternalBuildResult, cache: BuilderCache) {
    options.buildEngineParam.assetURLFormat = 'runtime-resolved';
    if (options.server && !options.server.endsWith('/')) {
        options.server += '/';
    }
}

export function onAfterBundleInit(options:ITaskOption) {
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

export async function onBeforeCompressSettings(options:ITaskOption, result: InternalBuildResult, cache: BuilderCache) {
    if (!result.paths.dir) {
        return;
    }
    result.settings.screen.exactFitScreen = false;
}

export async function onBeforeCopyBuildTemplate(this: IBuilder, options:ITaskOption, result: IBuildResult) {
    const staticDir = join(options.engineInfo.typescript.path, 'templates/web-desktop');
    const packageOptions = options.packages['web-desktop'];

    const cssFilePath = join(result.paths.dir, 'style.css');
    options.md5CacheOptions.includes.push('style.css');
    if (!this.buildTemplate.findFile('style.css')) {
        copyFileSync(join(staticDir, 'style.css'), cssFilePath);
    }
    if (!this.buildTemplate.findFile('favicon.ico')) {
        copyFileSync(join(staticDir, 'favicon.ico'), join(result.paths.dir, 'favicon.ico'));
    }

    const indexJsTemplate = this.buildTemplate.initUrl('index.js.ejs', 'indexJs') || join(staticDir, 'index.js.ejs');
    const indexJsContent: string = await Ejs.renderFile(indexJsTemplate, {
        applicationJS: './' + relativeUrl(result.paths.dir, result.paths.applicationJS),
    });
    const indexJsSourceTransformedCode = await transformCode(indexJsContent, {
        importMapFormat: 'systemjs',
    });
    if (!indexJsSourceTransformedCode) {
        throw new Error('Cannot generate index.js');
    }
    const indexJsDest = join(result.paths.dir, 'index.js');
    result.paths.indexJs = indexJsDest;
    options.md5CacheOptions.includes.push('index.js');

    outputFileSync(indexJsDest, indexJsSourceTransformedCode, 'utf8');

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
    options.md5CacheOptions.replaceOnly.push('index.html');
}

export async function onAfterBuild(this: IBuilder, options:ITaskOption, result: InternalBuildResult) {
    result.settings.plugins.jsList.forEach((url: string, i: number) => {
        result.settings.plugins.jsList[i] = url.split('/').map(encodeURIComponent).join('/');
    });
    outputFileSync(result.paths.settings, JSON.stringify(result.settings, null, options.debug ? 4 : 0));
}

export async function run(this: IBuildStageTask, root: string, options: ITaskOption) {
    const previewUrl = await commonUtils.run('web-desktop', root);
    this.buildExitRes.custom = {
        previewUrl,
    };
}
