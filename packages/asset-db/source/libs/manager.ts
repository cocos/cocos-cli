'use strict';

import type { AssetDB } from './asset-db';
import type { Asset, VirtualAsset } from './asset';

import { isSamePath, isSubPath } from './utils';
import { getAssociatedFiles } from './dependency';
import { isAbsolute, relative, join } from 'path';
import { parse } from 'url';

export const map: { [index: string]: AssetDB } = {};

/**
 * 查找已经生成了的资源数据库
 * @param name
 */
export function get(name: string) {
    return map[name] || null;
}

/**
 * 给定一个 uuid 或者 url 或者绝对路径，查询一个资源对象
 * @param uuid
 */
export function queryAsset(uuid_url_path: string): Asset | VirtualAsset | null {
    // url
    if (uuid_url_path.startsWith('db://')) {
        uuid_url_path = encodeURI(uuid_url_path);
        const uri = parse(uuid_url_path);
        if (uri.host && map[uri.host]) {
            const db = map[uri.host || ''];
            const path = join(db.options.target, decodeURIComponent((uri.path || '') + (uri.hash || '')));
            const searcher = path.split('@');

            let asset: Asset | VirtualAsset | undefined = db.path2asset.get(searcher[0]);


            while (!asset && searcher.length > 1) {
                searcher[0] += '@' + searcher[1];
                searcher.splice(1, 1);
                asset = db.path2asset.get(searcher[0]);
            }

            for (let i = 1; i < searcher.length; i++) {
                let sub = asset!.subAssets[searcher[i]];
                if (!sub) {
                    return null;
                }
                asset = sub;
            }
            return asset || null;
        }
        return null;
    }

    // 绝对路径
    if (isAbsolute(uuid_url_path)) {
        for (let name in map) {
            const searcher = uuid_url_path.split('@');
            const db = map[name];
            let asset = db.path2asset.get(searcher[0]);

            while (!asset && searcher.length > 1) {
                searcher[0] += '@' + searcher[1];
                searcher.splice(1, 1);
                asset = db.path2asset.get(searcher[0]);
            }

            if (asset) {
                let asset: Asset | VirtualAsset | undefined = db.path2asset.get(searcher[0]);

                for (let i = 1; i < searcher.length; i++) {
                    let sub = asset!.subAssets[searcher[i]];
                    if (!sub) {
                        return null;
                    }
                    asset = sub;
                }
                return asset || null;
            }
        }
        return null;
    }

    // uuid
    // 数据库名字列表
    for (let name in map) {
        const db = map[name];
        const asset = db.getAsset(uuid_url_path);
        if (asset) {
            return asset;
        }
    }

    return null;
}

/**
 * 查询一个 uuid、绝对路径对应的 url 路径
 * url 格式为 db://database_name/source_path@xxx
 * 绝对路径请使用系统分隔符，文件夹末尾不需要带分隔符（mac：/  win：\\）
 * @param uuid_path
 */
export function queryUrl(uuid_path: string): string {
    // path
    if (isAbsolute(uuid_path)) {
        for (let name in map) {
            const db = map[name];
            if (isSubPath(uuid_path, db.options.target)) {
                const searcher = uuid_path.split('@');
                let asset: Asset | VirtualAsset | undefined = db.path2asset.get(searcher[0]);
                while (!asset && searcher.length > 1) {
                    searcher[0] += '@' + searcher[1];
                    searcher.splice(1, 1);
                    asset = db.path2asset.get(searcher[0]);
                }
                if (asset) {
                    let url = asset.url;
                    for (let index = 1; index < searcher.length; index++) {
                        url += `@${searcher[index]}`;
                    }
                    return url;
                }
                let pathname = relative(db.options.target, uuid_path);
                pathname = pathname.replace(/\\/g, '/');
                return `db://${name}/${pathname}`;
            }
        }
        return '';
    }

    // uuid
    const searcher = uuid_path.split('@');
    for (let name in map) {
        const db = map[name];
        const asset = db.getAsset(searcher[0]);

        if (asset) {
            let url = asset.url;
            if (searcher.length > 1) {
                for (let i = 1; i < searcher.length; i++) {
                    url += `@${searcher[i]}`;
                }
            }
            return url;
        }
    }
    return '';
}

/**
 * 查询一个 uuid、url 对应的绝对路径地址
 * url 格式为 db://database_name/source_path@xxx
 * 绝对路径请使用系统分隔符，文件夹末尾不需要带分隔符（mac：/  win：\\）
 * @param uuid_url
 */
export function queryPath(uuid_url: string): string {
    // url
    if (uuid_url.startsWith('db://')) {
        uuid_url = encodeURI(uuid_url);
        const uri = parse(uuid_url);
        if (uri.host && map[uri.host]) {
            const db = map[uri.host || ''];
            return join(db.options.target, decodeURIComponent((uri.path || '') + (uri.hash || '')));
        }
        return '';
    }

    // uuid
    const searcher = uuid_url.split('@');
    for (let name in map) {
        const db = map[name];
        let path = db.uuidToPath(searcher[0]);
        if (path) {
            if (searcher.length > 1) {
                for (let i = 1; i < searcher.length; i++) {
                    path += `@${searcher[i]}`;
                }
            }
            return path;
        }
    }

    return '';
}

/**
 * 查询一个 url、绝对路径对应的 uuid
 * url 格式为 db://database_name/source_path@xxx
 * 绝对路径请使用系统分隔符，文件夹末尾不需要带分隔符（mac：/  win：\\）
 * @param uuid_url
 */
export function queryUUID(url_path: string): string {
    // url
    if (url_path.startsWith('db://')) {
        url_path = encodeURI(url_path);
        const uri = parse(url_path);
        if (uri.host && map[uri.host]) {
            const db = map[uri.host || ''];
            const path = join(db.options.target, decodeURIComponent((uri.path || '') + (uri.hash || '')));
            const searcher = path.split('@');
            let uuid = db.pathToUuid(searcher[0]) || '';

            while (!uuid && searcher.length > 1) {
                searcher[0] += '@' + searcher[1];
                searcher.splice(1, 1);
                uuid = db.pathToUuid(searcher[0]) || '';
            }

            if (uuid && searcher.length > 1) {
                for (let i = 1; i < searcher.length; i++) {
                    uuid += `@${searcher[i]}`;
                }
            }
            return uuid;
        }
        return '';
    }

    // path
    for (let name in map) {
        const db = map[name];
        const searcher = url_path.split('@');
        let uuid = db.pathToUuid(searcher[0]) || '';

        while (!uuid && searcher.length > 1) {
            searcher[0] += '@' + searcher[1];
            searcher.splice(1, 1);
            uuid = db.pathToUuid(searcher[0]) || '';
        }

        if (uuid) {
            if (searcher.length > 1) {
                for (let i = 1; i < searcher.length; i++) {
                    uuid += `@${searcher[i]}`;
                }
            }
            return uuid;
        }
    }

    return '';
}

/**
 * 重新导入一个资源
 * url 格式为 db://database_name/source_path@xxx
 * 绝对路径请使用系统分隔符，文件夹末尾不需要带分隔符（mac：/  win：\\）
 * @param uuid_url_path
 */
export async function reimport(uuid_url_path: string) {
    // path
    if (isAbsolute(uuid_url_path)) {
        for (let name in map) {
            const db = map[name];
            if (isSubPath(uuid_url_path, db.options.target)) {
                const asset = db.path2asset.get(uuid_url_path);
                if (asset) {
                    return await db.reimport(uuid_url_path);
                }
            }
        }
    }

    // url
    if (uuid_url_path.startsWith('db://')) {
        uuid_url_path = encodeURI(uuid_url_path);
        const uri = parse(uuid_url_path);
        if (uri.host && map[uri.host]) {
            const db = map[uri.host || ''];
            const path = join(db.options.target, decodeURIComponent((uri.path || '') + (uri.hash || '')));
            // TODO 这个方式无法支持子资源的 URL
            const asset = db.path2asset.get(path);
            if (asset) {
                return await db.reimport(path);
            }
        }
    }

    // uuid
    for (let name in map) {
        const db = map[name];
        const asset = db.getAsset(uuid_url_path);
        if (asset) {
            return await db.reimport(uuid_url_path);
        }
    }
}

/**
 * 刷新一个资源或者资源目录
 * url 格式为 db://database_name/source_path@xxx
 * 绝对路径请使用系统分隔符，文件夹末尾不需要带分隔符（mac：/  win：\\）
 * @param uuid_url_path
 */
export async function refresh(uuid_url_path: string) {
    // path
    if (isAbsolute(uuid_url_path)) {
        for (let name in map) {
            const db = map[name];
            if (isSamePath(db.options.target, uuid_url_path) || isSubPath(uuid_url_path, db.options.target)) {
                return await db.refresh(uuid_url_path);
            }
        }
    }

    // url
    if (uuid_url_path.startsWith('db://')) {
        uuid_url_path = encodeURI(uuid_url_path);
        const uri = parse(uuid_url_path);
        if (uri.host && map[uri.host]) {
            const db = map[uri.host || ''];
            const path = join(db.options.target, decodeURIComponent((uri.path || '') + (uri.hash || '')));
            return await db.refresh(path);
        }
    }

    // uuid
    for (let name in map) {
        const db = map[name];
        const asset = db.getAsset(uuid_url_path);
        if (asset) {
            return await db.refresh(asset.source);
        }
    }
}

/**
 * 查找受影响的资源
 * @param asset
 */
export function getAssociatedAssets(asset: Asset | VirtualAsset) {
    const files: string[] = [];
    const push = (file: string) => {
        if (files.indexOf(file) !== -1) {
            return;
        }
        files.push(file);
    }
    getAssociatedFiles(asset.source).forEach(push);
    getAssociatedFiles(asset.uuid).forEach(push);
    getAssociatedFiles(asset.url).forEach(push);
    return files;
}

/**
 * 递归资源依赖的所有资源
 * @param asset
 * @param handle
 */
export function recursiveGetAssociatedAssets(asset: Asset | VirtualAsset, handle: Function) {
    handle(asset);
    const files = getAssociatedAssets(asset);
    const others: string[] = [];
    files.forEach((file) => {
        const asset = queryAsset(file);
        if (asset) {
            handle(asset);
            others.push(...recursiveGetAssociatedAssets(asset, handle));
        }
    });
    return [...files, ...others];
}

/**
 * 递归检查是否允许插入依赖
 * asset 依赖 fileOrUuidOrUrl
 * 检查是否有循环依赖出现
 * @param fileOrUuidOrUrl
 * @param asset
 */
export function recursiveCheckAssociatedAssets(fileOrUuidOrUrl: string, asset: Asset | VirtualAsset) {
    let success = true;
    recursiveGetAssociatedAssets(asset, function (asset) {
        if (
            asset.source === fileOrUuidOrUrl &&
            asset.url === fileOrUuidOrUrl &&
            asset.uuid === fileOrUuidOrUrl
        ) {
            success = false;
        }
    });
    return success;
}

/**
 * 重新导入受影响的资源
 * @param database
 * @param asset
 */
export function importAssociatedAssets(database: AssetDB, asset: Asset | VirtualAsset) {
    // 触发依赖这个资源的额其他资源自动重新导入
    // 但是这个重新导入其他资源的流程就不需要等待勒
    const files: string[] = getAssociatedAssets(asset)
    files.forEach((file) => {
        reimport(file);
    });
}

export function queryMissingInfo(uuid: string) {
    for (let name in map) {
        const db = map[name];
        const info = db.infoManager.getMissingInfo(uuid);
        if (info) {
            return info;
        }
    }
    return null;
}
