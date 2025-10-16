'use strict';

import { createHash } from 'crypto';
import { basename, dirname, join } from 'path';
import {
    outputJSON,
    pathExists,
    readJson,
    emptyDir,
    copy,
} from 'fs-extra';
import * as ccBuild from '@cocos/ccbuild';
import fs from 'fs-extra';
import ps from 'path';
import { workerManager } from '../../../worker-pools/sub-process-manager';
import { buildEngineOptions, buildSeparateEngine } from './build-engine';
import fg from 'fast-glob';

import { parseMangleConfig } from './mangle-config-parser';
import { defaultMangleConfig } from './default-mangle-config';
import { StatsQuery } from '@cocos/ccbuild';
import { IBuildEngineParam, IInternalBuildOptions, IBuildSeparateEngineOptions, IBuildSeparateEngineResult } from '../../../../@types/protected';
import utils from '../../../../../base/utils';
import { relativeUrl } from '../../utils';
import { BuildGlobalInfo } from '../../../../share/builder-config';

// 存储引擎复用参数的文件
const EngineCacheName = 'engine-cache';

/**
 * 见：https://github.com/cocos-creator/engine/pull/6735 中 build-engine 接口返回的注释
 *
 * 补充一下：
 * - 这个文件本来是为多模块设计的，里面记录了类似这样的映射：
 * ```js
 * {
 *   // 暴露给用户的模块名和实际模块文件
 *   "cc.core": "./cc.core.js",
 *   "cc.audio": "./cc.audio.js",
 * }
 * ```
 * - 如果分割了引擎，里面就是记录了如上的映射；
 * - 现在只有在微信下面分割了引擎。其它里面没有分割所以这个文件只记录了模块 `cc` 的映射：
 * ```js
 * {
 *   "cc": "./cc.js",
 * }
 * ```
 */
const exportsMetaFile = 'meta.json';

/**
 * 引擎构建
 * @param options
 * @param settings
 */
export async function buildEngineX(
    options: IBuildEngineParam,
    ccEnvConstants: StatsQuery.ConstantManager.CCEnvConstants,
) {
    const { output, metaFile } = await buildEngine(options, ccEnvConstants);

    await emptyDir(options.output!);

    await copy(`${output}`, options.output!, {
        recursive: true,
    });

    return { metaFile };
}

/**
 * 这些选项是来自于设置的，也加入缓存检测。
 */
interface ProfileOptions {
    noDeprecatedFeatures: string | boolean | undefined;
    loose: boolean;
}

const fixedMd5Keys: readonly (keyof IInternalBuildOptions['buildEngineParam'] | keyof ProfileOptions)[] = [
    'debug',
    'sourceMaps',
    'includeModules',
    'engineVersion',
    'platformType',
    'split',
    'nativeCodeBundleMode',
    'targets',
    'entry',
    'noDeprecatedFeatures',
    'loose',
    'assetURLFormat',
    'flags',
    'preserveType',
    'wasmCompressionMode',
    'enableNamedRegisterForSystemJSModuleFormat',
    'mangleProperties',
    'inlineEnum',
];

async function buildEngine(options: IBuildEngineParam, ccEnvConstants: StatsQuery.ConstantManager.CCEnvConstants) {
    // TODO
    const noDeprecatedFeaturesConfig: { value: boolean, version: string } = { value: false, version: '' };
    const loose: boolean = options.loose || false;

    const noDeprecatedFeatures = noDeprecatedFeaturesConfig.value ?
        (!noDeprecatedFeaturesConfig.version ? true : noDeprecatedFeaturesConfig.version) :
        undefined;

    const profileOptions: ProfileOptions = {
        noDeprecatedFeatures,
        loose,
    };

    const mangleConfigJsonPath = join(BuildGlobalInfo.projectRoot, 'engine-mangle-config.json');
    if (options.mangleProperties && !await fs.pathExists(mangleConfigJsonPath)) {
        console.debug(`mangleProperties is enabled, but engine-mangle-config.json not found, create default mangle configuration`);
        defaultMangleConfig.__doc_url__ = utils.Url.getDocUrl('advanced-topics/mangle-properties.html');
        await fs.writeJson(mangleConfigJsonPath, defaultMangleConfig, { spaces: 2 });
    } else {
        console.debug(`mangleProperties is enabled, found engine-mangle-config.json, use it`);
    }

    // 计算缓存名字，并检查状态
    const md5Keys = options.md5Map.length === 0 ?
        fixedMd5Keys : options.md5Map.concat(fixedMd5Keys);
    let md5String = calcMd5String(Object.assign(profileOptions, options), md5Keys);

    if (options.mangleProperties) {
        md5String += `projectPath=${BuildGlobalInfo.projectRoot},`;
        console.debug(`Found mangle config, append projectPath to md5String: ${md5String.split(',').join(',\n')}`);
    }

    const md5 = createHash('md5');
    const name = md5.update(md5String).digest('hex');
    // TODO 缓存引擎目录确认
    const output = join(options.entry, 'bin/temp', name);
    const metaDir = join(dirname(output), `${name}.meta`);
    const watchFilesRecordFile = `${output}.watch-files.json`;
    const metaFile = join(metaDir, exportsMetaFile);

    if (options.useCache && await validateCache(output, watchFilesRecordFile) && await isValidMeta(metaFile)) {
        console.debug(`Use cache engine: {link(${output})}`);
        console.debug(`Use cache, md5String: ${md5String.split(',').join(',\n')}`);
        console.debug(`Use cache, options: ` + JSON.stringify(options, null, 2));
        return {
            output,
            metaFile,
        };
    }

    let mangleConfigJsonMtime = 0;
    let mangleProperties: buildEngineOptions['mangleProperties'] = false;
    if (options.mangleProperties) {
        if (ccEnvConstants.NATIVE) {
            // 原生平台由于某些类使用 .jsb.ts 替代 .ts，比如 node.jsb.ts 替代 node.ts，暂时无法支持属性压缩功能
            console.warn(`Currently, mangling internal properties is not supported on native platforms, current platform: ${options.platformType}`);
        } else {
            mangleProperties = parseMangleConfig(mangleConfigJsonPath, options.platformType);
            if (mangleProperties === undefined) {
                console.debug(`engine-mangle-config.json not found, but mangleProperties is enabled, so enable mangleProperties with default mangle configuration`);
                mangleProperties = true;
            } else {
                mangleConfigJsonMtime = (await fs.stat(mangleConfigJsonPath)).mtimeMs;
                console.debug(`mangleProperties: ${JSON.stringify(mangleProperties, null, 2)}`);
            }
        }
    } else {
        console.debug(`mangleProperties is disabled, platform: ${options.platformType}`);
    }

    const buildOptions: buildEngineOptions = {
        incremental: watchFilesRecordFile,
        engine: options.entry,
        out: output,
        moduleFormat: 'system',
        compress: !options.debug,
        nativeCodeBundleMode: options.nativeCodeBundleMode,
        assetURLFormat: options.assetURLFormat,
        noDeprecatedFeatures,
        sourceMap: options.sourceMaps,
        targets: options.targets,
        loose,
        features: options.includeModules,
        platform: options.platformType,
        flags: options.flags,
        mode: 'BUILD',
        metaFile,
        preserveType: options.preserveType,
        wasmCompressionMode: options.wasmCompressionMode,
        enableNamedRegisterForSystemJSModuleFormat: options.enableNamedRegisterForSystemJSModuleFormat,
        inlineEnum: options.inlineEnum,
        mangleProperties,
        mangleConfigJsonMtime,
    };

    // 引擎编译目前编译内存占用较大，需要独立进程管理
    await workerManager.registerTask({
        name: 'build-engine',
        path: join(__dirname, './build-engine'),
    });
    console.debug(`Cache is invalid, start build engine with options: ${JSON.stringify(buildOptions, null, 2)}`);
    console.debug(`md5String: ${md5String.split(',').join(',\n')}`);
    await workerManager.runTask('build-engine', 'buildEngineCommand', [buildOptions]);
    // await buildEngineCommand(buildOptions);

    await outputCacheJson(options, output);
    workerManager.kill('build-engine');

    console.debug(`build engine done: output: ${output}`);

    return {
        output,
        metaFile,
    };
}

export async function buildSplitEngine(options: IBuildSeparateEngineOptions): Promise<IBuildSeparateEngineResult> {
    // 引擎编译目前编译内存占用较大，需要独立进程管理
    await workerManager.registerTask({
        name: 'build-engine',
        path: join(__dirname, './build-engine'),
    });
    return await workerManager.runTask('build-engine', 'buildSeparateEngine', [options]);
    // return await buildSeparateEngine(options);
}
/**
 * 验证缓存引擎的有效性。
 * @param cache 引擎缓存路径。
 * @param incrementalFile 增量文件。
 */
async function validateCache(cache: string, incrementalFile: string) {
    if (!await fs.pathExists(cache)) {
        console.debug(`Engine cache (${cache}) does not exist.`);
        return false;
    }

    let zeroCheck = false;
    try {
        const files = await fg('**/*.js', {
            cwd: cache,
        });
        if (files.length !== 0) {
            zeroCheck = true;
        }
    } catch { }

    if (!zeroCheck) {
        console.warn(`Engine cache directory({link(${cache})}) exists but has empty content. It's abnormal.`);
        return false;
    }

    if (await ccBuild.buildEngine.isSourceChanged(incrementalFile)) {
        return false;
    }

    return true;
}

async function isValidMeta(metaFile: string) {
    if (!await pathExists(metaFile)) {
        return false;
    }

    let exportMeta: unknown;
    try {
        exportMeta = await fs.readJson(metaFile);
    } catch (err) {
        return false;
    }

    if (typeof exportMeta !== 'object' || exportMeta === null) {
        return false;
    }

    const exports = (exportMeta as { exports?: unknown }).exports;
    if (typeof exports !== 'object') {
        return false;
    }

    const mangleConfigJsonPath = join(BuildGlobalInfo.projectRoot, 'engine-mangle-config.json');
    if (await fs.pathExists(mangleConfigJsonPath)) {
        const currentMangleConfigJsonMtime = (await fs.stat(mangleConfigJsonPath)).mtimeMs;
        const currentMangleConfigJsonReadableTime = new Date(currentMangleConfigJsonMtime).toLocaleString();
        const oldMangleConfigJsonMtime = (exportMeta as { mangleConfigJsonMtime?: number }).mangleConfigJsonMtime;
        const oldMangleConfigJsonReadableTime = oldMangleConfigJsonMtime !== undefined ? new Date(oldMangleConfigJsonMtime).toLocaleString() : 0;
        if (currentMangleConfigJsonMtime !== oldMangleConfigJsonMtime) {
            console.debug(`engine-mangle-config.json mtime changed: now: ${currentMangleConfigJsonReadableTime} !== old: ${oldMangleConfigJsonReadableTime}`);
            return false;
        } else {
            console.debug(`engine-mangle-config.json mtime isn't changed: now: ${currentMangleConfigJsonReadableTime} === old: ${oldMangleConfigJsonReadableTime}`);
        }
    }

    return true;
}

function calcMd5String(config: IBuildEngineParam, keys: readonly string[]) {
    let str = '';
    for (const key of keys as (keyof IBuildEngineParam)[]) {
        str += `${key}=${JSON.stringify(config[key])},`;
    }
    return str;
}

/**
 * 生成引擎文件和对应的 map 文件
 * @param options
 * @param output
 */
async function outputCacheJson(options: IBuildEngineParam, output: string) {
    const dest = join(dirname(output), `${EngineCacheName}.json`);
    let data: any = {};
    if (await pathExists(dest)) {
        data = await readJson(dest);
    }
    data = data || {};
    const hashName = basename(output);
    data[hashName] = options;
    await outputJSON(dest, data);
}

export async function queryEngineImportMap(
    metaPath: string, enginePath: string,
    importMapDir: string,
    baseUrl?: string) {
    let exportMeta: ccBuild.buildEngine.Result;
    try {
        exportMeta = await fs.readJson(metaPath);
    } catch (err) {
        throw new Error(`Failed to read engine export meta, engine might not have been build correctly: ${err}`);
    }

    const baseUrlObj = baseUrl ? new URL(baseUrl) : undefined;

    const getImportURL = (moduleFile: string) => {
        let importUrl: string;
        if (baseUrlObj) {
            importUrl = new URL(moduleFile, baseUrlObj).href;
        } else {
            importUrl = `./${relativeUrl(importMapDir, ps.join(enginePath, moduleFile))}`;
        }
        return importUrl;
    };

    const importMap: Record<string, string> = {};
    for (const [moduleName, moduleFile] of Object.entries(exportMeta.exports)) {
        // importMap.imports[moduleName] = getImportURL(moduleFile);
        importMap[moduleName] = getImportURL(moduleFile);
    }

    for (const [alias, moduleFile] of Object.entries(exportMeta.chunkAliases)) {
        // importMap.imports[alias] = getImportURL(moduleFile);
        importMap[alias] = getImportURL(moduleFile);
    }
    return importMap;
}
