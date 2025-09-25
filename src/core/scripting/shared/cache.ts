/// 这个模块存放公用的缓存

import { AssetInfo, IAssetMeta } from '../../assets/@types/public';

export interface TypescriptAssetInfo{
    assetInfo: AssetInfo;
    meta: IAssetMeta;
}

export interface AssetInfoCache {
    version?: MTime,
    content?: string,

    filePath: string,
    uuid: string,
    isPluginScript: boolean,
    url: Readonly<URL>;
}

export interface FileInfo {
    version?: string,
    content?: string,
    filePath: string,
    uuid: string,
}

/** 与脚本解析相关的所有资源的缓存*/
export const assetInfoCache: Map<FilePath, AssetInfoCache> = new Map();
export const blockAssetUUIDSet = new Set<UUID>();
