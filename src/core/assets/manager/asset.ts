import { AssetDB, VirtualAsset } from '@cocos/asset-db';
import assetDBManager from './asset-db';
import { url2path, url2uuid } from '../utils';
import EventEmitter from 'events';
import { IAsset } from '../@types/private';
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
    queryIconConfigMap = assetHandlerManager.queryIconConfigMap.bind(assetHandlerManager);
    queryAssetConfigMap = assetHandlerManager.queryAssetConfigMap.bind(assetHandlerManager);
    updateDefaultUserData = assetHandlerManager.updateDefaultUserData.bind(assetHandlerManager);
    getCreateMap = assetHandlerManager.getCreateMap.bind(assetHandlerManager);
    queryAssetUserDataConfig = assetHandlerManager.queryUserDataConfig.bind(assetHandlerManager);

    url2uuid(url: string) {
        return url2uuid(url);
    }
    url2path(url: string) {
        return url2path(url);
    }
    path2url(url: string, dbName?: string) {
        return assetDBManager.path2url(url, dbName);
    }

    // ------------- 实例化方法 ------------
    async init() {
        assetDBManager.on('db-created', this._onAssetDBCreated);
        assetDBManager.on('db-removed', this._onAssetDBRemoved);
    }

    destroyed() {
        assetDBManager.removeListener('db-created', this._onAssetDBCreated);
        assetDBManager.removeListener('db-removed', this._onAssetDBRemoved);
    }

    _onAssetDBCreated(db: AssetDB) {
        db.on('unresponsive', onUnResponsive);
        db.on('added', assetManager._onAssetAdded.bind(assetManager));
        db.on('changed', assetManager._onAssetChanged.bind(assetManager));
        db.on('deleted', assetManager._onAssetDeleted.bind(assetManager));

        db.on('add', assetManager._onAssetAdded.bind(assetManager));
        db.on('delete', assetManager._onAssetDeleted.bind(assetManager));
        db.on('change', assetManager._onAssetChanged.bind(assetManager));
    }

    _onAssetDBStarted(db: AssetDB) {
        // 移除一些仅进度条使用的监听
        db.removeListener('add', assetManager._onAssetAdded.bind(assetManager));
        db.removeListener('change', assetManager._onAssetChanged.bind(assetManager));
        db.removeListener('delete', assetManager._onAssetDeleted.bind(assetManager));
    }
    _onAssetDBRemoved(db: AssetDB) {
        db.removeListener('unresponsive', onUnResponsive);
        db.removeListener('added', assetManager._onAssetAdded.bind(assetManager));
        db.removeListener('changed', assetManager._onAssetChanged.bind(assetManager));
        db.removeListener('deleted', assetManager._onAssetDeleted.bind(assetManager));
    }

    async _onAssetAdded(asset: IAsset) {
        if (assetDBManager.ready) {
            this.emit('asset-add', asset);
            console.log(`asset-add ${asset.url}`);
            return;
        }
    }
    async _onAssetChanged(asset: IAsset) {
        if (assetDBManager.ready) {
            this.emit('asset-change', asset);
            console.log(`asset-change ${asset.url}`);
            return;
        }
    }
    async _onAssetDeleted(asset: IAsset) {
        if (assetDBManager.ready) {
            this.emit('asset-delete', asset);
            console.log(`asset-delete ${asset.url}`);
            return;
        }
    }
}

const assetManager = new AssetManager();
export default assetManager;
(globalThis as any).assetManager = assetManager;
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