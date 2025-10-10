import type { AssetInfo, IAssetInfo, IAssetMeta, QueryAssetsOption } from '../../assets/@types/public';
import { asserts } from '../utils/asserts';
import { setTimeout } from 'timers';
import { pathToFileURL } from 'url';
import { getDatabaseModuleRootURL } from '../utils/db-module-url';
import { blockAssetUUIDSet, assetInfoCache, AssetInfoCache } from '../shared/cache';
import { resolveFileName } from '../utils/path';
import { IAssetDBInfo } from '../../assets/@types/private';
import { normalize } from '../../base/utils/path';

export interface QueryAllAssetOption<T = { assetInfo: AssetInfo }> {
    assetDbOptions?: QueryAssetsOption,
    filter?: (assetInfo: AssetInfo, meta?: IAssetMeta) => boolean,
    mapper?: (assetInfo: AssetInfo, meta?: IAssetMeta) => T,
}
export class AssetDbInterop {

    protected readonly _assetInfoCache = assetInfoCache;
    protected readonly _blockScriptUUIDSet = blockAssetUUIDSet;
    protected _assetChangeTimeOut: NodeJS.Timeout | undefined;
    private _hasInit = false;

    constructor(
        onChangeHandler: OnChangeHandler,
    ) {
        this._handler = onChangeHandler;
        this._assetChangeTimer = new AccumulatingTimer(this._waitTimeoutMs, () => {
            this._onAssetChangeTimerArrived();
        });
    }

    async init() {
        if (this._hasInit) {
            return;
        }

        this._hasInit = true;
    }

    async destroyed() {
        this._hasInit = false;
    }

    public async fetch(dbName: string) {
        return await this.fetchAssetDb({
            assetDbOptions: {
                ccType: 'cc.Script',
                pattern: `db://${dbName}/**/*.ts`,
            },
            filter: filterForAssetChange,
            mapper: mapperForAssetChange,
        });
    }

    /** 同步所有 assetChange 和 脚本缓存 */
    public async fetchAll() {
        await this.fetchAllTypescripts();
        return await this.fetchAssetDb({
            assetDbOptions: {
                ccType: 'cc.Script',
            },
            filter: filterForAssetChange,
            mapper: mapperForAssetChange,
        });
    }

    public async fetchAllTypescripts() {
        const scriptInfos = await this.fetchAssetDb({
            assetDbOptions: {
                importer: 'typescript',
            },
            mapper: mapperForAssetInfoCache,
        });
        for (let index = 0; index < scriptInfos.length; index++) {
            const info = scriptInfos[index];
            assetInfoCache.set(info.filePath, info);
        }
    }
    public async onMountDatabase(dbInfo: IAssetDBInfo): Promise<AssetInfoCache[]> {
        const pattern = `db://${dbInfo.name}/**/*.ts`;

        const scriptInfos = await this.fetchAssetDb({
            assetDbOptions: {
                importer: 'typescript',
                pattern,
            },
            mapper: mapperForAssetInfoCache,
        });

        for (let index = 0; index < scriptInfos.length; index++) {
            const info = scriptInfos[index];
            assetInfoCache.set(info.filePath, info);
        }

        return scriptInfos;
    }
    public async onUnmountDatabase(dbInfo: IAssetDBInfo): Promise<AssetInfoCache[]> {
        const scriptInfos: AssetInfoCache[] = [];
        assetInfoCache.forEach(item => {
            if (normalize(item.filePath).startsWith(dbInfo.target)) {
                scriptInfos.push(item);
                assetInfoCache.delete(item.filePath);
            }
        });

        return scriptInfos;
    }
    public async queryAssetDomains() {
        const dbInfos = (globalThis as any).assetDBManager.assetDBInfo as Record<string, IAssetDBInfo>;
        const assetDatabaseDomains: AssetDatabaseDomain[] = [];
        for (const dbInfo of Object.values(dbInfos)) {
            const dbURL = getDatabaseModuleRootURL(dbInfo.name);
            const assetDatabaseDomain: AssetDatabaseDomain = {
                root: new URL(dbURL),
                physical: dbInfo.target,
            };
            if (isPackageDomain(dbInfo.name)) {
                // const packageInfos = Editor.Package.getPackages({ name: dbID });
                // asserts(packageInfos.length === 1, `Database ${dbID} is enabled but lack of package info.`);
                // const packageInfo = packageInfos[packageInfos.length - 1];
                assetDatabaseDomain.jail = dbInfo.target;
            }
            assetDatabaseDomains.push(assetDatabaseDomain);
        }
        return assetDatabaseDomains;
    }

    public async fetchAssetDb<T = { assetInfo: AssetInfo }>(options?: QueryAllAssetOption<T>): Promise<T[]> {
        const results: T[] = [];
        const mapper = (options?.mapper ?? ((assetInfo: AssetInfo) => { return { assetInfo }; })) as (assetInfo: AssetInfo) => T;
        const assetInfos = await (globalThis as any).assetManager.queryAssetInfos(options?.assetDbOptions, ['meta', 'url', 'file', 'importer', 'type']) as IAssetInfo[];
        if (!assetInfos || !assetInfos.length) {
            // db 尚未 ready 之前是无法查询到信息的
            return results;
        }
        await Promise.all(assetInfos.map(async (scriptAssetInfo) => {
            if (!options?.filter || options?.filter(scriptAssetInfo as AssetInfo)) {
                const result = await mapper(scriptAssetInfo as AssetInfo);
                results.push(result);
            }
        }));
        return results;
    }

    private _waitTimeoutMs = 10;

    private _handler: OnChangeHandler;

    private _assetChangeTimer: AccumulatingTimer;

    /**
     * 因为时间累计而缓存的资源更改。
     */
    private _changeQueue: AssetChange[] = [];

    /**
     * 当收到资源更改消息后触发。我们会更新资源更改计时器。
     */
    private async _onAssetChange(
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
        const info = mapperForAssetInfoCache(assetInfo, meta);
        if (type === AssetChangeType.modified) {
            if (!this._assetInfoCache.has(assetInfo.file)) {
                for (const iterator of this._assetInfoCache.values()) {
                    if (iterator.uuid === uuid) {

                        this._assetInfoCache.delete(iterator.filePath);
                        this._assetInfoCache.set(info.filePath, info);
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
                    this._assetInfoCache.set(info.filePath, info);
                }
            }

        }
        if (type === AssetChangeType.remove) {
            this._assetInfoCache.delete(assetInfo.file);
        }
        if (this._blockScriptUUIDSet.has(uuid)) {
            this._blockScriptUUIDSet.delete(uuid);
            return;
        }
        if (!filterForAssetChange(assetInfo)) {
            return;
        }

        this._changeQueue.push(assetChange);

        this._assetChangeTimer.refresh();
    }

    /**
     * 当资源更改计时器的时间到了之后，我们发起一次构建请求。
     */
    private _onAssetChangeTimerArrived() {
        const changes = this._changeQueue;
        this._changeQueue = [];
        this._handler(changes);
    }
}

export enum AssetChangeType { add, remove, modified }

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
type OnChangeHandler = (changes: ReadonlyArray<AssetChange>) => void;
export type onTypescriptMoveHandler = (oldFilePath: string, newFilePath: string) => Promise<void>;
type RemoveFirst<T> = T extends [infer Head, ...infer Tail] ? [...Tail] : T;

class AccumulatingTimer {
    constructor(waitTimeoutMs: number, callback: () => void) {
        this._waitTimeoutMs = waitTimeoutMs;
        this._callback = callback;
    }

    public refresh() {
        if (this._timeout) {
            this._timeout.refresh();
        } else {
            this._timeout = setTimeout(async () => {
                this._callback();
                asserts(this._timeout);
                clearTimeout(this._timeout);
                this._timeout = undefined;
            }, this._waitTimeoutMs);
        }
    }

    private _waitTimeoutMs: number;
    private _timeout: NodeJS.Timeout | undefined = undefined;
    private _callback: () => void;
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

function mapperForAssetInfoCache(assetInfo: AssetInfo, meta?: IAssetMeta): AssetInfoCache {
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
