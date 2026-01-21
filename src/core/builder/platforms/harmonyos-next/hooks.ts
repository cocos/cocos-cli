'use strict';

import { existsSync, outputJSON, unlinkSync, readFileSync, outputFileSync, rm, statSync, pathExists } from 'fs-extra';
import { IBuildResult, IHarmonyOSNextInternalBuildOptions } from './type';
import { BuilderCache, IBuilder } from '../../@types/protected';
import { emptyDir, copy, moveSync, ensureDir, writeFileSync, readdirSync } from 'fs-extra';
import { basename, relative, join, dirname } from 'path';
import * as nativeCommonHook from '../native-common/hooks';
import { generateOptions } from './utils';
import Ejs from 'ejs';
import JSON5 from 'json5';
import { transformCode } from '../../worker/builder/utils';

//export const onBeforeBuild = nativeCommonHook.onBeforeBuild;
export const onAfterBundleDataTask = nativeCommonHook.onAfterBundleDataTask;
export const onAfterCompressSettings = nativeCommonHook.onAfterCompressSettings;
export const onBeforeMake = nativeCommonHook.onBeforeMake;
export const make = nativeCommonHook.make;
export const run = nativeCommonHook.run;


export const throwError = true;

export async function onBeforeBuild(options: IHarmonyOSNextInternalBuildOptions) {
    //disable sourcemap
    options.sourceMaps = false;
    return;
}

/**
 * 在开始构建之前构建出 native 项目
 * @param options
 * @param result
 */
export async function onAfterInit(this: IBuilder, options: IHarmonyOSNextInternalBuildOptions, result: IBuildResult, _cache: BuilderCache) {
    await nativeCommonHook.onAfterInit.call(this, options, result);

    const openHarmonyOS = await generateOptions(options);
    options.packages['harmonyos-next'] = openHarmonyOS;
    const renderBackEnd = openHarmonyOS.renderBackEnd;

    // NOTE: options.buildEngineParam 不能在 onAfterBundleInit 里使用，这个阶段里没有定义 buildEngineParam
    options.buildEngineParam.preserveType = openHarmonyOS.useAotOptimization;

    // 补充一些平台必须的参数
    const params = options.cocosParams;
    Object.keys(renderBackEnd).forEach((backend) => {
        // @ts-ignore
        params.cMakeConfig[`CC_USE_${backend.toUpperCase()}`] = renderBackEnd[backend];
    });
    if (openHarmonyOS.jsEngine === 'JSVM') {
        params.cMakeConfig.USE_SE_V8 = `set(USE_SE_V8 OFF)`;
        params.cMakeConfig.USE_SE_NAPI = `set(USE_SE_NAPI OFF)`;
        params.cMakeConfig.USE_SE_JSVM = `set(USE_SE_JSVM ON)`;
    } else if (openHarmonyOS.jsEngine === 'V8') {
        params.cMakeConfig.USE_SE_V8 = `set(USE_SE_V8 ON)`;
        params.cMakeConfig.USE_SE_NAPI = `set(USE_SE_NAPI OFF)`;
        params.cMakeConfig.USE_SE_JSVM = `set(USE_SE_JSVM OFF)`;
    } else if (openHarmonyOS.jsEngine === 'ARK') {
        params.cMakeConfig.USE_SE_V8 = `set(USE_SE_V8 OFF)`;
        params.cMakeConfig.USE_SE_NAPI = `set(USE_SE_NAPI ON)`;
        params.cMakeConfig.USE_SE_JSVM = `set(USE_SE_JSVM OFF)`;
        // The ark engine on HarmonyOS Next platform does not support encryption.
        params.encrypted = false;
    }
    if(openHarmonyOS.useGamepad) {
        params.cMakeConfig.USE_GAMEPAD = `set(USE_GAMEPAD ON)`;
    } else {
        params.cMakeConfig.USE_GAMEPAD = `set(USE_GAMEPAD OFF)`;
    }

    Object.assign(params.platformParams, openHarmonyOS);
    await outputJSON(result.paths.compileConfig!, params);
    // checkSDKEnv(options);
}

export function onAfterBundleInit(options: IHarmonyOSNextInternalBuildOptions) {
    if (options.packages['harmonyos-next'].jsEngine === 'ARK') {
        options.buildScriptParam.importMapFormat = 'esm';
    }
    const renderBackEnd = options.packages['harmonyos-next'].renderBackEnd;

    options.assetSerializeOptions!['cc.EffectAsset'].glsl3 = renderBackEnd.gles3 ?? true;
}

export async function onAfterBuild(this: IBuilder, options: IHarmonyOSNextInternalBuildOptions, result: IBuildResult, cache: BuilderCache) {
    await nativeCommonHook.onAfterBuild.call(this, options, result);

    const { useAotOptimization } = options.packages['harmonyos-next'];
    if (options.packages['harmonyos-next'].jsEngine === 'ARK') {
        // 转化 settings.json 为 SystemJS 模块的 settings.js
        let settingsCode = readFileSync(result.paths.settings, 'utf8');
        settingsCode = 'export default ' + settingsCode;
        const systemSettingsCode = await transformCode(settingsCode, {
            importMapFormat: 'systemjs',
        });
        unlinkSync(result.paths.settings);
        const settingsJsFile = join(dirname(result.paths.settings), 'settings.js');
        outputFileSync(settingsJsFile, systemSettingsCode, 'utf8');
    }
    // 拷贝 assets 资源到 rawfile 目录下 entry/src/main/resources/rawfile/Resources/
    const assetDir = join(result.paths.dir, 'assets');
    const mainDir = join(options.cocosParams.projDir, 'native/engine', options.platform, 'entry/src/main');
    const engineAssetDir = join(mainDir, 'ets/cocos/src/cocos-js/assets');
    const entryDir = join(options.cocosParams.projDir, 'native/engine', options.platform, 'entry');
    const effectBin = join(entryDir, 'src/main/ets/cocos/src/effect.bin');
    const targetResourcesDir = join(mainDir, 'resources/rawfile/Resources');
    const targetAssetDir = join(targetResourcesDir, 'assets');
    const targetEngineAssetDir = join(targetResourcesDir, 'cocos-js/assets');
    const targetEffectBin = join(targetResourcesDir, 'src/effect.bin');
    await emptyDir(targetAssetDir);
    await ensureDir(targetAssetDir);
    if (await pathExists(assetDir)) {
        await copy(assetDir, targetAssetDir);
    } else {
        console.debug(`assets directory not found: ${assetDir}, the bundles may be configured as remote bundles.`);
    }
    // 拷贝 src 目录到 entry/src/main/ets/cocos/src
    const srcDir = join(result.paths.dir, 'src');
    await emptyDir(join(mainDir, 'ets/cocos/src'));
    await emptyDir(join(mainDir, 'ets/cocos/assets'));
    await copy(srcDir, join(mainDir, 'ets/cocos/src'));
    if (options.packages['harmonyos-next'].jsEngine === 'V8' || options.packages['harmonyos-next'].jsEngine === 'JSVM') {
        // 如果开启 v8，把所有脚本一起拷贝到 rawFile
        const cocosDir = join(mainDir, 'ets/cocos');
        const subDirToCopy = ['jsb-adapter', 'src'];
        for (const dir of subDirToCopy) {
            const src = join(cocosDir, dir);
            const dst = join(targetResourcesDir, dir);
            await ensureDir(dst);
            await emptyDir(dst);
            await copy(src, dst);
            await rm(src, { force: true, recursive: true });
        }

        // 删除之前遗留的application.js
        const applicationJS = join(mainDir, 'ets/cocos', basename(result.paths.applicationJS));
        if (existsSync(applicationJS)) {
            await rm(applicationJS, { force: true, recursive: true }); // 我们需要移除原来的 assets，否则会导致 DevEco 编译报错
        }
        // 拷贝 application.js
        await copy(result.paths.applicationJS, join(targetResourcesDir, basename(result.paths.applicationJS)));
        // 拷贝 main.js
        const mainJsSrc = join(result.paths.dir, 'main.js');
        const mainJsDst = join(targetResourcesDir, 'main.js');
        await copy(mainJsSrc, mainJsDst);
    } else {
        await copy(result.paths.applicationJS, join(mainDir, 'ets/cocos', basename(result.paths.applicationJS)));
        // 拷贝脚本 entry/src/main/ets/cocos/assets/xx/index
        this.bundleManager.bundles.forEach((bundle) => {
            if (bundle.isRemote) {
                return;
            }
            moveSync(join(targetAssetDir, bundle.name, basename(bundle.scriptDest)), join(mainDir, 'ets/cocos/assets', bundle.name, basename(bundle.scriptDest)));
            if (!options.sourceMaps) {
                return;
            }
            moveSync(join(targetAssetDir, bundle.name, 'index.js.map'), join(mainDir, 'ets/cocos/assets', bundle.name, 'index.js.map'));
        });
        // 拷贝引擎资源 entry/src/main/ets/cocos/src/cocos-js/assets
        if (existsSync(engineAssetDir)) {
            await ensureDir(targetEngineAssetDir);
            await emptyDir(targetEngineAssetDir);
            await copy(engineAssetDir, targetEngineAssetDir);
            await rm(engineAssetDir, { force: true, recursive: true }); // 我们需要移除原来的 assets，否则会导致 DevEco 编译报错
        }
        if (existsSync(effectBin)) {
            await copy(effectBin, targetEffectBin);
        }
    }
    const bundleJsList: string[] = [];
    this.bundleManager.bundles.forEach((bundle) => {
        if (bundle.isRemote) {
            return;
        }
        bundleJsList.push(`${bundle.name}/${basename(bundle.scriptDest)}`);
    });

    // 第三方js插件
    const pluginsJsList: string[] = [];
    for (const plugin_id in result.paths.plugins) {
        const plugin = result.paths.plugins[plugin_id];
        const path = relative(result.paths.dir, plugin);
        pluginsJsList.push(path.split('\\').join('/'));
    }

    const engineInfo = options.engineInfo;
    if (options.packages['harmonyos-next'].jsEngine === 'ARK') {
        // 渲染 game.ts
        const gameEjs = join(engineInfo.typescript.path, 'templates/harmonyos-next/entry/src/main/ets/cocos/game.ts');
        const gameDest = join(mainDir, 'ets/cocos/game.ts');
        let ccUrls: string[] = readdirSync(result.paths.engineDir!);
        ccUrls = ccUrls.filter(url => !statSync(join(result.paths.engineDir!, url)).isDirectory()); // 目录索引会导致编译报错，需要过滤
        const systemCCUrl = result.importMap.imports['cc'].slice(2); // remove './';
        const gameJsRenderConfig: Record<string, any> = {
            importMapUrl: basename(result.paths.importMap),
            applicationUrl: basename(result.paths.applicationJS),
            systemBundleUrl: basename(result.paths.systemJs!),
            ccUrls,
            systemCCUrl,
            bundleJsList,
            pluginsJsList,
            chunkBundleUrl: '',
            useAotOptimization,
        };
        if (existsSync(join(result.paths.dir, 'src/chunks'))) {
            const chunkBundleUrl: string = (readdirSync(join(result.paths.dir, 'src/chunks'))).find((item) => item.startsWith('bundle') && item.endsWith('.js'))!;
            if (chunkBundleUrl) {
                gameJsRenderConfig.chunkBundleUrl = chunkBundleUrl;
            }
        }
        writeFileSync(gameDest, await Ejs.renderFile(gameEjs, gameJsRenderConfig), 'utf8');
    } else {
        // 删除game.ts
        const gameDest = join(mainDir, 'ets/cocos/game.ts');
        if (existsSync(gameDest)) {
            await rm(gameDest, { force: true, recursive: true });
        }
    }
    // 渲染 cocos_worker.ets
    const cocosWorkerEjs = join(engineInfo.typescript.path, 'templates/harmonyos-next/entry/src/main/ets/workers/cocos_worker.ets');
    const cocosWorkerDest = join(mainDir, 'ets/workers/cocos_worker.ets');
    const useV8 = options.packages['harmonyos-next'].jsEngine === 'V8' || options.packages['harmonyos-next'].jsEngine === 'JSVM';
    const cocosWorkerJsRenderConfig: Record<string, any> = {
        useV8,
    };
    writeFileSync(cocosWorkerDest, await Ejs.renderFile(cocosWorkerEjs, cocosWorkerJsRenderConfig), 'utf8');

    // 修改 build-profile.json5 里的 compileMode
    const buildProfilePath = join(entryDir, 'build-profile.json5');
    const buildProfile = JSON5.parse(readFileSync(buildProfilePath, 'utf8'));
    writeFileSync(buildProfilePath, JSON5.stringify(buildProfile, null, 2), 'utf8');
}