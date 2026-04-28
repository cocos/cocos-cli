import { AssetDB, VirtualAsset } from '@cocos/asset-db';
import assetDBManager from './asset-db';
import { url2path, url2uuid } from '../utils';
import EventEmitter from 'events';
import { AssetManagerEvents, IAsset, IAssetInfo, IAssetDBInfo } from '../@types/private';
import type { ThumbnailInfo, ThumbnailSize } from '../@types/protected/asset-handler';
import assetQuery from './query';
import assetOperation from './operation';
import assetHandlerManager from './asset-handler';

/**
 * 对外暴露一系列的资源查询、操作接口等
 * 对外暴露资源的一些变动广播消息、事件消息
 */
class AssetManager extends EventEmitter {
    // --------- query ---------
    queryAssets = assetQuery.queryAssets.bind(assetQuery);
    queryAssetDependencies = assetQuery.queryAssetDependencies.bind(assetQuery);
    queryAssetUsers = assetQuery.queryAssetUsers.bind(assetQuery);
    queryAsset = assetQuery.queryAsset.bind(assetQuery);
    queryAssetInfo = assetQuery.queryAssetInfo.bind(assetQuery);
    queryAssetInfoByUUID = assetQuery.queryAssetInfoByUUID.bind(assetQuery);
    queryAssetInfos = assetQuery.queryAssetInfos.bind(assetQuery);
    querySortedPlugins = assetQuery.querySortedPlugins.bind(assetQuery);
    queryUUID = assetQuery.queryUUID.bind(assetQuery);
    queryPath = assetQuery.queryPath.bind(assetQuery);
    queryUrl = assetQuery.queryUrl.bind(assetQuery);
    generateAvailableURL = assetQuery.generateAvailableURL.bind(assetQuery);
    queryDBAssetInfo = assetQuery.queryDBAssetInfo.bind(assetQuery);
    encodeAsset = assetQuery.encodeAsset.bind(assetQuery);
    queryAssetProperty = assetQuery.queryAssetProperty.bind(assetQuery);
    queryAssetMeta = assetQuery.queryAssetMeta.bind(assetQuery);
    queryAssetMtime = assetQuery.queryAssetMtime.bind(assetQuery);
    // ---------- operation ---------
    importAsset = assetOperation.importAsset.bind(assetOperation);
    saveAssetMeta = assetOperation.saveAssetMeta.bind(assetOperation);
    saveAsset = assetOperation.saveAsset.bind(assetOperation);
    createAsset = assetOperation.createAsset.bind(assetOperation);
    refreshAsset = assetOperation.refreshAsset.bind(assetOperation);
    reimportAsset = assetOperation.reimportAsset.bind(assetOperation);
    renameAsset = assetOperation.renameAsset.bind(assetOperation);
    removeAsset = assetOperation.removeAsset.bind(assetOperation);
    moveAsset = assetOperation.moveAsset.bind(assetOperation);
    generateExportData = assetOperation.generateExportData.bind(assetOperation);
    outputExportData = assetOperation.outputExportData.bind(assetOperation);
    createAssetByType = assetOperation.createAssetByType.bind(assetOperation);
    updateUserData = assetOperation.updateUserData.bind(assetOperation);

    // ----------- assetHandlerManager ------------
    queryAssetConfigMap = assetHandlerManager.queryAssetConfigMap.bind(assetHandlerManager);
    updateDefaultUserData = assetHandlerManager.updateDefaultUserData.bind(assetHandlerManager);
    getCreateMap = assetHandlerManager.getCreateMap.bind(assetHandlerManager);
    queryAssetUserDataConfig = assetHandlerManager.queryUserDataConfig.bind(assetHandlerManager);
    queryThumbnailHandlers = assetHandlerManager.queryThumbnailHandlers.bind(assetHandlerManager);

    async generateThumbnail(urlOrUUIDOrPath: string, size?: ThumbnailSize): Promise<ThumbnailInfo | null> {
        const asset = this.queryAsset(urlOrUUIDOrPath);
        if (!asset) { return null; }
        return assetHandlerManager.generateThumbnail(asset, size);
    }
    getEffectBinPath() {
        return assetHandlerManager.getEffectBinPath();
    };

    url2uuid(url: string) {
        return url2uuid(url);
    }
    url2path(url: string) {
        return url2path(url);
    }
    path2url(url: string, dbName?: string) {
        return assetDBManager.path2url(url, dbName);
    }

    // ------------- 监听方法 ------------
    /**
     * 监听资源添加事件
     * @param listener 回调函数
     * @returns 移除监听的函数
     */
    onAssetAdded(listener: (info: IAssetInfo) => void): () => void {
        this.on('onAssetAdded', listener);
        return () => {
            this.removeListener('onAssetAdded', listener);
        };
    }

    /**
     * 监听资源变更事件
     * @param listener 回调函数
     * @returns 移除监听的函数
     */
    onAssetChanged(listener: (info: IAssetInfo) => void): () => void {
        this.on('onAssetChanged', listener);
        return () => {
            this.removeListener('onAssetChanged', listener);
        };
    }

    /**
     * 监听资源删除事件
     * @param listener 回调函数
     * @returns 移除监听的函数
     */
    onAssetRemoved(listener: (info: IAssetInfo) => void): () => void {
        this.on('onAssetRemoved', listener);
        return () => {
            this.removeListener('onAssetRemoved', listener);
        };
    }

    // ------------- 实例化方法 ------------
    async init() {
        assetDBManager.on('db-created', this._onAssetDBCreated);
        assetDBManager.on('db-removed', this._onAssetDBRemoved);
        // 当所有数据库 ready 后，移除启动阶段的进度追踪监听器
        assetDBManager.once('assets:ready', () => {
            this._removeProgressListeners();
        });
    }

    destroyed() {
        assetDBManager.removeListener('db-created', this._onAssetDBCreated);
        assetDBManager.removeListener('db-removed', this._onAssetDBRemoved);
    }

    /**
     * 从资源对象提取变更信息
     * @param asset 资源对象
     * @returns 资源变更信息
     */
    private _extractAssetChangeInfo(asset: IAsset): IAssetInfo | null {
        if (!asset || !asset.uuid) {
            return null;
        }
        return assetManager.queryAssetInfo(asset.uuid);
    }

    private _snapshotAssetChangeInfo(asset: IAsset): IAssetInfo | null {
        if (!asset || !asset.uuid) {
            return null;
        }
        return assetQuery.encodeAsset(asset, ['subAssets', 'displayName'], true);
    }

    _onAssetDBCreated(db: AssetDB) {
        db.on('unresponsive', onUnResponsive);
        // 启动阶段的进度追踪监听器（只有在 ready 前创建的 db 才需要，且 ready 后会被统一移除）
        if (!assetDBManager.ready) {
            db.on('add', assetManager._onAssetAdd);
            db.on('change', assetManager._onAssetChange);
            db.on('delete', assetManager._onAssetDelete);
        }
        // 正常运行时的事件监听器（一直保留）
        db.on('added', assetManager._onAssetAdded);
        db.on('changed', assetManager._onAssetChanged);
        db.on('deleted', assetManager._onAssetDeleted);
    }

    _onAssetDBRemoved(db: AssetDB) {
        db.removeListener('unresponsive', onUnResponsive);
        // 移除启动阶段的进度追踪监听器
        db.removeListener('add', assetManager._onAssetAdd);
        db.removeListener('change', assetManager._onAssetChange);
        db.removeListener('delete', assetManager._onAssetDelete);
        // 移除正常运行时的事件监听器
        db.removeListener('added', assetManager._onAssetAdded);
        db.removeListener('changed', assetManager._onAssetChanged);
        db.removeListener('deleted', assetManager._onAssetDeleted);
    }

    /**
     * 移除所有数据库的启动阶段进度追踪监听器
     * 在 ready 后调用，清理不再需要的监听器
     */
    private _removeProgressListeners() {
        for (const name in assetDBManager.assetDBMap) {
            const db = assetDBManager.assetDBMap[name];
            if (db) {
                db.removeListener('add', assetManager._onAssetAdd);
                db.removeListener('change', assetManager._onAssetChange);
                db.removeListener('delete', assetManager._onAssetDelete);
            }
        }
    }

    private _getImportState(asset: IAsset, defaultState: 'processing' | 'success' | 'failed') {
        if (asset.invalid || asset.importError) {
            return 'failed';
        }
        return defaultState;
    }

    private _emitProgress(asset: IAsset, state: 'processing' | 'success' | 'failed') {
        let globalCurrent = 0;
        let globalTotal = 0;
        
        // 汇总所有数据库的进度
        for (const name in assetDBManager.assetDBMap) {
            const db = assetDBManager.assetDBMap[name];
            if (db && db.assetProgressInfo) {
                globalCurrent += db.assetProgressInfo.current || 0;
                globalTotal += db.assetProgressInfo.total || 0;
            }
        }
        
        this.emit('progress', globalCurrent, globalTotal, asset.url, this._getImportState(asset, state));
    }

    _onAssetAdd = async (asset: IAsset) => {
        this._emitProgress(asset, 'processing');
    }
    _onAssetChange = async (asset: IAsset) => {
        this._emitProgress(asset, 'processing');
    }
    _onAssetDelete = async (asset: IAsset) => {
        this._emitProgress(asset, 'processing');
    }

    _onAssetAdded = async (asset: IAsset) => {
        if (assetDBManager.ready) {
            this.emit('asset-add', asset);
            this.emit('onAssetAdded', this._extractAssetChangeInfo(asset));
            console.log(`asset-add ${asset.url}`);
            return;
        }
        this._emitProgress(asset, 'success');
    }
    _onAssetChanged = async (asset: IAsset) => {
        if (assetDBManager.ready) {
            this.emit('asset-change', asset);
            this.emit('onAssetChanged', this._extractAssetChangeInfo(asset));
            console.log(`asset-change ${asset.url}`);
            return;
        }
        this._emitProgress(asset, 'success');
    }
    _onAssetDeleted = async (asset: IAsset) => {
        if (assetDBManager.ready) {
            const removedInfo = this._snapshotAssetChangeInfo(asset);
            await assetHandlerManager.destroyAsset(asset);
            this.emit('asset-delete', asset);
            this.emit('onAssetRemoved', removedInfo);
            console.log(`asset-delete ${asset.url}`);
            return;
        }
        this._emitProgress(asset, 'success');
    }

    /**
     * 注册数据库初始化完全完成后的事件监听。
     * 
     * **注意事项 (Notice)**:
     * - 触发此事件代表**所有**注册的资源数据库都已经完全导入并初始化完成（启动阶段结束）。
     * - 第一次 ready 后，将不再有 progress 进度消息。
     * - ready 后会自动移除启动阶段的进度追踪监听器（add/change/delete），这些监听器仅在启动阶段用于进度追踪。
     * 
     * @param listener 回调函数
     * @returns 移除监听的函数
     */
    onReady(listener: () => void) {
        assetDBManager.on('assets:ready', listener);
        return () => {
            assetDBManager.removeListener('assets:ready', listener);
        };
    }

    /**
     * 注册单个数据库启动完成后的事件监听。
     * 
     * **注意事项 (Notice)**:
     * - 这个事件可能会被触发多次（如果项目存在多个子数据库，如 `assets`, `internal`）。
     * - 主要用于需要做更精细化并行控制的上层逻辑，通常情况下普通的业务逻辑不需要关心此事件，直接监听 `onReady` 即可。
     * 
     * @param listener 回调函数，接收启动完成的 dbInfo
     * @returns 移除监听的函数
     */
    onDBReady(listener: (dbInfo: IAssetDBInfo) => void) {
        assetDBManager.on('assets:db-ready', listener);
        return () => {
            assetDBManager.removeListener('assets:db-ready', listener);
        };
    }

    /**
     * 注册初始化过程中的进度监听。
     * 
     * **注意事项 (Notice)**:
     * - **仅在启动阶段有效**。一旦触发过一次 `ready` 事件（即启动阶段结束），将不再会有新的进度消息。
     * - 启动时的资源冷导入会抛出密集的进度信息，建议在 UI 层面进行适当的节流（throttle）渲染。
     * 
     * @param listener 回调函数，包含当前进度、总数、当前处理的资源 url 以及导入状态
     * @returns 移除监听的函数
     */
    onProgress(listener: (current: number, total: number, url: string, state: 'processing' | 'success' | 'failed') => void) {
        this.on('progress', listener);
        return () => {
            this.removeListener('progress', listener);
        };
    }
}

const assetManager = new AssetManager();

// 创建带有事件类型约束的 AssetManager 类型
export interface TypedAssetManager extends EventEmitter {
    // 事件监听方法（带类型约束）
    on<K extends keyof AssetManagerEvents>(event: K, listener: AssetManagerEvents[K]): this;
    once<K extends keyof AssetManagerEvents>(event: K, listener: AssetManagerEvents[K]): this;
    emit<K extends keyof AssetManagerEvents>(event: K, ...args: Parameters<AssetManagerEvents[K]>): boolean;
    removeListener<K extends keyof AssetManagerEvents>(event: K, listener: AssetManagerEvents[K]): this;
    removeAllListeners<K extends keyof AssetManagerEvents>(event?: K): this;
    listeners<K extends keyof AssetManagerEvents>(event: K): Function[];
    listenerCount<K extends keyof AssetManagerEvents>(event: K): number;

    // 专门的监听方法
    onAssetAdded(listener: (info: IAssetInfo) => void): () => void;
    onAssetChanged(listener: (info: IAssetInfo) => void): () => void;
    onAssetRemoved(listener: (info: IAssetInfo) => void): () => void;

    // 原有的方法
    queryAssets: typeof assetQuery.queryAssets;
    queryAssetDependencies: typeof assetQuery.queryAssetDependencies;
    queryAssetUsers: typeof assetQuery.queryAssetUsers;
    queryAsset: typeof assetQuery.queryAsset;
    queryAssetInfo: typeof assetQuery.queryAssetInfo;
    queryAssetInfoByUUID: typeof assetQuery.queryAssetInfoByUUID;
    queryAssetInfos: typeof assetQuery.queryAssetInfos;
    querySortedPlugins: typeof assetQuery.querySortedPlugins;
    queryUUID: typeof assetQuery.queryUUID;
    queryPath: typeof assetQuery.queryPath;
    queryUrl: typeof assetQuery.queryUrl;
    generateAvailableURL: typeof assetQuery.generateAvailableURL;
    queryDBAssetInfo: typeof assetQuery.queryDBAssetInfo;
    encodeAsset: typeof assetQuery.encodeAsset;
    queryAssetProperty: typeof assetQuery.queryAssetProperty;
    queryAssetMeta: typeof assetQuery.queryAssetMeta;
    queryAssetMtime: typeof assetQuery.queryAssetMtime;

    importAsset: typeof assetOperation.importAsset;
    saveAssetMeta: typeof assetOperation.saveAssetMeta;
    saveAsset: typeof assetOperation.saveAsset;
    createAsset: typeof assetOperation.createAsset;
    refreshAsset: typeof assetOperation.refreshAsset;
    reimportAsset: typeof assetOperation.reimportAsset;
    renameAsset: typeof assetOperation.renameAsset;
    removeAsset: typeof assetOperation.removeAsset;
    moveAsset: typeof assetOperation.moveAsset;
    generateExportData: typeof assetOperation.generateExportData;
    outputExportData: typeof assetOperation.outputExportData;
    createAssetByType: typeof assetOperation.createAssetByType;
    updateUserData: typeof assetOperation.updateUserData;

    queryAssetConfigMap: typeof assetHandlerManager.queryAssetConfigMap;
    updateDefaultUserData: typeof assetHandlerManager.updateDefaultUserData;
    getCreateMap: typeof assetHandlerManager.getCreateMap;
    queryAssetUserDataConfig: typeof assetHandlerManager.queryUserDataConfig;
    queryThumbnailHandlers: typeof assetHandlerManager.queryThumbnailHandlers;
    getEffectBinPath: typeof assetHandlerManager.getEffectBinPath;

    generateThumbnail(urlOrUUIDOrPath: string, size?: ThumbnailSize): Promise<ThumbnailInfo | null>;

    onReady: typeof assetManager.onReady;
    onDBReady: typeof assetManager.onDBReady;
    onProgress: typeof assetManager.onProgress;

    url2uuid(url: string): string;
    url2path(url: string): string;
    path2url(url: string, dbName?: string): string;

    init(): Promise<void>;
    destroyed(): void;
}

// 类型断言，将实例转换为带类型约束的接口
const typedAssetManager = assetManager as TypedAssetManager;

export default typedAssetManager;
(globalThis as any).assetManager = typedAssetManager;
// --------------- event handler -------------------

async function onUnResponsive(asset: VirtualAsset) {
    if (assetDBManager.ready) {
        // 当打开项目后，导入超时的时候，弹出弹窗
        console.error(`Resource import Timeout.\n  uuid: ${asset.uuid}\n  url: ${asset.url}`);
    } else {
        console.debug('import asset unresponsive');
        // 正在打开项目的时候，超时了，需要在窗口上显示超时
        // const current = asset._taskManager._execID - asset._taskManager._execThread;
        // Task.updateSyncTask(
        //     'import-asset',
        //     i18n.translation('asset-db.mask.loading'),
        //     `${queryUrl(asset.source)}\n(${current}/${asset._taskManager.total()})`
        // );
    }
}
