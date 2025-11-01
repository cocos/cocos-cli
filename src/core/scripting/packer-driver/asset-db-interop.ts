import type { AssetInfo, IAssetInfo, IAssetMeta, QueryAssetsOption } from '../../assets/@types/public';

import { pathToFileURL } from 'url';
import { getDatabaseModuleRootURL } from '../utils/db-module-url';
import { blockAssetUUIDSet, tsScriptAssetCache, TypeScriptAssetInfoCache } from '../shared/cache';
import { resolveFileName } from '../utils/path';
import { DBInfo } from '../../builder/worker/builder/asset-handler/script/build-script';
import { normalize } from 'path';

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
    
    async onAssetChange(
        type: AssetChangeType,
        uuid: string,
        assetInfo: Readonly<AssetInfo>,
        meta: Readonly<IAssetMeta>,
    ) {
        const assetChange: AssetChange = {
            url: getURL(assetInfo),
            uuid,
            filePath: assetInfo.file,
            type,
            isPluginScript: isPluginScript(meta),
        };
        const info = mapperForTypeScriptAssetInfoCache(assetInfo, meta);
        if (type === AssetChangeType.modified) {
            if (!this._tsScriptInfoCache.has(assetInfo.file)) {
                for (const iterator of this._tsScriptInfoCache.values()) {
                    if (iterator.uuid === uuid) {

                        this._tsScriptInfoCache.delete(iterator.filePath);
                        this._tsScriptInfoCache.set(info.filePath, info);
                        (assetChange as ModifiedAssetChange).oldFilePath = iterator.filePath;
                        (assetChange as ModifiedAssetChange).newFilePath = info.filePath;
                        break;
                    }
                }
            }
        }
        if (type === AssetChangeType.add) {

            if (assetInfo.importer === 'typescript' || assetInfo.isDirectory) {
                const deletedItemIndex = this._changeQueue.findIndex(item => item.type === AssetChangeType.remove && item.uuid === uuid);
                if (deletedItemIndex !== -1) {

                    assetChange.type = AssetChangeType.modified;
                    (assetChange as ModifiedAssetChange).oldFilePath = resolveFileName(this._changeQueue[deletedItemIndex].filePath);
                    (assetChange as ModifiedAssetChange).newFilePath = info.filePath;
                    this._changeQueue.splice(deletedItemIndex, 1);
                }
                if (assetInfo.importer === 'typescript') {
                    this._tsScriptInfoCache.set(info.filePath, info);
                }
            }

        }
        if (type === AssetChangeType.remove) {
            this._tsScriptInfoCache.delete(assetInfo.file);
        }
        if (this._blockScriptUUIDSet.has(uuid)) {
            this._blockScriptUUIDSet.delete(uuid);
            return;
        }
        if (!filterForAssetChange(assetInfo)) {
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

export enum AssetChangeType { add, remove, modified }
export enum DBChangeType { add, remove }

export interface AssetChange {
    type: AssetChangeType;
    uuid: UUID;
    filePath: FilePath;
    url: URL;
    isPluginScript: boolean;
}

export interface ModifiedAssetChange extends AssetChange {
    type: AssetChangeType.modified;
    oldFilePath?: FilePath;
    newFilePath?: FilePath;
}

function filterForAssetChange(assetInfo: AssetInfo): boolean {
    if (!(assetInfo.importer === 'javascript' ||
        assetInfo.importer === 'typescript')) {
        return false;
    }

    return true;
}

function mapperForAssetChange(assetInfo: AssetInfo, meta?: IAssetMeta): AssetChange {
    return {
        type: AssetChangeType.add,
        uuid: assetInfo.uuid,
        filePath: assetInfo.file,
        url: getURL(assetInfo),
        isPluginScript: isPluginScript(meta || assetInfo.meta!),
    };
}

function mapperForTypeScriptAssetInfoCache(assetInfo: AssetInfo, meta?: IAssetMeta): TypeScriptAssetInfoCache {
    assetInfo.file = resolveFileName(assetInfo.file);
    return {
        uuid: assetInfo.uuid,
        filePath: assetInfo.file,
        url: getURL(assetInfo),
        isPluginScript: isPluginScript(meta || assetInfo.meta!),
    };
}

function isPluginScript(meta: IAssetMeta) {
    if (meta?.userData?.isPlugin) {
        return true;
    } else {
        return false;
    }
}

function getURL(assetInfo: AssetInfo) {
    return pathToFileURL(assetInfo.file);
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
