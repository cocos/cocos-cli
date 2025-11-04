import type { AssetInfo, IAssetMeta, QueryAssetsOption } from '../../assets/@types/public';

import { pathToFileURL } from 'url';
import { getDatabaseModuleRootURL } from '../utils/db-module-url';
import { blockAssetUUIDSet, tsScriptAssetCache, TypeScriptAssetInfoCache } from '../shared/cache';
import { resolveFileName } from '../utils/path';
import { normalize } from 'path';
import { AssetActionEnum } from '@cocos/asset-db/libs/asset';
import { IAsset } from '../../assets/@types/private';
import { DBInfo } from '../@types/config-export';

export interface QueryAllAssetOption<T = { assetInfo: AssetInfo }> {
    assetDbOptions?: QueryAssetsOption,
    filter?: (assetInfo: AssetInfo, meta?: IAssetMeta) => boolean,
    mapper?: (assetInfo: AssetInfo, meta?: IAssetMeta) => T,
}
export class AssetDbInterop {

    protected readonly _tsScriptInfoCache = tsScriptAssetCache;
    protected readonly _blockScriptUUIDSet = blockAssetUUIDSet;


    removeTsScriptInfoCache(dbTarget: string) {
        const scriptInfos: TypeScriptAssetInfoCache[] = [];
        this._tsScriptInfoCache.forEach(item => {
            if (normalize(item.filePath).startsWith(dbTarget)) {
                scriptInfos.push(item);
                this._tsScriptInfoCache.delete(item.filePath);
            }
        });

        return scriptInfos;
    }

    /**
     * cache ts script info
     * cache format:
     * 
     * const filePath = resolveFileName(assetInfo.file);
     * {
     *     uuid: assetInfo.uuid,
     *     filePath: filePath,
     *     url: getURL(assetInfo),
     *     isPluginScript: isPluginScript(meta || assetInfo.meta!),
     * }
     * */
    setTsScriptInfoCache(tsScriptCaches: TypeScriptAssetInfoCache[]) {
        for (let index = 0; index < tsScriptCaches.length; index++) {
            const info = tsScriptCaches[index];
            this._tsScriptInfoCache.set(info.filePath, info);
        }
    }

    async destroyed() {
        this._tsScriptInfoCache.clear();
    }

    public async queryAssetDomains(dbInfos: DBInfo[]) {
        const assetDatabaseDomains: AssetDatabaseDomain[] = [];
        for (const dbInfo of dbInfos) {
            const dbURL = getDatabaseModuleRootURL(dbInfo.dbID);
            const assetDatabaseDomain: AssetDatabaseDomain = {
                root: new URL(dbURL),
                physical: dbInfo.target,
            };
            if (isPackageDomain(dbInfo.dbID)) {
                assetDatabaseDomain.jail = dbInfo.target;
            }
            assetDatabaseDomains.push(assetDatabaseDomain);
        }
        return assetDatabaseDomains;
    }

    /**
     * 因为时间累计而缓存的资源更改。
     */
    private _changeQueue: AssetChange[] = [];

    /**
     * 当收到资源更改消息后触发。我们会更新资源更改计时器。
     */
    
    onAssetChange(
        type: AssetChangeType,
        asset: IAsset
    ) {
        const filePath = resolveFileName(asset.source);
        const uuid = asset.uuid;
        const assetChange: AssetChange = {
            url: pathToFileURL(filePath),
            uuid: asset.uuid,
            filePath: filePath,
            type,
            isPluginScript: isPluginScript(asset.meta),
        };
        const info = mapperForTypeScriptAssetInfoCache(asset, asset.meta);
        if (type === AssetActionEnum.change) {
            if (!this._tsScriptInfoCache.has(filePath)) {
                for (const iterator of this._tsScriptInfoCache.values()) {
                    if (iterator.uuid === asset.uuid) {

                        this._tsScriptInfoCache.delete(iterator.filePath);
                        this._tsScriptInfoCache.set(info.filePath, info);
                        (assetChange as ModifiedAssetChange).oldFilePath = iterator.filePath;
                        (assetChange as ModifiedAssetChange).newFilePath = info.filePath;
                        break;
                    }
                }
            }
        }
        if (type === AssetActionEnum.add) {
            const importer = asset.meta.importer;
            const isDirectory = asset.isDirectory();

            if (importer === 'typescript' || isDirectory) {
                const deletedItemIndex = this._changeQueue.findIndex(item => item.type === AssetActionEnum.delete && item.uuid === uuid);
                if (deletedItemIndex !== -1) {

                    assetChange.type = AssetActionEnum.change;
                    (assetChange as ModifiedAssetChange).oldFilePath = resolveFileName(this._changeQueue[deletedItemIndex].filePath);
                    (assetChange as ModifiedAssetChange).newFilePath = info.filePath;
                    this._changeQueue.splice(deletedItemIndex, 1);
                }
                if (importer === 'typescript') {
                    this._tsScriptInfoCache.set(info.filePath, info);
                }
            }

        }
        if (type === AssetActionEnum.delete) {
            this._tsScriptInfoCache.delete(filePath);
        }
        if (this._blockScriptUUIDSet.has(uuid)) {
            this._blockScriptUUIDSet.delete(uuid);
            return;
        }
        if (!filterForAssetChange(asset)) {
            return;
        }

        this._changeQueue.push(assetChange);
    }

    getAssetChangeQueue(): AssetChange[] {
        return this._changeQueue;
    }

    resetAssetChangeQueue() {
        this._changeQueue = [];
    }
}


export type AssetChangeType = AssetActionEnum;

export enum DBChangeType { add, remove }

export interface AssetChange {
    type: AssetChangeType;
    uuid: UUID;
    filePath: FilePath;
    url: URL;
    isPluginScript: boolean;
}

export interface ModifiedAssetChange extends AssetChange {
    type: AssetActionEnum.change;
    oldFilePath?: FilePath;
    newFilePath?: FilePath;
}

function filterForAssetChange(asset: IAsset): boolean {
    const importer = asset.meta.importer;
    if (!(importer === 'javascript' || importer === 'typescript')) {
        return false;
    }

    return true;
}

function mapperForTypeScriptAssetInfoCache(asset: IAsset, meta?: IAssetMeta): TypeScriptAssetInfoCache {
    const filePath = resolveFileName(asset.source);
    return {
        uuid: asset.uuid,
        filePath: filePath,
        url: pathToFileURL(filePath),
        isPluginScript: isPluginScript(meta || asset.meta!),
    };
}

function isPluginScript(meta: IAssetMeta) {
    if (meta?.userData?.isPlugin) {
        return true;
    } else {
        return false;
    }
}

export interface AssetDatabaseDomain {
    /**
     * 此域的根 URL。
     */
    root: URL;

    /**
     * 此域的物理路径。
     */
    physical: string;

    /**
     * 此域的物理根路径。如果未指定则为文件系统根路径。
     * 在执行 npm 算法时会使用此字段。
     */
    jail?: string;
}

function isPackageDomain(databaseID: string) {
    return !['assets', 'internal'].includes(databaseID);
}
