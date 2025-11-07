import type { AssetInfo, IAssetMeta, QueryAssetsOption } from '../../assets/@types/public';

import { pathToFileURL } from 'url';
import { getDatabaseModuleRootURL } from '../utils/db-module-url';
import { tsScriptAssetCache, TypeScriptAssetInfoCache } from '../shared/cache';
import { resolveFileName } from '../utils/path';
import { normalize } from 'path';
import { AssetActionEnum } from '@cocos/asset-db/libs/asset';
import { DBInfo } from '../@types/config-export';

export interface QueryAllAssetOption<T = { assetInfo: AssetInfo }> {
    assetDbOptions?: QueryAssetsOption,
    filter?: (assetInfo: AssetInfo, meta?: IAssetMeta) => boolean,
    mapper?: (assetInfo: AssetInfo, meta?: IAssetMeta) => T,
}
export class AssetDbInterop {

    protected readonly _tsScriptInfoCache = tsScriptAssetCache;


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
        changeInfo: AssetChangeInfo
    ) {
        const filePath = resolveFileName(changeInfo.filePath);
        const uuid = changeInfo.uuid;
        const assetChange: AssetChange = {
            url: pathToFileURL(filePath),
            importer: changeInfo.importer,
            uuid: uuid,
            filePath: filePath,
            type: changeInfo.type === AssetActionEnum.none ? AssetActionEnum.change : changeInfo.type,
            isPluginScript: isPluginScript(changeInfo.userData),
        };
        
        const importer = changeInfo.importer;
        if (!(importer === 'javascript' || importer === 'typescript')) {
            return;
        }
        let info : TypeScriptAssetInfoCache | null = null;
        if (importer === 'typescript') {
            info = mapperForTypeScriptAssetInfoCache(changeInfo);
        }
        if (!info) {
            this._changeQueue.push(assetChange);
            return;
        }
         
        if (changeInfo.type === AssetActionEnum.change) {
            if (!this._tsScriptInfoCache.has(filePath)) {
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
        if (changeInfo.type === AssetActionEnum.add) {
            if (importer === 'typescript') {
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
        if (changeInfo.type === AssetActionEnum.delete) {
            this._tsScriptInfoCache.delete(filePath);
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

export interface AssetChangeInfo {
    type: AssetChangeType;
    uuid: string;
    filePath: string;
    importer: string;
    userData: Object;
}

export interface AssetChange {
    type: AssetChangeType;
    uuid: UUID;
    filePath: FilePath;
    importer: string;
    url: URL;
    isPluginScript: boolean;
}

export interface ModifiedAssetChange extends AssetChange {
    type: AssetActionEnum.change;
    oldFilePath?: FilePath;
    newFilePath?: FilePath;
}

function mapperForTypeScriptAssetInfoCache(changeInfo: AssetChangeInfo): TypeScriptAssetInfoCache {
    const filePath = resolveFileName(changeInfo.filePath);
    return {
        uuid: changeInfo.uuid,
        filePath: filePath,
        url: pathToFileURL(filePath),
        isPluginScript: isPluginScript(changeInfo.userData),
    };
}

function isPluginScript(userData: any) {
    if (userData?.isPlugin) {
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
