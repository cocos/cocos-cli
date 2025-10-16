'use strict';

import { join, relative, dirname, format, parse } from 'path';
import { exec } from 'child_process';
import { statSync, readdirSync, existsSync, copyFileSync, writeFileSync } from 'fs';
import { copy, ensureDirSync, readFile, rename } from 'fs-extra';
import * as babel from '@babel/core';
import babelPresetEnv from '@babel/preset-env';
import { workerManager } from '../../worker-pools/sub-process-manager';
import { transI18n, transI18nName as transI18nNameShare } from '../../../share/utils';
import { IAsset } from '../../../../assets/@types/protected';
import { IModules, ITransformOptions, IBuildTaskOption } from '../../../@types';
import utils from '../../../../base/utils';
import { BuildGlobalInfo } from '../../../share/builder-config';

export { getBuildPath } from '../../../share/utils';



// 当前文件对外暴露的接口是直接对用户公开的，对内使用的工具接口请在其他文件夹内放置

/**
 * 比对两个 options 选项是否一致，不一致的数据需要打印出来
 * @param oldOptions 旧选项
 * @param newOptions 新选项
 * @returns 如果两个选项一致返回 true，否则返回 false
 */
export function compareOptions(oldOptions: Record<string, any>, newOptions: Record<string, any>): boolean {
    const res = pickDifferentOptions(oldOptions, newOptions);
    if (res.isEqual) {
        return true;
    }
    console.log(`different options: ${Object.keys(res.diff).map((key) => `${key}: ${res.diff[key].old} -> ${res.diff[key].new}`)}`);
    return false;
}

export function pickDifferentOptions(oldOptions: Record<string, any>, newOptions: Record<string, any>, path = '', diff: Record<string, { new: any, old: any }> = {}): {
    isEqual: boolean;
    diff: Record<string, { new: any, old: any }>,
} {
    let isEqual = true;
    // Helper function to log differences
    const collectDifference = (key: string, oldValue: any, newValue: any) => {
        diff[path ? `${path}.${key}` : key] = {
            new: newValue,
            old: oldValue,
        };
        isEqual = false;
    };

    // Check if both inputs are objects
    if (typeof oldOptions !== 'object' || typeof newOptions !== 'object') {
        if (oldOptions !== newOptions) {
            collectDifference('', oldOptions, newOptions);
        }
        return {
            diff,
            isEqual,
        };
    }

    // Get all keys from both objects
    const allKeys = new Set([...Object.keys(oldOptions), ...Object.keys(newOptions)]);

    for (const key of allKeys) {
        const oldValue = oldOptions[key];
        const newValue = newOptions[key];

        // If both values are objects, recursively compare them
        if (typeof oldValue === 'object' && typeof newValue === 'object' && oldValue !== null && newValue !== null) {
            if (!pickDifferentOptions(oldValue, newValue, path ? `${path}.${key}` : key, diff).isEqual) {
                isEqual = false;
            }
        } else if (oldValue !== newValue) {
            collectDifference(key, oldValue, newValue);
        }
    }

    return {
        diff,
        isEqual,
    };
}

export function copyPaths(paths: { src: string, dest: string }[]) {
    return Promise.all(paths.map((path) => copy(path.src, path.dest)));
}

/**
 * 递归遍历这个资源上的所有子资源
 * @param asset
 * @param handle
 */
export function recursively(asset: IAsset, handle: Function) {
    if (!asset.subAssets) {
        return;
    }
    handle && handle(asset);
    Object.keys(asset.subAssets).forEach((name: string) => {
        const subAsset = asset.subAssets[name];
        recursively(subAsset, handle);
    });
}

const DB_PROTOCOL_HEADER = 'db://';
// 去除 db:// 的路径
export function removeDbHeader(path: string): string {
    if (!path) {
        return '';
    }
    if (!path.startsWith(DB_PROTOCOL_HEADER)) {
        console.error('unknown path to build: ' + path);
        return path;
    }
    // 获取剔除 db:// 后的文件目录
    const mountPoint = path.slice(DB_PROTOCOL_HEADER.length);
    return mountPoint;
}

/**
 * 将 db 开头的 url 转为项目里的实际 url
 * @param url db://
 */
export function dbUrlToRawPath(url: string) {
    return join(BuildGlobalInfo.projectRoot, removeDbHeader(url));
}

/**
 * 获取相对路径，并且路径分隔符做转换处理
 * @param from
 * @param to
 */
export function relativeUrl(from: string, to: string) {
    return relative(from, to).replace(/\\/g, '/');
}

/**
 * 检查是否安装了 node.js
 */
export function isInstallNodeJs(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        exec(
            'node -v',
            {
                env: process.env,
            },
            (error: any) => {
                if (!error) {
                    // 检查成功
                    resolve(true);
                    return;
                }
                console.error(error);
                if (process.platform === 'win32') {
                    console.error(new Error(transI18n('builder.window_default_npm_path_error')));
                } else {
                    console.error(new Error(transI18n('builder.mac_default_npm_path_error')));
                }
                resolve(false);
            },
        );
    });
}

/**
 * 获取文件夹或者文件大小
 */
export function getFileSizeDeep(path: string) {
    if (!existsSync(path)) {
        return 0;
    }
    const stat = statSync(path);
    if (!stat.isDirectory()) {
        return stat.size;
    }
    let result = 0;
    // 文件夹
    const files = readdirSync(path);
    files.forEach((fileName) => {
        result += getFileSizeDeep(join(path, fileName));
    });
    return result;
}

/**
 * 拷贝文件夹
 * @param path
 * @param dest
 */
export function copyDirSync(path: string, dest: string) {
    if (!existsSync(path)) {
        return 0;
    }
    const stat = statSync(path);
    if (!stat.isDirectory()) {
        ensureDirSync(dirname(dest));
        return copyFileSync(path, dest);
    }
    // 文件夹
    const files = readdirSync(path);
    ensureDirSync(dest);
    files.forEach((fileName) => {
        const file = join(path, fileName);
        const fileDest = join(dest, fileName);
        copyDirSync(file, fileDest);
    });
}

/**
 * 翻译 title
 * @param title 原始 title 或者带有 i18n 开头的 title
 */
export const transI18nName = transI18nNameShare;

// 注意：目前 utils 用的是 UUID，EditorExtends 用的是 Uuid 
export function compressUuid(uuid: string, min = true) {
    return utils.UUID.compressUUID(uuid, min);
}

export function decompressUuid(uuid: string) {
    return utils.UUID.decompressUUID(uuid);
}

/**
 * 从 library 路径获取 uuid
 * @param path
 */
export function getUuidFromPath(path: string) {
    return utils.UUID.getUuidFromLibPath(path);
}

/**
 * 获取某个名字对应的短 uuid
 * @param name 
 * @returns 
 */
export function nameToSubId(name: string) {
    return utils.UUID.nameToSubId(name);
}

/**
 * 拼接成 import 路径
 * @param dest
 * @param uuid
 * @param extName 指定 import 的文件格式，默认 .json
 */
export function getResImportPath(dest: string, uuid: string, extName = '.json') {
    return join(dest, BuildGlobalInfo.IMPORT_HEADER, uuid.substr(0, 2), uuid + extName);
}

/**
 * 拼接成 raw-assets 路径
 * @param dest
 * @param uuid
 * @param extName 路径后缀
 */
export function getResRawAssetsPath(dest: string, uuid: string, extName: string) {
    return join(dest, BuildGlobalInfo.NATIVE_HEADER, uuid.substr(0, 2), uuid + extName);
}

export function toBabelModules(modules: IModules): string | false {
    return modules === 'esm' ? false : modules;
}

/**
 * 脚本编译
 * TODO 此类编译脚本相关逻辑，后续需要迁移到进程管理器内调用
 * @param code
 * @param options
 */
export async function transformCode(code: string, options: ITransformOptions): Promise<string> {
    const { loose, importMapFormat } = options;
    const babelFileResult = await babel.transformAsync(code, {
        presets: [[babelPresetEnv, {
            modules: importMapFormat ? toBabelModules(importMapFormat) : undefined,
            loose: loose !== null && loose !== void 0 ? loose : true,
        }]],
    });
    if (!babelFileResult || !babelFileResult.code) {
        throw new Error('Failed to transform!');
    }
    return babelFileResult.code;
}

/**
 * 编译脚本
 * @param contents
 * @param path
 */
export function compileJS(contents: Buffer, path: string) {
    let result;
    try {
        const Babel = require('@babel/core');
        result = Babel.transform(contents, {
            ast: false,
            highlightCode: false,
            sourceMaps: false,
            compact: false,
            filename: path, // search path for babelrc
            presets: [
                require('@babel/preset-env'),
            ],
            plugins: [
                // make sure that transform-decorators-legacy comes before transform-class-properties.
                [
                    require('@babel/plugin-proposal-decorators'),
                    { legacy: true },
                ],
                [
                    require('@babel/plugin-proposal-class-properties'),
                    { loose: true },
                ],
                [
                    require('babel-plugin-add-module-exports'),
                ],
                [
                    require('@babel/plugin-proposal-export-default-from'),
                ],
            ],
        });
    } catch (err: any) {
        err.stack = `Compile ${path} error: ${err.stack}`;
        throw err;
    }
    return result.code;
}

// export async function getModuleFiles(result: InternalBuildResult) {
//     const globbyOptions: GlobbyOptions = { /* nodir: true*/ };
//     return ([] as string[]).concat(...await Promise.all([
//         // Engine module files
//         result.paths.engineDir ? globby(join(result.paths.engineDir, '**/*.js'), globbyOptions) : [],
//         // application.js
//         result.paths.applicationJS,
//         // Project shared module files
//         globby(join(result.paths.dir, 'src/chunks/**/*.js'), globbyOptions),
//         // Script modules in bundle
//         result.bundleManager.bundles.map((bundle) => bundle.scriptDest),
//     ]));
// }

interface ICreateBundleOptions {
    excludes?: string[];
    debug?: boolean;
    sourceMap?: boolean;
}
export async function createBundle(src: string, dest: string, options?: ICreateBundleOptions) {
    return new Promise<void>((resolve, reject) => {
        const babelify = require('babelify');
        const browserify = require('browserify');
        const bundler = browserify(src);
        if (options && options.excludes) {
            options.excludes.forEach(function (path) {
                bundler.exclude(path);
            });
        }
        ensureDirSync(dirname(dest));
        bundler.transform(babelify, {
            presets: [require('@babel/preset-env')],
            plugins: [require('@babel/plugin-proposal-class-properties')],
        })
            .bundle((err: Error, buffer: Buffer) => {
                if (err) {
                    console.error(err);
                    reject(err);
                    return;
                }
                writeFileSync(dest, new Uint8Array(buffer), 'utf8');
                resolve();
            });
    });
}

const HASH_LEN = 5;
interface IAppendRes {
    hash: string;
    paths: string[];
}
/**
 * 给某些路径文件添加 md5 后缀
 * @param paths
 */
export async function appendMd5ToPaths(paths: string[]): Promise<IAppendRes | null> {
    if (!Array.isArray(paths)) {
        return null;
    }
    // 参与 md5 计算的数据需要排序，且不能并发否则会影响数据计算
    paths = paths.sort();
    const dataArr = [];
    for (const path of paths) {
        let data;
        try {
            data = await readFile(path);
            dataArr.push(data);
        } catch (error) {
            console.error(error);
            console.error(`readFile {link(${path})}`);
            continue;
        }
    }

    const hash = calcMd5(dataArr);
    const resultPaths: string[] = [];
    await Promise.all(
        paths.map((path, i) => {
            // 非资源类替换名字
            resultPaths[i] = patchMd5ToPath(path, hash);
            // 计算完 hash 值之后进行改名
            return rename(path, resultPaths[i]);
        }),
    );

    return {
        paths: resultPaths,
        hash,
    };
}

/**
 * 计算某个数据的 md5 值
 * @param data
 */
export function calcMd5(data: (Buffer | string) | Array<Buffer | string>): string {
    data = Array.isArray(data) ? data : [data];
    const { createHash } = require('crypto');
    const cryptoHash = createHash('md5');
    data.forEach((dataItem) => {
        cryptoHash.update(dataItem);
    });
    return cryptoHash.digest('hex').slice(0, HASH_LEN);
}

/**
 * 将某个 hash 值添加到某个路径上
 * @param targetPath 
 * @param hash 
 * @returns 
 */
export function patchMd5ToPath(targetPath: string, hash: string) {
    const parseObj = parse(targetPath);
    parseObj.base = '';
    parseObj.name += `.${hash}`;
    return format(parseObj);
}

/**
 * 获取一个资源 library 地址里的 library 文件夹绝对路径
 * @param libraryPath 
 * @returns 
 */
export function getLibraryDir(libraryPath: string) {
    // library 地址可能在项目内也可能在其他任何位置
    // 此处参考了 uuid 模块的 getUuidFromLibPath 所用正则来获取 library 以及之前的路径
    const matchInfo = libraryPath.match(/(.*)[/\\][0-9a-fA-F]{2}[/\\][0-9a-fA-F-]{8,}((@[0-9a-fA-F]{5,})+)?.*/);
    return matchInfo![1];
}

// 此工具方法走 workerManager 管理，方便对开启的进程做中断
export const quickSpawn = workerManager.quickSpawn.bind(workerManager);

export function queryImageAssetFromSubAssetByUuid(subAssetUuid: string) {
    return subAssetUuid.split('@')[0];
}
