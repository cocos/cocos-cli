import { BaseService, register } from './core';
import { IAssetEvents, IAssetService } from '../../common';
import { Asset, assetManager, Component, Node, Prefab } from 'cc';
import { assetWatcherManager } from './asset/asset-watcher';
import { isEditorNode } from './node/node-utils';

@register('Asset')
export class AssetService extends BaseService<IAssetEvents> implements IAssetService {
    /**
     * 主进程监听 asset 事件，所触发事件
     * @param uuid
     */
    public async assetChanged(uuid: string) {
        this.releaseAsset(uuid);
        await assetWatcherManager.onAssetChanged(uuid);
        this.emit('asset:change', uuid);
    }

    /**
     * 主进程监听 asset 事件，所触发事件
     * @param uuid
     */
    public async assetDeleted(uuid: string) {
        assetWatcherManager.onAssetDeleted(uuid);
        this.emit('asset:deleted', uuid);
    }

    public onEditorOpened() {
        assetManager.assetListener.removeAllListeners();
        // iterate all component
        const nodeObject = EditorExtends.Node.getNodes();
        for (const key in nodeObject) {
            const node = nodeObject[key];

            // 场景节点特殊处理
            if (node instanceof cc.Scene) {
                assetWatcherManager.startWatch(node.globals);
            } else {
                if (node && !isEditorNode(node)) {
                    node.components.forEach((component: any) => {
                        assetWatcherManager.startWatch(component);
                    });
                }
            }
        }
    }

    public onNodeChanged(node: Node) {
        node.components.forEach((component) => {
            assetWatcherManager.stopWatch(component);
            assetWatcherManager.startWatch(component);
        });
    }

    public onComponentAdded(comp: Component) {
        assetWatcherManager.startWatch(comp);
    }

    public onComponentRemoved(comp: Component) {
        assetWatcherManager.stopWatch(comp);
    }

    public releaseAsset(assetUUID: string) {
        const asset = assetManager.assets.get(assetUUID);
        if (asset) {
            // Hack: Prefab 需要把引用它的资源一起清除缓存，否则嵌套的 Prefab 不会及时更新
            if (asset instanceof Prefab) {
                // 不可以先释放，会影响后续数据查询，比如 A->B->C，先释放B，那么A依赖查询就会失败
                const list: Asset[] = [];
                assetManager.assets.forEach((cachedAsset, uuid) => {
                    const depsUUIDs = assetManager.dependUtil.getDepsRecursively(uuid);
                    if (asset && depsUUIDs.includes(asset.uuid)){
                        list.push(cachedAsset);
                    }
                });
                list.forEach((cachedAsset) => {
                    assetManager.releaseAsset(cachedAsset);
                });
            }
            assetManager.releaseAsset(asset);
        }
    }
}