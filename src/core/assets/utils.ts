'use strict';

import { Asset, VirtualAsset, queryUUID, Utils as dbUtils, queryAsset as dbQueryAsset, queryPath } from '@editor/asset-db';
import { isAbsolute, join, relative, resolve } from 'path';
import { existsSync, move, readFile, readJSON, remove } from 'fs-extra';
import type { Asset as CCAsset, Details } from 'cc';
import type { CCON } from 'cc/editor/serialization';
import I18n from '../base/i18n';
import Utils from '../base/utils';
import { IAsset, IExportData, ISerializedOptions, SerializedAsset } from './@types/private';

const EditorExtends: any = require('@base/electron-module').require('EditorExtends');
export function url2path(url: string) {
    if (isAbsolute(url)) {
        return url;
    }
    // 数据库地址转换
    if (url.startsWith('db://')) {
        return queryPath(url);
    }

    return Utils.Path.resolveToRaw(url);
}

/**
* 将时间戳转为可阅读的时间信息
*/
export function getCurrentLocalTime() {
    const time = new Date();
    return time.toLocaleDateString().replace(/\//g, '-') + ' ' + time.toTimeString().slice(0, 5).replace(/:/g, '-');
}
/**
 * 获取当前内存占用
 */
export function getMemorySize() {
    const memory = process.memoryUsage();
    function format(bytes: number) {
        return (bytes / 1024 / 1024).toFixed(2) + 'MB';
    }
    return 'Process: heapTotal ' + format(memory.heapTotal) + ' heapUsed ' + format(memory.heapUsed) + ' rss ' + format(memory.rss);
}

/**
 * 将 url 转成 uuid
 * @param url 
 */
export function url2uuid(url: string) {
    const subAssetName: string[] = [];
    let uuid = url;
    let wUUID = '';
    while (!(wUUID = queryUUID(uuid)) && uuid !== 'db:/') {
        uuid = uuid.replace(/\/([^/]*)$/, (all: string, name: string) => {
            subAssetName.splice(0, 0, dbUtils.nameToId(name));
            return '';
        });
    }
    if (wUUID) {
        const asset = dbQueryAsset(uuid);
        if (!asset || (asset.isDirectory() && subAssetName.length > 0)) {
            uuid = '';
        } else {
            uuid = asset.uuid;
            if (subAssetName.length > 0) {
                uuid += '@' + subAssetName.join('@');
            }
        }
    } else {
        uuid = '';
    }
    return uuid;
}

// 检查是否是扩展名的正则判断
const extnameRex = /^\./;

/**
 * 检查一个输入文件名是否是扩展名
 * @param extOrFile
 */
function isExtname(extOrFile: string) {
    return extOrFile === '' || extnameRex.test(extOrFile);
}

/**
 * assetDB 内 asset 资源自带的 library 是一个数组，需要转成对象
 * @param asset
 */
export function libArr2Obj(asset: IAsset) {
    const result: { [key: string]: string } = {};
    for (const extname of asset.meta.files) {
        if (isExtname(extname)) {
            result[extname] = asset.library + extname;
        } else {
            result[extname] = resolve(asset.library, extname);
        }
    }
    return result;
}

export function getExtendsFromCCType(ccType: string) {
    if (!ccType || ccType === 'cc.Asset') {
        return [];
    }

    let superClass = cc.js.getSuper(cc.js.getClassByName(ccType));
    const extendClass = [];
    let superClassName = cc.js.getClassName(superClass);

    while (superClassName && (extendClass[extendClass.length - 1] !== 'cc.Asset')) {
        extendClass.push(superClassName);
        superClass = cc.js.getSuper(superClass);
        superClassName = cc.js.getClassName(superClass);
    }

    return extendClass;
}

// 整理出需要在删除资源后传播的主要信息
export function tranAssetInfo(asset: Asset | VirtualAsset) {
    const info = {
        file: asset.source,
        uuid: asset.uuid,
        library: libArr2Obj(asset),
        importer: asset.meta.importer,
    };
    return info;
}

export const PROMISE_STATE = {
    PENDING: 'pending',
    FULFILLED: 'fulfilled',
    REJECTED: 'rejected',
};

export function decidePromiseState(promise: Promise<any>) {
    const t = { name: 'test' };
    return Promise.race([promise, t])
        .then(v => {
            return (v === t) ? PROMISE_STATE.PENDING : PROMISE_STATE.FULFILLED;
        })
        .catch(() => PROMISE_STATE.REJECTED);
}

/**
 * 删除文件
 * @param file
 */
export async function removeFile(file: string): Promise<boolean> {
    if (!existsSync(file)) {
        return true;
    }

    try {
        await Utils.File.trashItem(file);
    } catch (error) {
        console.error(error);
        throw new Error(`asset db removeFile ${file} fail!`);
    }

    // 这个 try 是容错，目的是吐掉报错，报错的原因是重复操作了，db 在刷新的时候也会处理主文件配套的 meta 文件
    try {
        const metaFile = file + '.meta';
        if (existsSync(metaFile)) {
            await Utils.File.trashItem(metaFile);
        }
    } catch (error) {
        // do nothing
    }
    return true;
}


// 默认的序列化选项
const defaultSerializeOptions = {
    compressUuid: true, // 是否是作为正式打包导出的序列化操作
    stringify: false, // 序列化出来的以 json 字符串形式还是 json 对象显示，这个要写死统一，否则对 json 做处理的时候都需要做类型判断
    dontStripDefault: false,
    useCCON: false,
    keepNodeUuid: false, // 序列化后是否保留节点组件的 uuid 数据
};

export function serializeCompiledWithInstance(instance: any, options: ISerializedOptions & {
    useCCONB?: boolean;
    useCCON?: boolean;
}): SerializedAsset | null {
    if (!instance) {
        return null;
    }
    // 重新反序列化并保存
    return EditorExtends.serializeCompiled(
        instance,
        Object.assign(defaultSerializeOptions, {
            compressUuid: !options.debug,
            useCCON: options.useCCONB,
            noNativeDep: !instance._native, // 表明该资源是否存在原生依赖，这个字段在运行时会影响 preload 相关接口的表现
        }),
    ) as (string | CCON | object);
}

export async function getRawInstanceFromImportFile(path: string, assetInfo: { uuid: string, url: string }) {
    const data = path.endsWith('.json') ? await readJSON(path) : await transformCCON(path!);
    const result: {
        asset: CCAsset | null;
        detail: Details | null;
    } = {
        asset: null,
        detail: null,
    };
    const { deserialize } = await import('cc');
    const deserializeDetails = new deserialize.Details();
    // detail 里面的数组分别一一对应，并且指向 asset 依赖资源的对象，不可随意更改 / 排序
    deserializeDetails.reset();
    const MissingClass = EditorExtends.MissingReporter.classInstance;
    MissingClass.hasMissingClass = false;
    const deserializedAsset = deserialize(data, deserializeDetails, {
        createAssetRefs: true,
        ignoreEditorOnly: true,
        classFinder: MissingClass.classFinder,
    }) as CCAsset;
    if (!deserializedAsset) {
        console.error(
            I18n.t('builder.error.deserialize_failed', {
                url: `{asset(${assetInfo.url})}`,
            }),
        );
        return result;
    }
    // reportMissingClass 会根据 _uuid 来做判断，需要在调用 reportMissingClass 之前赋值
    deserializedAsset._uuid = assetInfo.uuid;

    // if (MissingClass.hasMissingClass && !this.hasMissingClassUuids.has(asset.uuid)) {
    //     MissingClass.reportMissingClass(deserializedAsset);
    //     this.hasMissingClassUuids.add(asset.uuid);
    // }
    // 清空缓存，防止内存泄漏
    MissingClass.reset();
    // 预览时只需找出依赖的资源，无需缓存 asset
    // 检查以及查找对应资源，并返回给对应 asset 数据
    // const missingAssets: string[] = [];
    // 根据这个方法分配假的资源对象, 确保序列化时资源能被重新序列化成 uuid
    // const test = this;
    // let missingAssetReporter: any = null;
    // deserializeDetails.assignAssetsBy(function(uuid: string, options: { owner: object; prop: string; type: Function }) {
    // const asset = test.getAsset(uuid);
    // if (asset) {
    //     return EditorExtends.serialize.asAsset(uuid);
    // } else {
    //     // if (!missingAssets.includes(uuid)) {
    //     //     missingAssets.push(uuid);
    //     // test.hasMissingAssetsUuids.add(uuid);
    //     if (options && options.owner) {
    //         missingAssetReporter = missingAssetReporter || new EditorExtends.MissingReporter.object(deserializedAsset);
    //         missingAssetReporter.outputLevel = 'warn';
    //         missingAssetReporter.stashByOwner(options.owner, options.prop, EditorExtends.serialize.asAsset(uuid, options.type));
    //     }
    //     // }
    //     // remove deleted asset reference
    //     return null;
    // }
    // });
    // if (missingAssetReporter) {
    //     missingAssetReporter.reportByOwner();
    // }
    // if (missingAssets.length > 0) {
    //     console.warn(
    //         I18n.t('builder.error.required_asset_missing', {
    //             url: `{asset(${asset.url})}`,
    //             uuid: missingAssets.join('\n '),
    //         }),
    //     );
    // }

    // https://github.com/cocos-creator/3d-tasks/issues/6042 处理 prefab 与 scene 名称同步问题
    // if (['cc.SceneAsset', 'cc.Prefab'].includes(Manager.assetManager.queryAssetProperty(asset, 'type'))) {
    //     deserializedAsset.name = basename(asset.source, extname(asset.source));
    // }

    result.asset = deserializedAsset;
    result.detail = deserializeDetails;
    // this.depend[asset.uuid] = [...new Set(deserializeDetails.uuidList)] as string[];
}

async function transformCCON(path: string) {
    const buffer = await readFile(path);
    const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const { decodeCCONBinary } = await import('cc/editor/serialization');
    return decodeCCONBinary(bytes);
}

export async function serializeCompiled(asset: IAsset, options: ISerializedOptions) {
    const outputData = ensureOutputData(asset);
    const result = await getRawInstanceFromImportFile(outputData.import!.path, {
        uuid: asset.uuid,
        url: asset.url,
    });
    if (!result?.asset) {
        return null;
    }
    return serializeCompiledWithInstance(result.asset, options);
}

export function ensureOutputData(asset: IAsset) {
    // 3.8.3 以上版本，资源导入后的数据将会记录在 outputData 字段内部
    let outputData: IExportData = asset.getData('output');
    if (outputData) {
        return outputData;
    }
    outputData = {
        import: {
            type: 'json',
            path: asset.library + '.json',
        },
    };
    let importPath: string;
    // 生成默认的 debug 版本导出数据
    const nativePath: Record<string, string> = {};
    asset.meta.files.forEach((extName: string) => {
        if (['.json', '.cconb'].includes(extName)) {
            outputData.import.path = asset.library + extName;
            if (extName === '.cconb') {
                outputData.import.type = 'buffer';
            }
            return;
        }

        // 旧规则，__ 开头的资源不在运行时使用
        if (extName.startsWith('.___')) {
            return;
        }
        nativePath[extName] = asset.library + extName;
    });

    if (Object.keys(nativePath).length) {
        outputData.native = nativePath;
    }
    asset.setData('output', outputData);
    return outputData;
}

/**
 * 翻译带有 i18n:xxx 的 Label
 */
export function transI18nName(name: string): string {
    if (typeof name !== 'string') {
        return '';
    }
    if (name.startsWith('i18n:')) {
        name = name.replace('i18n:', '');
        if (!I18n.t(name)) {
            console.debug(`${name} is not defined in i18n`);
        }
        return I18n.t(name) || name;
    }
    return name;
}