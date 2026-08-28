'use stirct';

import { AssetDBOptions, AssetDB, map } from './libs/asset-db';
import {
    getFileSystemProvider,
    resetFileSystemProvider,
    setFileSystemProvider,
} from './libs/filesystem';
import { isSubPath, nameToId } from './libs/utils';

/**
 * 创建一个新的资源数据库
 * @param options
 */
export function create(options: AssetDBOptions) {
    const database = new AssetDB(options);
    return database;
}

/**
 * 循环每一个数据库
 * @param handler
 */
export function forEach(handler: Function) {
    Object.keys(map).forEach((name) => {
        handler(map[name]);
    });
}

export {
    setDefaultUserData,
} from './libs/default-meta';

export {
    Importer,
} from './libs/importer';

export type {
    Migrate,
} from './libs/importer';

export {
    Asset,
    AssetActionEnum,
    VirtualAsset,
} from './libs/asset';

export {
    AssetDB,
} from './libs/asset-db';

export type {
    AssetDBOptions,
} from './libs/asset-db';

export type {
    IAssetDeleteOptions,
    IAssetFileStat,
    IAssetFileSystemProvider,
    IAssetOperationContext,
    IAssetOperationKind,
    IAssetOperationOrigin,
    IAssetRenameOptions,
    IAssetWriteFileOptions,
} from './libs/filesystem';

export {
    isSubPath,
    nameToId,
} from './libs/utils';

export const Utils = {
    nameToId,
    isSubPath,
};

export {
    get,
    queryAsset,
    queryMissingInfo,
    queryUrl,
    queryPath,
    queryUUID,
    reimport,
    refresh,
} from './libs/manager';

export {
    getFileSystemProvider,
    resetFileSystemProvider,
    setFileSystemProvider,
};

let version = '';
try {
    version = require('./package.json').version;
} catch(error) {
    version = require('../package.json').version;
}

declare const global: any;

if (!global.AssetDB) {
    global.AssetDB = module.exports;
    global.AssetDB.version = version;
} else if (global.AssetDB.version !== version) {
    console.log(`Two different versions of AssetDB have been loaded, please check it.`);
    module.exports = global.AssetDB;
} else {
    module.exports = global.AssetDB;
}
