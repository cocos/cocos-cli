import { BaseService, register, Service, ServiceEvents } from './core';
import { Component, instantiate, Node, Scene } from 'cc';
import { componentOperation } from './prefab/component';
import { nodeOperation } from './prefab/node';
import { prefabUtils } from './prefab/utils';
import type {
    IApplyPrefabChangesParams,
    IChangeNodeOptions,
    ICreatePrefabFromNodeParams,
    IGetPrefabInfoParams,
    IIsPrefabInstanceParams,
    INode,
    IPrefabEvents,
    IPrefabInfo,
    IPrefabService,
    IRevertToPrefabParams,
    IUnpackPrefabInstanceParams,
} from '../../common';
import { validateCreatePrefabParams, validateNodePathParams } from './prefab/validate-params';
import { sceneUtils } from './scene/utils';
import { Rpc } from '../rpc';

@register('Prefab')
export class PrefabService extends BaseService<IPrefabEvents> implements IPrefabService {

    private _softReloadTimer: any = null;
    private _utils = prefabUtils;

    public init() { }

    /**
     * 将节点转换为预制体资源
     */
    async createPrefabFromNode(params: ICreatePrefabFromNodeParams): Promise<INode> {
        try {

            validateCreatePrefabParams(params);

            const nodeUuid = EditorExtends.Node.getNodeUuidByPathOrThrow(params.nodePath);

            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [params.dbURL]);
            if (!params.overwrite && assetInfo && assetInfo.type === 'cc.Prefab') {
                throw new Error(`已有同名 ${assetInfo.url} 预制体`);
            }

            const node: Node | null = await this.createPrefabAssetFromNode(nodeUuid, params.dbURL, {
                overwrite: !!params.overwrite,
                undo: true,
            });

            if (!node) {
                throw new Error('创建预制体资源失败，返回结果为 null');
            }
            return sceneUtils.generateNodeInfo(node, false);
        } catch (e) {
            console.error(`创建预制体失败: 节点路径: ${params.nodePath} 资源 URL: ${params.dbURL} 错误信息:`, e);
            throw e;
        }
    }

    /**
     * 将节点的修改应用回预制体资源
     */
    async applyPrefabChanges(params: IApplyPrefabChangesParams): Promise<boolean> {
        try {
            validateNodePathParams(params);

            const node = EditorExtends.Node.getNodeByPathOrThrow(params.nodePath);
            const prefabInfo = prefabUtils.getPrefab(node);
            if (!prefabInfo) {
                throw new Error(`该节点 '${params.nodePath}' 不是预制体`);
            }

            await this.applyPrefab(node.uuid);
            return true;
        } catch (e) {
            console.error(`应用回预制体资源失败: 节点路径: ${params.nodePath} 错误信息:`, e);
            throw e;
        }
    }

    /**
     * 重置节点到预制体原始状态
     */
    async revertToPrefab(params: IRevertToPrefabParams): Promise<boolean> {
        try {
            validateNodePathParams(params);
            const node = EditorExtends.Node.getNodeByPathOrThrow(params.nodePath);
            return await this.revertPrefab(node);
        } catch (e) {
            console.error(`重置节点到预制体原始状态失败：节点路径 ${params.nodePath} 错误信息:`, e);
            throw e;
        }
    }

    /**
     * 解耦预制体实例，使其成为普通节点
     */
    async unpackPrefabInstance(params: IUnpackPrefabInstanceParams): Promise<INode> {
        try {
            validateNodePathParams(params);
            const node = EditorExtends.Node.getNodeByPathOrThrow(params.nodePath);

            if (!prefabUtils.getPrefab(node)?.instance) {
                throw new Error(`${params.nodePath} 是普通节点`);
            }

            this.unWrapPrefabInstance(node.uuid, !!params.recursive);
            return sceneUtils.generateNodeInfo(node, true);
        } catch (e) {
            console.error(`解耦为普通节点失败：节点路径 ${params.nodePath} 是否递归: ${params.recursive} 错误信息:`, e);
            throw e;
        }
    }

    /**
     * 检查节点是否为预制体实例
     */
    async isPrefabInstance(params: IIsPrefabInstanceParams): Promise<boolean> {
        try {
            const node = EditorExtends.Node.getNodeByPathOrThrow(params.nodePath);
            return !!prefabUtils.getPrefab(node)?.instance;
        } catch (e) {
            console.error(`检查节点是否预制体实例失败：节点路径 ${params.nodePath} 错误信息:`, e);
            throw e;
        }
    }

    /**
     * 获取节点的预制体信息
     */
    async getPrefabInfo(params: IGetPrefabInfoParams): Promise<IPrefabInfo | null> {
        try {
            const node = EditorExtends.Node.getNodeByPathOrThrow(params.nodePath);
            const prefabInfo = prefabUtils.getPrefab(node);
            if (!prefabInfo) {
                return null;
            }
            return sceneUtils.generatePrefabInfo(prefabInfo) as IPrefabInfo;
        } catch (e) {
            console.error(`获取节点的预制体信息失败：节点路径 ${params.nodePath} 错误信息:`, e);
            throw e;
        }
    }

    /////////////////////////
    // node operation
    ////////////////////////
    public onEditorOpened() {
        nodeOperation.onSceneOpened();
    }

    public onNodeRemoved(node: Node) {
        nodeOperation.onNodeRemoved(node);
    }

    public onNodeChangedInGeneralMode(node: Node, opts: IChangeNodeOptions, root: Node | Scene | null) {
        nodeOperation.onNodeChangedInGeneralMode(node, opts, root);
    }

    public onAddNode(node: Node) {
        nodeOperation.onAddNode(node);
    }

    public onNodeAdded(node: Node) {
        nodeOperation.onNodeAdded(node);
    }

    public onNodeChanged(node: Node, opts: IChangeNodeOptions = {}) {
        this.onNodeChangedInGeneralMode(node, opts, Service.Editor.getRootNode());
    }

    public onSetPropertyComponent(comp: Component, opts: IChangeNodeOptions = {}) {
        this.onNodeChangedInGeneralMode(comp.node, opts, Service.Editor.getRootNode());
    }

    public removePrefabInfoFromNode(node: Node, removeNested?: boolean) {
        nodeOperation.removePrefabInfoFromNode(node, removeNested);
    }

    public checkToRemoveTargetOverride(source: Node | Component, root: Node | Scene | null) {
        prefabUtils.checkToRemoveTargetOverride(source, root);
    }

    /**
     * 从一个节点生成一个PrefabAsset
     * @param nodeUUID
     * @param url
     * @param options
     */
    public async createPrefabAssetFromNode(nodeUUID: string, url: string, options = { undo: true, overwrite: true }): Promise<Node | null> {
        return await nodeOperation.createPrefabAssetFromNode(nodeUUID, url, options);
    }

    /**
     * 将一个 node 与一个 prefab 关联到一起
     * @param nodeUUID
     * @param {*} assetUuid 关联的资源
     */
    public async linkNodeWithPrefabAsset(nodeUUID: string | Node, assetUuid: string | any) {
        await nodeOperation.linkNodeWithPrefabAsset(nodeUUID, assetUuid);
    }

    /**
     * 从一个节点生成 prefab数据
     * 返回序列化数据
     * @param {*} nodeUUID
     */
    public generatePrefabDataFromNode(nodeUUID: string | Node) {
        return prefabUtils.generatePrefabDataFromNode(nodeUUID);
    }

    /**
     * 还原一个PrefabInstance的数据为它所关联的PrefabAsset
     * @param nodeUUID node
     */
    public async revertPrefab(nodeUUID: Node | string) {
        return nodeOperation.revertPrefab(nodeUUID);
    }

    // 获取unlinkPrefab会影响到的uuid
    public getUnlinkNodeUuids(uuid: string, removeNested?: boolean): string[] {
        const uuids: string[] = [];
        const node = EditorExtends.Node.getNode(uuid);
        function collectUuids(node: Node) {
            const prefabInfo = prefabUtils.getPrefab(node);
            if (removeNested) {
                uuids.push(node.uuid);
                node.children.forEach((child) => {
                    collectUuids(child);
                });
            } else if (prefabInfo) {
                if (!prefabInfo.instance) {
                    uuids.push(node.uuid);
                    node.children.forEach((child) => {
                        collectUuids(child);
                    });
                }
            }
        }
        if (node) {
            uuids.push(uuid);
            node.children.forEach((child) => {
                collectUuids(child);
            });
        }
        return uuids;
    }

    /**
     * 解除PrefabInstance对PrefabAsset的关联
     * @param nodeUUID 节点或节点的UUID
     * @param removeNested 是否递归的解除子节点PrefabInstance
     */
    public unWrapPrefabInstance(nodeUUID: string, removeNested?: boolean) {
        return nodeOperation.unWrapPrefabInstance(nodeUUID, removeNested);
    }

    // 在Prefab编辑模式下不能移除prefabInfo，只需要移除instance
    public unWrapPrefabInstanceInPrefabMode(nodeUUID: string | Node, removeNested?: boolean) {
        return nodeOperation.unWrapPrefabInstanceInPrefabMode(nodeUUID, removeNested);
    }

    /**
     * 将一个PrefabInstance的数据应用到对应的Asset资源上
     * @param nodeUUID uuid
     */
    public async applyPrefab(nodeUUID: string) {
        return await nodeOperation.applyPrefab(nodeUUID);
    }

    /// /////////////////////
    // components operation
    ////////////////////////
    public onAddComponent(comp: Component) {
        componentOperation.onAddComponent(comp);
    }

    public onComponentAdded(comp: Component) {
        componentOperation.onComponentAdded(comp);
    }

    // 编辑器主动删除Component时调用
    public onRemoveComponentInGeneralMode(comp: Component, rootNode: Node | Scene | null) {
        componentOperation.onRemoveComponentInGeneralMode(comp, rootNode);
    }

    // Component被删除时调用，当根节点删除时，所有子节点的Component删除事件也会触发到这里
    public onComponentRemovedInGeneralMode(comp: Component, rootNode: Node | Scene | null) {
        componentOperation.onComponentRemovedInGeneralMode(comp, rootNode);
    }

    public async revertRemovedComponent(nodeUUID: string, fileID: string) {
        await componentOperation.revertRemovedComponent(nodeUUID, fileID);
    }

    public async applyRemovedComponent(nodeUUID: string, fileID: string) {
        await componentOperation.applyRemovedComponent(nodeUUID, fileID);
    }

    public async onAssetChanged(uuid: string) {
        // prefab 资源的变动，softReload场景
        if (nodeOperation.assetToNodesMap.has(uuid) && await Service.Editor.hasOpen()) {
            clearTimeout(this._softReloadTimer);
            this._softReloadTimer = setTimeout(async () => {
                await Service.Editor.reload({});
            }, 500);
        }
    }

    public async onAssetDeleted(uuid: string) {
        if (nodeOperation.assetToNodesMap.has(uuid) && await Service.Editor.hasOpen()) {
            clearTimeout(this._softReloadTimer);
            this._softReloadTimer = setTimeout(async () => {
                await Service.Editor.reload({});
            }, 500);
        }
    }

    /**
     * 将一个节点恢复到关联的 prefab 的状态
     * @param {*} nodeUuid
     */
    public revert(nodeUuid: string) { }

    /**
     * 将一个节点的修改，应用到关联的 prefab 上
     * @param {*} nodeUuid
     */
    public sync(nodeUuid: string) { }

    public createNodeFromPrefabAsset(asset: any) {
        const node: Node = instantiate(asset);
        // @ts-ignore
        const prefabInfo = node['_prefab'];

        if (!prefabInfo) {
            console.error('Not a Prefab Asset:', asset.uuid);
            return null;
        }

        if (!prefabInfo.instance) {
            prefabInfo.instance = prefabUtils.createPrefabInstance();
        }

        return node;
    }

    // TODO: apply单个属性的override到prefabAsset

    public filterChildOfAssetOfPrefabInstance(uuids: string | string[], operationTips: string) {
        if (!Array.isArray(uuids)) {
            uuids = [uuids];
        }

        const filterUUIDs = [];
        for (const uuid of uuids) {
            const node = EditorExtends.Node.getNode(uuid);

            // 增加容错
            if (!node) {
                continue;
            }

            // 是当前环境下的mountedChildren，就不算是资源里的
            if (prefabUtils.isOutmostPrefabInstanceMountedChildren(node)) {
                filterUUIDs.push(uuid);
                continue;
            }

            if (!prefabUtils.isPrefabInstanceRoot(node) && prefabUtils.isPartOfAssetInPrefabInstance(node)) {
                console.warn(`Node [${node.name}] is a prefab child of prefabInstance [${node['_prefab']?.root?.name}], ${operationTips}`);
                // 消除其它面板的等待操作，例如hierarchy操作节点时会先进入等待状态，如果没有node的change消息，就会一直处于等待状态。
                ServiceEvents.broadcast('scene:change-node', node.uuid);
                continue;
            }

            filterUUIDs.push(uuid);
        }

        return filterUUIDs;
    }

    public filterPartOfPrefabAsset(uuids: string | string[], operationTips: string) {
        if (!Array.isArray(uuids)) {
            uuids = [uuids];
        }

        const filterUUIDs = [];
        for (const uuid of uuids) {
            const node = EditorExtends.Node.getNode(uuid);

            // 增加容错
            if (!node) {
                continue;
            }

            if (prefabUtils.isPartOfAssetInPrefabInstance(node)) {
                console.warn(`Node [${node.name}] is part of prefabInstance [${node['_prefab']?.root?.name}], ${operationTips}`);
                // 消除其它面板的等待操作，例如hierarchy操作节点时会先进入等待状态，如果没有node的change消息，就会一直处于等待状态。
                ServiceEvents.broadcast('scene:change-node', node.uuid);
                continue;
            }

            filterUUIDs.push(uuid);
        }

        return filterUUIDs;
    }

    // PrefabInstance的Prefab子节点不能删除
    public filterChildOfPrefabAssetWhenRemoveNode(uuids: string | string[]) {
        return this.filterChildOfAssetOfPrefabInstance(uuids, 'it\'s not allowed to delete in current context, you can delete it in it\'s prefabAsset or \
        do it after unlink prefab from root node');
    }

    public filterChildOfPrefabAssetWhenSetParent(uuids: string | string[]) {
        return this.filterChildOfAssetOfPrefabInstance(uuids, 'it\'s not allowed to change parent in current context, you can modify it in it\'s prefabAsset or \
        do it after unlink prefab from root node');
    }

    public canModifySibling(uuid: string, target: number, offset: number) {
        // 不需要移动
        if (offset === 0) {
            return false;
        }

        // 传入的是一个父节点ID
        const node = EditorExtends.Node.getNode(uuid);

        // 增加容错
        if (!node) {
            return false;
        }

        // 保处理在PrefabInstance下的属于PrefabAsset中的节点
        if (node['_prefab'] && prefabUtils.isPartOfPrefabAsset(node) && node['_prefab']?.root?.['_prefab']?.instance && node.children) {
            // 过滤在hierarchy隐藏的节点
            const filterHiddenChildren = node.children.filter((child: Node) => !(child.objFlags & cc.Object.Flags.HideInHierarchy));
            const child = node.children[target];
            if (!child) {
                return false;
            }

            let isAddedChild = true;
            if (child['_prefab']) {
                const prefabState = prefabUtils.getPrefabStateInfo(child);
                isAddedChild = prefabState.isAddedChild;
                // 如果要移动的节点是一个Prefab的子节点
                if (!isAddedChild) {
                    console.warn(`Node [${child.name}] is a prefab child of prefabInstance [${child['_prefab'].root?.name}], \
                    it's not allowed to modify hierarchy in current context, you can modify it in it's prefabAsset or do it after unlink prefab from root node`);
                    // 消除其它面板的等待操作，例如hierarchy操作节点时会先进入等待状态，如果没有node的change消息，就会一直处于等待状态。
                    ServiceEvents.broadcast('scene:change-node', child.uuid);
                    return false;
                }
            }

            // 找出要移动的节点在没有过滤掉隐藏节点的场景中的位置
            const targetChild = filterHiddenChildren[target + offset];
            if (isAddedChild && targetChild['_prefab']) {
                console.warn(`Node [${targetChild.name}] is a prefab child of prefabInstance [${targetChild['_prefab'].root?.name}], \
                it's not allowed to modify hierarchy in current context, you can modify it in it's prefabAsset or do it after unlink prefab from root node`);
                // 消除其它面板的等待操作，例如hierarchy操作节点时会先进入等待状态，如果没有node的change消息，就会一直处于等待状态。
                ServiceEvents.broadcast('scene:change-node', child.uuid);
                return false;
            }
        }

        return true;
    }

    public filterPartOfPrefabAssetWhenCreateComponent(uuids: string | string[]) {
        return this.filterPartOfPrefabAsset(uuids, 'it\'s not allow to add component in current context currently, you can add component in it\'s prefabAsset or \
        do it after unlink prefab from root node');
    }

    public filterPartOfPrefabAssetWhenRemoveComponent(uuids: string | string[]) {
        return this.filterPartOfPrefabAsset(uuids, 'it\'s not allow to remove component in current context currently, you can remove component in it\'s prefabAsset or \
        do it after unlink prefab from root node');
    }

    /**
     * 暴力遍历root所有属性，找到rule返回true的路径
     * 比如找Scene节点的路径，rule = (obj)=> return obj.globals
     * @param root 根节点
     * @param rule 判断函数
     * @returns
     */
    public findPathWithRule(root: Node, rule: Function) {
        const path: string[] = [];
        const cache = new Map();
        const walk = function (obj: any, prekey: string) {
            const keys = Object.keys(obj);
            keys.forEach(key => {
                if (typeof (obj[key]) === 'object' && obj[key]) {
                    // @ts-ignore
                    if (!cache.get(obj[key])) {
                        cache.set(obj[key], true);
                        if (rule(obj[key])) {
                            console.log('找到了', prekey + '|' + key);
                            path.push(prekey + '|' + key);
                        } else {
                            walk(obj[key], prekey + '|' + key);
                        }
                    }
                }

            });
        };
        walk(root, '');
        return path;
    }
}

export default new PrefabService();
