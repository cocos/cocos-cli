'use strict';
import template from 'ejs';

import { copyFileSync, copySync, existsSync, outputFileSync, readFileSync, removeSync } from 'fs-extra';
import { join, dirname, basename } from 'path';
import * as babel from '@babel/core';
// @ts-ignore
import babelPresetEnv from '@babel/preset-env';
import { BuilderAssetCache } from '../../manager/asset';
import { InternalBuildResult } from '../../manager/build-result';
import { relativeUrl, toBabelModules } from '../../utils';
import i18n from '../../../../../base/i18n';
import { IBuilder, IInternalBuildOptions } from '../../../../@types/protected';
import utils from '../../../../../base/utils';

// 当前的 ejs 模板版本，升级版本后需要修改该字段与 application.ejs 里的版本号
const APPLICATION_EJS_VERSION = '1.0.0';

export const title = 'i18n:builder.tasks.build_template';

export const name = 'build-task/template';

/**
 * application.js 模板编译
 * @param options
 * @param settings
 */
export async function handle(this: IBuilder, options: IInternalBuildOptions, result: InternalBuildResult, cache: BuilderAssetCache) {
    // 生成 settings.json
    const content = JSON.stringify(result.settings, null, options.debug ? 4 : 0);
    outputFileSync(result.paths.settings, content, 'utf8');

    const enginePath = options.engineInfo.typescript.path;
    const templateDir = join(enginePath, 'templates/launcher');
    const applicationEjsPath = this.buildTemplate!.query('application') || join(templateDir, 'application.ejs');

    const settingsJsonPath = relativeUrl(result.paths.dir, result.paths.settings);
    // ---- 编译 application.js ----
    const applicationSource = (await template.renderFile(
        applicationEjsPath,
        Object.assign(options.appTemplateData, {
            settingsJsonPath,
            hasPhysicsAmmo: options.buildEngineParam.includeModules.includes('physics-ammo'),
            versionTips: i18n.t('builder.tips.applicationEjsVersion'),
            customVersion: APPLICATION_EJS_VERSION,
            versionCheckTemplate: join(templateDir, 'version-check.ejs'),
        }),
    )) as string;
    const applicationSourceTransformed = await babel.transformAsync(applicationSource, {
        presets: [[babelPresetEnv, {
            modules: toBabelModules('systemjs'),
            targets: options.buildScriptParam.targets,
        }]],
    });

    if (!applicationSourceTransformed || !applicationSourceTransformed.code) {
        throw new Error('无法生成 application.js');
    }
    outputFileSync(result.paths.applicationJS, applicationSourceTransformed.code);
    options.md5CacheOptions.includes.push(utils.Path.relative(result.paths.dir, result.paths.applicationJS));
}

// ----
