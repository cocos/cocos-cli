'use strict';

import { Component, editorExtrasTag, instantiate, Node, Prefab, CCClass, Scene, isValid } from 'cc';
import { isEditorNode } from '../node/node-utils';
import { ServiceEvents, Service } from '../core';
import { INodeEvents, NodeEventType } from '../../../common';

type PrefabInfo = Prefab._utils.PrefabInfo;
const PrefabInfo = Prefab._utils.PrefabInfo;
type CompPrefabInfo = Prefab._utils.CompPrefabInfo;
const CompPrefabInfo = Prefab._utils.CompPrefabInfo;
type PrefabInstance = Prefab._utils.PrefabInstance;
const PrefabInstance = Prefab._utils.PrefabInstance;
type TargetInfo = Prefab._utils.TargetInfo;
const TargetInfo = Prefab._utils.TargetInfo;
type PropertyOverrideInfo = Prefab._utils.PropertyOverrideInfo;
const PropertyOverrideInfo = Prefab._utils.PropertyOverrideInfo;
type MountedChildrenInfo = Prefab._utils.MountedChildrenInfo;
const MountedChildrenInfo = Prefab._utils.MountedChildrenInfo;
type TargetOverrideInfo = Prefab._utils.TargetOverrideInfo;
const TargetOverrideInfo = Prefab._utils.TargetOverrideInfo;
type MountedComponentsInfo = Prefab._utils.MountedComponentsInfo;
const MountedComponentsInfo = Prefab._utils.MountedComponentsInfo;

export enum PrefabState {
    NotAPrefab = 0, // 普通节点，非Prefab
    PrefabChild = 1, // Prefab子节点，不含有PrefabInstance
    PrefabInstance = 2, // Prefab的根节点含有PrefabInstance的节点
    PrefabLostAsset = 3, // 丢失资源的Prefab节点
}

const compKey = '_components';
const DELIMETER = CCClass.Attr.DELIMETER;

function compareStringArray(array1: string[] | undefined, array2: string[] | undefined) {
    if (!array1 || !array2) {
        return false;
    }

    if (array1.length !== array2.length) {
        return false;
    }

    return array1.every((value, index) => value === array2[index]);
}

function isInClassChain(srcCtor: any, dstCtor: any): boolean {
    if (srcCtor && dstCtor) {
        const chian = CCClass.getInheritanceChain(srcCtor);
        chian.push(srcCtor);
        return chian.includes(dstCtor);
    }
    return false;
}

function isSameNode(src: Node, dst: Node) {
    return src.getPathInHierarchy() === dst.getPathInHierarchy() && src.getSiblingIndex() === dst.getSiblingIndex();
}

function pushNestedPrefab(nestedPrefabNode: Node, root: Node, paths: string[]) {
    let parent = nestedPrefabNode.parent as Node;
    while (parent && parent !== root) {
        if (parent['_prefab']?.instance) {
            paths.unshift(parent['_prefab']?.instance.fileId);
        }
        parent = parent.parent as Node;
    }
}

class PrefabUtil {
    public static PrefabState = PrefabState;
    private assetTargetMapCache: Map<Node, {}> = new Map();
    private prefabAssetNodeInstanceMap: Map<PrefabInfo, Node> = new Map(); // 用于PrefabAsset根节点实例化数据缓存，用于diff对比

    public getPrefab(node: Node): PrefabInfo | null {
        return node['_prefab'];
    }

    // 发送节点修改前消息
    public fireBeforeChangeMsg(node: Node) {
        ServiceEvents.emit<INodeEvents>('node:before-change', node);
    }

    // 发送节点修改消息
    public fireChangeMsg(node: Node | Scene, opts: any = {}) {
        opts.type = NodeEventType.PREFAB_INFO_CHANGED;
        ServiceEvents.emit<INodeEvents>('node:change', node);
    }

    public getPrefabAssetNodeInstance(prefabInfo: PrefabInfo) {
        if (this.prefabAssetNodeInstanceMap.has(prefabInfo)) {
            return this.prefabAssetNodeInstanceMap.get(prefabInfo);
        }

        let assetRootNode: Node | undefined = undefined;
        if (prefabInfo && prefabInfo.asset && isValid(prefabInfo.asset)) {
            assetRootNode = instantiate(prefabInfo.asset);
        }

        if (assetRootNode) {
            // @ts-ignore
            const rootPrefabInfo = assetRootNode['_prefab'];
            if (rootPrefabInfo) {
                rootPrefabInfo.instance = prefabInfo.instance;
            }

            this.prefabAssetNodeInstanceMap.set(prefabInfo, assetRootNode);
        }

        return assetRootNode;
    }

    public clearCache() {
        this.assetTargetMapCache.clear();
        this.prefabAssetNodeInstanceMap.clear();
    }

    public removePrefabAssetNodeInstanceCache(prefabInfo: PrefabInfo) {
        if (this.prefabAssetNodeInstanceMap.has(prefabInfo)) {
            this.prefabAssetNodeInstanceMap.delete(prefabInfo);
        }
    }

    /**
     * 在编辑器中,node._prefab.instance.targetMap存在丢失的情况,比如新建预制体时
     * 所以编辑器中请不要通过引擎字段访问targetMap，从而去获取target
     * 请使用prefabUtil提供的方法来访问
     */
    public getTargetMap(node: Node, useCache = false) {
        if (useCache && this.assetTargetMapCache.has(node)) {
            return this.assetTargetMapCache.get(node);
        }

        const assetTargetMap = {};
        this.generateTargetMap(node, assetTargetMap, true);

        this.assetTargetMapCache.set(node, assetTargetMap);

        return assetTargetMap;
    }

    // 通过localID获取节点node上的节点
    public getTarget(localID: string[], node: Node, useCache = false): Node | Component | null {
        const targetMap = this.getTargetMap(node, useCache);
        return Prefab._utils.getTarget(localID, targetMap);
    }

    // 与Prefab._utils.generateTargetMap不同的是，这个需要将mounted children都考虑进来
    private generateTargetMap(node: Node, targetMap: any, isRoot: boolean) {
        if (!node) {
            return;
        }
        let curTargetMap = targetMap;

        const prefabInstance = node['_prefab']?.instance;
        if (!isRoot && prefabInstance) {
            targetMap[prefabInstance.fileId] = {};
            curTargetMap = targetMap[prefabInstance.fileId];
        }

        const prefabInfo = node['_prefab'];
        if (prefabInfo) {
            curTargetMap[prefabInfo.fileId] = node;
        }

        const components = node.components;
        for (let i = 0; i < components.length; i++) {
            const comp = components[i];
            if (comp.__prefab) {
                curTargetMap[comp.__prefab.fileId] = comp;
            }
        }

        for (let i = 0; i < node.children.length; i++) {
            const childNode = node.children[i];
            this.generateTargetMap(childNode, curTargetMap, false);
        }

        if (prefabInstance && prefabInstance.mountedChildren.length > 0) {
            for (let i = 0; i < prefabInstance.mountedChildren.length; i++) {
                const childInfo = prefabInstance.mountedChildren[i];
                if (childInfo && childInfo.targetInfo) {
                    let mountedTargetMap = curTargetMap;
                    const localID = childInfo.targetInfo.localID;
                    if (localID.length > 0) {
                        for (let i = 0; i < localID.length - 1; i++) {
                            mountedTargetMap = mountedTargetMap[localID[i]];
                        }
                    }
                    // 如果目标节点是嵌套预制体时，可能出现挂载的节点已经不再是预制体实例的情况 #17493
                    if (childInfo.nodes && mountedTargetMap) {
                        for (let i = 0; i < childInfo.nodes.length; i++) {
                            const childNode = childInfo.nodes[i];

                            if (!childNode) {
                                continue;
                            }

                            // mounted node need to add to the target map
                            this.generateTargetMap(childNode, mountedTargetMap, false);
                        }
                    }
                }
            }
        }
    }

    public getPropertyOverrideLocationInfo(node: Node, pathKeys: string[]) {
        // 向上查找PrefabInstance路径
        const outMostPrefabInstanceInfo = this.getOutMostPrefabInstanceInfo(node);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return null;
        }
        const targetPath: string[] = outMostPrefabInstanceInfo.targetPath;
        // @ts-ignore
        const outMostPrefabInstance: Prefab._utils.PrefabInstance | undefined = outMostPrefabInstanceNode['_prefab']?.instance;

        let target = node;
        if (outMostPrefabInstance) {
            targetPath.splice(0, 1); // 不需要存最外层的PrefabInstance的fileID，方便override可以在PrefabInstance复制后复用
            let relativePathKeys: string[] = []; // 相对于目标（node\component)的属性查找路径

            if (pathKeys.length <= 0) {
                return null;
            }

            if (pathKeys[0] === compKey) {
                if (pathKeys.length === 2) {
                    // modify component
                    return null;
                }

                if (pathKeys.length === 1) {
                    // TODO，改变components数组
                    return null;
                }

                // component
                const comp = (node[pathKeys[0]] as any)[pathKeys[1]];
                if (comp.__prefab) {
                    targetPath.push(comp.__prefab.fileId);
                    relativePathKeys = pathKeys.slice(2);
                    target = comp;
                } else {
                    // console.error(`component: ${comp.name} doesn't have a prefabInfo`);
                    // mounted component doesn't have a prefabInfo
                    return null;
                }
            } else {
                // node
                // @ts-ignore
                const prefabInfo = node['_prefab'];

                if (prefabInfo) {
                    targetPath.push(prefabInfo.fileId);
                    relativePathKeys = pathKeys;
                } else {
                    console.error(`node: ${node.name} doesn't have a prefabInfo`);
                }
            }

            return { outMostPrefabInstanceNode, targetPath, relativePathKeys, target };
        }

        return null;
    }

    public getPrefabForSerialize(node: Node, quiet: boolean | undefined = undefined) {
        // deep clone, since we don't want the given node changed by codes below
        const cloneNode = instantiate(node);
        // 在修改节点prefabInfo时先去掉mountedChild的挂载信息
        this.removeMountedRootInfo(cloneNode);

        const prefab = new cc.Prefab();
        const prefabInfo = this.createPrefabInfo(node.uuid);
        prefabInfo.asset = prefab;
        prefabInfo.root = cloneNode;

        // 复制预制体信息
        const oriPrefabInfo = this.getPrefab(cloneNode) as PrefabInfo;
        if (oriPrefabInfo) {
            prefab.optimizationPolicy = oriPrefabInfo.asset?.optimizationPolicy;
            prefab.persistent = oriPrefabInfo.asset?.persistent;
            prefabInfo.targetOverrides = oriPrefabInfo.targetOverrides;
            prefabInfo.fileId = oriPrefabInfo.fileId;
        }
        // @ts-ignore
        cloneNode['_prefab'] = prefabInfo;

        const nestedInstNodes: Node[] = [];
        // 给子节点设置prefabInfo-asset,处理nestedPrefabInstanceRoots和prefabRootNode
        this.walkNode(cloneNode, (child: Node, isChild: boolean) => {
            // 私有节点不需要添加 prefabInfo 数据
            if (child.objFlags & cc.Object.Flags.HideInHierarchy) {
                return;
            }
            const childPrefab = this.getPrefab(child);
            if (childPrefab) {
                if (childPrefab.instance) {
                    // 处理嵌套预制体信息
                    const { outMostPrefabInstanceNode } = this.getOutMostPrefabInstanceInfo(child);
                    if (outMostPrefabInstanceNode === child) {
                        childPrefab.nestedPrefabInstanceRoots = undefined;
                        childPrefab.instance.prefabRootNode = cloneNode;
                        nestedInstNodes.push(child);
                    }
                } else {
                    if (child['_prefab']) {
                        child['_prefab'].root = prefabInfo.root;
                        child['_prefab'].asset = prefabInfo.asset;
                    }
                }
            } else {
                const newPrefab = new PrefabInfo();
                newPrefab.root = prefabInfo.root;
                newPrefab.asset = prefabInfo.asset;
                newPrefab.fileId = child.uuid;

                child['_prefab'] = newPrefab;
            }

            // 组件也添加 __prefab fileId 属性，以便复用
            if (child.components && child.components.length) {
                for (let i = 0; i < child.components.length; i++) {
                    const comp = child.components[i];
                    if (!comp.__prefab) {
                        comp.__prefab = new CompPrefabInfo();
                        comp.__prefab.fileId = comp.uuid;
                    }
                }
            }
        });
        prefabInfo.nestedPrefabInstanceRoots = nestedInstNodes.length > 0 ? nestedInstNodes : undefined;

        // 清理外部节点的引用,这里会清掉component的ID,必须在上述步骤执行完后才可以清(__prefab.fileId)
        const clearedReference = EditorExtends.PrefabUtils.checkAndStripNode(cloneNode, quiet);

        this.removeInvalidPrefabData(cloneNode);
        this.setMountedRoot(cloneNode, undefined);
        prefab.data = cloneNode;
        return {
            prefab: prefab,
            clearedReference: clearedReference,
        };
    }

    public addPrefabInfo(node: Node, rootNode: Node, prefab: Prefab | undefined) {
        return EditorExtends.PrefabUtils.addPrefabInfo(node, rootNode, prefab);
    }

    public walkNode(node: Node, handle: (node: Node, isChild: boolean) => boolean | void, isChild = false) {
        EditorExtends.PrefabUtils.walkNode(node, handle, isChild);
    }

    public addPrefabInfoToComponent(comp: Component) {
        if (!comp.__prefab) {
            comp.__prefab = new CompPrefabInfo();
        }

        if (!comp.__prefab) {
            return;
        }

        comp.__prefab.fileId = comp.__prefab.fileId ? comp.__prefab.fileId : comp.uuid;
    }

    /**
     * 克隆一个节点，转为预制体，返回预制体序列化数据
     * 注意这个不会影响现有节点数据，但生成的预制体，会有部分外部引用数据被清理
     * @param {*} nodeUUID
     */
    public generatePrefabDataFromNode(nodeUUID: string | Node) {
        let node: Node | null = null;
        if (typeof nodeUUID === 'string') {
            node = EditorExtends.Node.getNode(nodeUUID);
        } else {
            node = nodeUUID;
        }

        if (!node) {
            return null;
        }
        const { prefab, clearedReference } = this.getPrefabForSerialize(node);
        if (!prefab) {
            return null;
        }

        // 先去掉prefabInstance，等支持了Variant再实现不剔除的情况
        prefab.data['_prefab'].instance = undefined;

        // 拖拽生成prefab时要清理instance中对外部节点的引用，否则会把场景保存到prefab中
        this.removeInvalidPropertyOverrideReference(prefab.data);

        const data = EditorExtends.serialize(prefab);

        // 恢复clearedReference
        return {
            prefabData: data as string,
            clearedReference: clearedReference,
        };
        // return data as string;
    }

    public removeMountedRootInfo(node: Node) {
        // @ts-ignore
        const prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            return;
        }

        if (!prefabInfo.instance) {
            return;
        }

        const mountedChildren = prefabInfo.instance.mountedChildren;
        mountedChildren.forEach((mountedChildInfo) => {
            mountedChildInfo.nodes.forEach((node) => {
                this.setMountedRoot(node, undefined);
            });
        });

        const mountedComponents = prefabInfo.instance.mountedComponents;
        mountedComponents.forEach((mountedCompInfo) => {
            mountedCompInfo.components.forEach((comp) => {
                this.setMountedRoot(comp, undefined);
            });
        });
    }

    public generateUUID() {
        return EditorExtends.UuidUtils.generate(true);
    }

    public createPrefabInstance() {
        const prefabInstance = new PrefabInstance();
        prefabInstance.fileId = this.generateUUID();

        return prefabInstance;
    }

    public createPrefabInfo(fileId: string) {
        const prefabInfo = new PrefabInfo();
        prefabInfo.fileId = fileId;
        return prefabInfo;
    }

    public cloneInstanceWithNewFileId(instance: PrefabInstance) {
        const newInstance = this.createPrefabInstance();
        // 复制propertyOverrides
        const cloneSourcePropOverrides = instance.propertyOverrides;
        newInstance.propertyOverrides = [];
        for (let i = 0; i < cloneSourcePropOverrides.length; i++) {
            const cloneSourcePropOverride = cloneSourcePropOverrides[i];
            const propOverride = new PropertyOverrideInfo();
            propOverride.targetInfo = cloneSourcePropOverride.targetInfo;
            propOverride.propertyPath = cloneSourcePropOverride.propertyPath;
            propOverride.value = cloneSourcePropOverride.value;
            newInstance.propertyOverrides.push(propOverride);
        }

        // 复制mountedChildren
        const cloneMountedChildren = instance.mountedChildren;
        newInstance.mountedChildren = [];
        for (let i = 0; i < cloneMountedChildren.length; i++) {
            const cloneSourceMountedChild = cloneMountedChildren[i];
            const mountedChild = new MountedChildrenInfo();
            mountedChild.targetInfo = cloneSourceMountedChild.targetInfo;
            mountedChild.nodes = cloneSourceMountedChild.nodes.slice();
            newInstance.mountedChildren.push(mountedChild);
        }

        // 复制mountedComponents
        const cloneMountedComponents = instance.mountedComponents;
        newInstance.mountedComponents = [];
        for (let i = 0; i < cloneMountedComponents.length; i++) {
            const cloneSourceMountedComp = cloneMountedComponents[i];
            const mountedComp = new MountedComponentsInfo();
            mountedComp.targetInfo = cloneSourceMountedComp.targetInfo;
            mountedComp.components = cloneSourceMountedComp.components.slice();
            newInstance.mountedComponents.push(mountedComp);
        }

        // 复制removedComponents
        newInstance.removedComponents = instance.removedComponents.slice();

        return newInstance;
    }

    public getPrefabInstanceRoot(node: Node) {
        let parent: Node | null = node;
        let root: Node | null = null;
        while (parent) {
            // @ts-ignore member access
            if (parent['_prefab']?.instance) {
                root = parent;
                break;
            }
            parent = parent.parent;
        }

        return root;
    }

    isSameSourceTargetOverride(targetOverride: TargetOverrideInfo, source: Component | Node, sourceLocalID: string[] | undefined, propPath: string[]) {
        if (targetOverride.source === source &&
            ((!sourceLocalID && !targetOverride.sourceInfo) ||
                compareStringArray(sourceLocalID, targetOverride.sourceInfo?.localID)) &&
            compareStringArray(targetOverride.propertyPath, propPath)) {
            return true;
        }

        return false;
    }

    getSourceData(source: Component) {
        // 如果source是一个普通节点下的Component，那直接指向它就可以
        // 如果source是一个mountedComponent，直接指向它就可以
        // 如果source是一个Prefab节点下的非mounted的Component，那就需要通过[根节点+LocalID]的方式来索引。
        let sourceTarget: Component | Node = source;
        let sourceLocalID;
        const sourceNode = source.node;
        if (!sourceNode) {
            return null;
        }

        // @ts-ignore
        if (sourceNode['_prefab'] && !this.isMountedComponent(source)) {
            // 向上查找PrefabInstance路径
            const outMostPrefabInstanceInfo = this.getOutMostPrefabInstanceInfo(sourceNode);
            const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;

            if (outMostPrefabInstanceNode) {
                sourceTarget = outMostPrefabInstanceNode;
                sourceLocalID = outMostPrefabInstanceInfo.targetPath;
                sourceLocalID.splice(0, 1); // 不需要存最外层的PrefabInstance的fileID
                if (source.__prefab?.fileId) {
                    sourceLocalID.push(source.__prefab?.fileId);
                } else {
                    console.error(`can't get fileId of component: ${source.name} in node: ${source.node.name}`);
                }

            }
        }

        return { sourceTarget, sourceLocalID };
    }

    public removeTargetOverrideBySource(prefabInfo: PrefabInfo | undefined, source: Node | Component) {
        if (!prefabInfo) {
            return false;
        }

        if (!prefabInfo.targetOverrides) {
            return false;
        }

        let isAnyRemoved = false;
        for (let i = prefabInfo.targetOverrides.length - 1; i >= 0; i--) {
            const targetOverrideItr = prefabInfo.targetOverrides[i];
            if (targetOverrideItr.source === source) {
                prefabInfo.targetOverrides.splice(i, 1);
                isAnyRemoved = true;
            }
        }

        return isAnyRemoved;
    }

    public removeTargetOverride(prefabInfo: PrefabInfo | undefined | null, source: Component, propPath: string[]) {
        if (!prefabInfo) {
            return false;
        }

        if (!prefabInfo.targetOverrides) {
            return false;
        }

        const sourceData = this.getSourceData(source);
        if (!sourceData) {
            return false;
        }

        const sourceTarget: Component | Node = sourceData.sourceTarget;
        const sourceLocalID = sourceData.sourceLocalID;

        let result = false;
        for (let i = prefabInfo.targetOverrides.length - 1; i >= 0; i--) {
            const targetOverrideItr = prefabInfo.targetOverrides[i];
            if (this.isSameSourceTargetOverride(targetOverrideItr, sourceTarget, sourceLocalID, propPath)) {
                prefabInfo.targetOverrides.splice(i, 1);
                result = true;
            }
        }

        return result;
    }

    public isInTargetOverrides(targetOverrides: TargetOverrideInfo[], source: Component, propPath: string[]) {
        const sourceData = this.getSourceData(source);
        if (!sourceData) {
            return false;
        }

        const sourceTarget: Component | Node = sourceData.sourceTarget;
        const sourceLocalID = sourceData.sourceLocalID;

        for (let i = 0; i < targetOverrides.length; i++) {
            const targetOverrideItr = targetOverrides[i];
            if (this.isSameSourceTargetOverride(targetOverrideItr, sourceTarget, sourceLocalID, propPath)) {
                return true;
            }
        }

        return false;
    }

    public getTargetOverride(prefabInfo: PrefabInfo, source: Component, propPath: string[]) {
        let targetOverride: TargetOverrideInfo | null = null;
        if (!prefabInfo.targetOverrides) {
            prefabInfo.targetOverrides = [];
        }

        const sourceData = this.getSourceData(source);
        if (!sourceData) {
            return null;
        }

        const sourceTarget: Component | Node = sourceData.sourceTarget;
        const sourceLocalID = sourceData.sourceLocalID;

        for (let i = 0; i < prefabInfo.targetOverrides.length; i++) {
            const targetOverrideItr = prefabInfo.targetOverrides[i];
            if (this.isSameSourceTargetOverride(targetOverrideItr, sourceTarget, sourceLocalID, propPath)) {
                targetOverride = targetOverrideItr;
                break;
            }
        }

        if (!targetOverride) {
            targetOverride = new TargetOverrideInfo();
            targetOverride.source = sourceTarget;
            if (sourceLocalID) {
                targetOverride.sourceInfo = new TargetInfo();
                targetOverride.sourceInfo.localID = sourceLocalID;
            }
            targetOverride.propertyPath = propPath;
            prefabInfo.targetOverrides.push(targetOverride);
        }

        return targetOverride;
    }

    public getPropertyOverridesOfTarget(prefabInstance: PrefabInstance, localID: string[]) {
        const propOverrides: PropertyOverrideInfo[] = [];
        for (let i = 0; i < prefabInstance.propertyOverrides.length; i++) {
            const propOverrideItr = prefabInstance.propertyOverrides[i];
            if (compareStringArray(propOverrideItr.targetInfo?.localID, localID)) {
                propOverrides.push(propOverrideItr);
            }
        }

        return propOverrides;
    }

    public isInPropertyOverrides(propPath: string[], propertyOverrides: PropertyOverrideInfo[]): boolean {
        for (let i = 0; i < propertyOverrides.length; i++) {
            const propOverrideItr = propertyOverrides[i];
            if (compareStringArray(propOverrideItr.propertyPath, propPath)) {
                return true;
            }
        }

        return false;
    }

    public getPropertyOverride(prefabInstance: PrefabInstance, localID: string[], propPath: string[]) {
        let propOverride: PropertyOverrideInfo | null = null;
        let targetInfo: TargetInfo | null = null;
        for (let i = 0; i < prefabInstance.propertyOverrides.length; i++) {
            const propOverrideItr = prefabInstance.propertyOverrides[i];
            if (compareStringArray(propOverrideItr.targetInfo?.localID, localID)) {
                // 复用已有的targetInfo，减少数据冗余
                targetInfo = propOverrideItr.targetInfo;
                if (compareStringArray(propOverrideItr.propertyPath, propPath)) {
                    propOverride = propOverrideItr;
                    break;
                }
            }
        }

        if (!propOverride) {
            propOverride = new PropertyOverrideInfo();

            if (!targetInfo) {
                targetInfo = new TargetInfo();
                targetInfo.localID = localID;
            }

            propOverride.targetInfo = targetInfo;
            propOverride.propertyPath = propPath;
            prefabInstance.propertyOverrides.push(propOverride);
        }

        return propOverride;
    }

    public removePropertyOverride(prefabInstance: PrefabInstance, localID: string[], propPath: string[]) {
        for (let i = prefabInstance.propertyOverrides.length - 1; i >= 0; i--) {
            const propOverrideItr = prefabInstance.propertyOverrides[i];
            if (compareStringArray(propOverrideItr.targetInfo?.localID, localID) &&
                compareStringArray(propOverrideItr.propertyPath, propPath)) {
                prefabInstance.propertyOverrides.splice(i, 1);
            }
        }
    }

    public findPrefabInstanceMountedChildren(prefabInstance: PrefabInstance, localID: string[]) {
        let mountedChild = null;
        const mountedChildren = prefabInstance.mountedChildren;
        for (let i = 0; i < mountedChildren.length; i++) {
            const childInfo = mountedChildren[i];
            if (childInfo.isTarget(localID)) {
                mountedChild = childInfo;
                break;
            }
        }

        return mountedChild;
    }

    public createMountedChildrenInfo(localID: string[]) {
        const targetInfo = new TargetInfo();
        targetInfo.localID = localID;
        const mountedChildInfo = new MountedChildrenInfo();
        mountedChildInfo.targetInfo = targetInfo;

        return mountedChildInfo;
    }

    public getPrefabInstanceMountedChildren(prefabInstance: PrefabInstance, localID: string[]) {
        let mountedChild = this.findPrefabInstanceMountedChildren(prefabInstance, localID);

        if (!mountedChild) {
            mountedChild = this.createMountedChildrenInfo(localID);
            prefabInstance.mountedChildren.push(mountedChild);
        }

        return mountedChild;
    }

    public getPrefabInstanceMountedComponents(prefabInstance: PrefabInstance, localID: string[]) {
        let mountedComponentsInfo = null;
        const mountedComponents = prefabInstance.mountedComponents;
        for (let i = 0; i < mountedComponents.length; i++) {
            const componentsInfo = mountedComponents[i];
            if (componentsInfo.isTarget(localID)) {
                mountedComponentsInfo = componentsInfo;
                break;
            }
        }

        if (!mountedComponentsInfo) {
            const targetInfo = new TargetInfo();
            targetInfo.localID = localID;
            mountedComponentsInfo = new MountedComponentsInfo();
            mountedComponentsInfo.targetInfo = targetInfo;
            prefabInstance.mountedComponents.push(mountedComponentsInfo);
        }

        return mountedComponentsInfo;
    }

    public addRemovedComponent(prefabInstance: PrefabInstance, localID: string[]) {
        const removedComponents = prefabInstance.removedComponents;
        for (let i = 0; i < removedComponents.length; i++) {
            const targetInfo = removedComponents[i];
            if (compareStringArray(targetInfo.localID, localID)) {
                return;
            }
        }

        const targetInfo = new TargetInfo();
        targetInfo.localID = localID;
        removedComponents.push(targetInfo);
    }

    public deleteRemovedComponent(prefabInstance: PrefabInstance, localID: string[]) {
        const removedComponents = prefabInstance.removedComponents;
        for (let i = 0; i < removedComponents.length; i++) {
            const targetInfo = removedComponents[i];
            if (compareStringArray(targetInfo.localID, localID)) {
                removedComponents.splice(i, 1);
                break;
            }
        }
    }

    /**
     * whether the node is child of a prefab
     * @param node node
     */
    public isChildOfPrefabInstance(node: Node) {
        let parent = node.parent;
        let hasPrefabRootInParent = false;
        while (parent) {
            // @ts-ignore: private member access
            if (parent['_prefab']?.instance) {
                hasPrefabRootInParent = true;
                break;
            }
            parent = parent.parent;
        }

        return hasPrefabRootInParent;
    }

    public isPrefabInstanceRoot(node: Node) {
        // @ts-ignore: private member access
        const prefabInfo = node['_prefab'];

        if (!prefabInfo || !prefabInfo.instance) {
            return false;
        }

        // @ts-ignore: private member access
        if (!prefabInfo.instance.prefabRootNode || !prefabInfo.instance.prefabRootNode['_prefab']?.instance) {
            return true;
        }

        return false;
    }

    public isChildOfPrefabAsset(node: Node) {
        // @ts-ignore: private member access
        const prefabInfo = node['_prefab'];

        if (!prefabInfo) {
            return false;
        }

        const parent = node.parent;
        if (!parent) {
            return false;
        }

        // @ts-ignore: private member access
        const parentPrefabInfo = parent['_prefab'];
        if (!parentPrefabInfo) {
            return false;
        }

        if (prefabInfo.root === parentPrefabInfo.root) {
            return true;
        }

        // 用于嵌套的prefab判断
        if (prefabInfo.instance?.prefabRootNode === parentPrefabInfo.root) {
            return true;
        }

        return false;
    }

    public isPartOfPrefabAsset(node: Node) {
        // @ts-ignore: private member access
        const prefabInfo = node['_prefab'];

        const outMostPrefabInfo = this.getOutMostPrefabInstanceInfo(node);
        if (prefabInfo && outMostPrefabInfo.outMostPrefabInstanceNode) {
            if (this.isMountedChildOf(outMostPrefabInfo.outMostPrefabInstanceNode, node)) {
                return false;
            }

            return true;
        }

        return false;
    }

    /**
     * whether the node is part of a prefab,
     * root of prefab is also part of prefab
     * @param node node
     */
    public isPartOfPrefabInstance(node: Node) {
        let parent: Node | null = node;
        let hasPrefabRootInParent = false;
        while (parent) {
            // @ts-ignore: private member access
            if (parent['_prefab']?.instance) {
                hasPrefabRootInParent = true;
                break;
            }
            parent = parent.parent;
        }

        return hasPrefabRootInParent;
    }

    public isPartOfAssetInPrefabInstance(node: Node) {
        const isPartOfInstance = this.isPartOfPrefabInstance(node);
        if (!isPartOfInstance) {
            return false;
        }

        const isPartOfAsset = this.isPartOfPrefabAsset(node);
        return isPartOfAsset;
    }

    /**
     * 需要考虑很多种嵌套情况,需要注意mountedChild上又挂其它prefab的问题
     * 1. prefabA->node...
     * 2. prefabA->moutedNode->prefabB->node
     * 3. prefabA->moutedPrefabB->node
     * 4. prefabA->moutedPrefabB->prefabC->node
     * 5. prefabA->prefabB->node
     * @param node
     * @returns
     */
    public getOutMostPrefabInstanceInfo(node: Node) {
        const targetPath: string[] = [];
        let outMostPrefabInstanceNode: Node | null = null;
        let nodeIter: Node | null = node;

        while (nodeIter) {
            const prefabInstance: Prefab._utils.PrefabInstance | undefined = nodeIter['_prefab']?.instance;
            // 向上查找到第一个预制体实例节点，判断改实例是否有prefabRootNode(嵌套预制体)
            // 当预制体实例不存在prefabRootNode时,或者prefabRootNode指向了当前根节点时，说明找到了最外层预制体实例
            if (prefabInstance) {
                targetPath.unshift(prefabInstance.fileId);
                outMostPrefabInstanceNode = nodeIter;
                // 非嵌套预制体，直接返回
                if (!prefabInstance.prefabRootNode) {
                    break;
                }
                const prefabRoot = prefabInstance.prefabRootNode;
                const rootNode = Service.Editor.getRootNode() as Node;
                if (prefabRoot && rootNode && isSameNode(prefabRoot, rootNode)) {
                    break;
                } else {
                    // 是嵌套预制体，直接从prefabRootNode开始继续查找
                    // 需要把节点树中的prefabInstance的fileId加入到targetPath中，因为getTargetMap的生成是按照节点树生成的
                    pushNestedPrefab(nodeIter, prefabInstance.prefabRootNode, targetPath);
                    // 避免死循环
                    if (nodeIter !== prefabInstance.prefabRootNode) {
                        nodeIter = prefabInstance.prefabRootNode;
                    } else {
                        console.warn('getOutMostPrefabInstanceInfo failed: prefab instance root node has loop');
                        break;
                    }
                    continue;
                }
            }
            nodeIter = nodeIter.parent;
        }

        return { outMostPrefabInstanceNode, targetPath };
    }

    isSceneNode(node: Node) {
        if (node instanceof Scene) {
            return true;
        }

        return false;
    }

    /**
     * 是否是嵌套的预制体
     * @param node
     * @private
     */
    private isNestedPrefab(node: Node) {
        const prefab = node['_prefab'];
        const assetUuid = prefab?.asset?.uuid;
        if (!prefab || !assetUuid) return false;

        let parent = node.parent;
        while (parent) {
            // 向上遍历到场景
            if (parent === parent.scene) {
                break;
            }
            const parentPrefabInfo = parent['_prefab'];
            if (parentPrefabInfo && assetUuid !== parentPrefabInfo.asset?.uuid) {
                // 如果检查的节点是预制体根节点就直接 true
                if (prefab.instance) {
                    return true;
                }
                const isNested = this.isNestedPrefab(parent);
                if (!isNested) {
                    return true;
                }
            }
            parent = parent.parent;
        }
        return false;
    }

    public getPrefabStateInfo(node: Node) {
        let prefabState = PrefabState.NotAPrefab;
        let isUnwrappable = false;
        let isRevertable = false;
        let isApplicable = false;
        let isAddedChild = false;
        let isNested = false;
        let assetUuid = '';

        if (this.isSceneNode(node)) {
            return { state: prefabState, isUnwrappable, isRevertable, isApplicable, isAddedChild, isNested, assetUuid };
        }

        // @ts-ignore
        if (node['_prefab']) {
            // @ts-ignore
            if (node['_prefab'].asset) {
                // @ts-ignore
                assetUuid = node['_prefab'].asset._uuid;
            }

            // @ts-ignore
            const prefabInstance = node['_prefab'].instance;

            if (prefabInstance) {
                isUnwrappable = true;
                isRevertable = true;
                isApplicable = true;
                prefabState = PrefabState.PrefabInstance;
                const { outMostPrefabInstanceNode } = this.getOutMostPrefabInstanceInfo(node);
                if (outMostPrefabInstanceNode !== node) {
                    isUnwrappable = false;
                    isRevertable = false;
                    isApplicable = false;
                }
            } else {
                prefabState = PrefabState.PrefabChild;
            }

            // 检查是否是嵌套 prefab
            isNested = this.isNestedPrefab(node);

            // @ts-ignore
            if (!node['_prefab'].asset || node['_prefab'].asset.isDefault || node['_prefab'].asset.uuid === '') {
                prefabState = PrefabState.PrefabLostAsset;
                // 资源丢失时要允许unlink
                isUnwrappable = true;
            }

            if (this.isSubAsset(assetUuid)) {
                isApplicable = false;
            }
        }

        if (node.parent && !this.isSceneNode(node.parent)) {
            // @ts-ignore
            const parentPrefabInfo = node.parent['_prefab'];
            if (parentPrefabInfo) {
                const outMostPrefabInstanceInfo = this.getOutMostPrefabInstanceInfo(node.parent);
                if (outMostPrefabInstanceInfo && outMostPrefabInstanceInfo.outMostPrefabInstanceNode) {
                    if (this.isMountedChildOf(outMostPrefabInstanceInfo.outMostPrefabInstanceNode, node)) {
                        isAddedChild = true;
                    }
                }
            }

        }

        return { state: prefabState, isUnwrappable, isRevertable, isApplicable, isAddedChild, isNested, assetUuid };
    }

    public getMountedRoot(nodeOrComp: Node | Component) {
        return nodeOrComp[editorExtrasTag]?.mountedRoot;
    }

    public setMountedRoot(nodeOrComp: Node | Component, mountedRoot: Node | undefined) {
        if (!nodeOrComp) {
            return;
        }

        if (!nodeOrComp[editorExtrasTag]) {
            nodeOrComp[editorExtrasTag] = {};
        }
        nodeOrComp[editorExtrasTag].mountedRoot = mountedRoot;
    }

    // 待优化，这里要是增加的节点多了会比较费时
    private isMountedChildOf(prefabInstanceNode: Node, node: Node) {
        const mountedRoot = this.getMountedRoot(node);
        if (mountedRoot && mountedRoot === prefabInstanceNode) {
            return true;
        }

        return false;
    }

    public isMountedComponent(component: Component) {
        const node = component.node;

        if (!node) {
            return false;
        }

        const outMostPrefabInstanceInfo = this.getOutMostPrefabInstanceInfo(node);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return false;
        }

        const mountedRoot = this.getMountedRoot(component);

        if (mountedRoot && mountedRoot === outMostPrefabInstanceNode) {
            return true;
        }

        return false;
    }

    public getRemovedComponents(node: Node) {
        const removedComps: Component[] = [];
        // @ts-ignore
        const prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            return removedComps;
        }

        const outMostPrefabInstanceInfo = this.getOutMostPrefabInstanceInfo(node);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return removedComps;
        }
        const targetPath: string[] = outMostPrefabInstanceInfo.targetPath;
        // @ts-ignore
        const outMostPrefabInstance: Prefab._utils.PrefabInstance | undefined = outMostPrefabInstanceNode['_prefab']?.instance;

        // @ts-ignore
        const outMostPrefabInfo = outMostPrefabInstanceNode['_prefab'];
        if (outMostPrefabInstance && outMostPrefabInfo && outMostPrefabInfo.asset) {

            if (outMostPrefabInstance.removedComponents.length <= 0) {
                return removedComps;
            }

            targetPath.splice(0, 1);
            targetPath.push(prefabInfo.fileId);

            const assetRootNode = this.getPrefabAssetNodeInstance(outMostPrefabInfo);
            if (!assetRootNode) {
                return removedComps;
            }

            const assetNode = this.getTarget(targetPath, assetRootNode, true) as Node;
            if (!assetNode) {
                return removedComps;
            }

            const curCompFileIDs = node.components.map((comp) => comp.__prefab?.fileId).filter((id) => !!id);
            for (const assetComp of assetNode.components) {
                if (assetComp.__prefab) {
                    if (!curCompFileIDs.includes(assetComp.__prefab.fileId)) {
                        removedComps.push(assetComp);
                    }
                }
            }
        }

        return removedComps;
    }

    public checkToRemoveTargetOverride(source: Node | Component, root: Node | Scene | null) {
        if (!root) {
            return;
        }
        // @ts-ignore
        if (this.removeTargetOverrideBySource(root['_prefab'], source)) {
            this.fireChangeMsg(root);
        }
    }

    public findOutmostPrefabInstanceNodes(node: Node | null, instanceRoots: Node[]) {
        if (!node) return;

        const prefabInfo = node['_prefab'];

        if (prefabInfo?.instance) {
            // 遇到预制体时，要对mountedchildren进行递归,不能无脑对子节点递归
            instanceRoots.push(node);

            // 清空预制体及其嵌套预制体的nestedPrefabInstanceRoots
            if (prefabInfo.nestedPrefabInstanceRoots) {
                prefabInfo.nestedPrefabInstanceRoots.forEach((prefabNode: Node) => {
                    // @ts-ignore
                    if (prefabNode['_prefab']) {
                        // @ts-ignore
                        prefabNode['_prefab'].nestedPrefabInstanceRoots = undefined;
                    }
                });
                prefabInfo.nestedPrefabInstanceRoots = undefined;
            }

            prefabInfo.instance?.mountedChildren?.forEach((mountedChildrenInfo: any) => {
                mountedChildrenInfo.nodes.forEach((child: any) => {
                    this.findOutmostPrefabInstanceNodes(child, instanceRoots);
                });
            });
        } else {
            // 普通节点一直递归
            node.children.forEach((child: any) => {
                this.findOutmostPrefabInstanceNodes(child, instanceRoots);
            });
        }
    }

    gatherPrefabInstanceRoots(rootNode: Node | Scene) {
        // gather prefabInstance node info
        const instanceRoots: Node[] = [];
        rootNode.children.forEach((child: Node) => {
            if (isEditorNode(child as Node)) {
                return;
            }
            this.findOutmostPrefabInstanceNodes(child as Node, instanceRoots);
        });

        if (instanceRoots.length > 0) {
            if (!rootNode['_prefab']) {
                rootNode['_prefab'] = this.createPrefabInfo(rootNode.uuid);
            }
            const rootPrefabInfo = rootNode['_prefab'];
            rootPrefabInfo.nestedPrefabInstanceRoots = instanceRoots;
        } else {
            const rootPrefabInfo = rootNode['_prefab'];
            if (rootPrefabInfo) {
                rootPrefabInfo.nestedPrefabInstanceRoots = undefined;
            }
        }
    }

    // public collectPrefabInstanceIDs(rootNode: Node){
    //     const prefabInfo = this.getPrefab(rootNode);
    //     const instances = prefabInfo?.nestedPrefabInstanceRoots;
    //     if (instances && instances.length > 0) {
    //         // 遍历instance上所有子节点（包括mounted的节点）
    //         instances.forEach(node => {
    //             const prefab = this.getPrefab(node);
    //             if (prefab && !this.getMountedRoot(node)) {
    //                 const ids: string[] = [];
    //                 node.walk((child) => {
    //                     ids.push(child.uuid);
    //                     child.components.forEach(component => {
    //                         if (component.uuid){
    //                             ids.push(component.uuid);
    //                         }
    //                     });
    //                 });
    //                 if (prefab.instance?.ids) {
    //                     prefab.instance.ids = ids;
    //                 }
    //                 // console.log('收集后的预制体id', prefab.instance?.ids.length);
    //             }
    //         });
    //     }
    // }

    // prefab 是否是子资源，比如FBX生成的prefab
    public isSubAsset(uuid: string) {
        return uuid.includes('@');
    }

    public removePrefabInfo(node: Node) {
        this.fireBeforeChangeMsg(node);

        // @ts-ignore member access
        node['_prefab'] = null;

        // remove component prefabInfo
        node.components.forEach((comp) => {
            comp.__prefab = null;
        });

        this.fireChangeMsg(node);
    }

    // 有可能一些意外情况导致错误的MountedRoot的引用
    // 导致序列化了一些无效的数据
    // 这里校验MountedRoot的数是否准确
    public checkMountedRootData(node: Node, recursively: boolean) {
        const mountedRoot = this.getMountedRoot(node);

        if (mountedRoot) {
            let isRight = false;
            // @ts-ignore
            const prefabInstance = mountedRoot['_prefab']?.instance;
            if (prefabInstance && prefabInstance.mountedChildren) {
                for (let i = 0; i < prefabInstance.mountedChildren.length; i++) {
                    const mountedInfo = prefabInstance.mountedChildren[i];
                    if (mountedInfo.nodes.includes(node)) {
                        isRight = true;
                        break;
                    }
                }
            }

            if (!isRight) {
                // 校验不通过，删除MountedRoot数据
                this.setMountedRoot(node, undefined);
            }
        }

        node.components.forEach((comp) => {
            const compMountedRoot = this.getMountedRoot(comp);
            if (compMountedRoot) {
                let isRight = false;
                // @ts-ignore
                const prefabInstance = compMountedRoot['_prefab']?.instance;
                if (prefabInstance && prefabInstance.mountedComponents) {
                    for (let i = 0; i < prefabInstance.mountedComponents.length; i++) {
                        const mountedInfo = prefabInstance.mountedComponents[i];
                        if (mountedInfo.components.includes(comp)) {
                            isRight = true;
                            break;
                        }
                    }
                }

                if (!isRight) {
                    // 校验不通过，删除MountedRoot数据
                    this.setMountedRoot(comp, undefined);
                }
            }
        });

        if (recursively) {
            node.children.forEach((child) => {
                this.checkMountedRootData(child, true);
            });
        }
    }

    public removePrefabInstanceRoots(rootNode: Node | Scene) {
        const prefabInfo = rootNode['_prefab'];
        if (prefabInfo) {
            prefabInfo.nestedPrefabInstanceRoots = undefined;
        }
    }

    // 有些targetOverride里的source都为空了，需要去掉这些
    // 冗余数据
    public checkTargetOverridesData(node: Node | Scene) {
        const prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            return;
        }

        const targetOverrides = prefabInfo.targetOverrides;
        if (!targetOverrides) {
            return;
        }

        for (let i = targetOverrides.length - 1; i >= 0; i--) {
            const targetOverrideItr = targetOverrides[i];
            if (!targetOverrideItr || !targetOverrideItr.source) {
                targetOverrides.splice(i, 1);
            }
        }
    }

    /**
     * 判断节点是否是最外一层的PrefabInstance的Mounted节点
     * mountedChild的普通子节点也需要判断
     * @param node
     * @returns
     */
    public isOutmostPrefabInstanceMountedChildren(node: Node) {
        let nodeIter: Node | null = node;
        while (nodeIter) {
            const mountedRoot = this.getMountedRoot(nodeIter);
            if (mountedRoot) {
                const outMostPrefabInstanceInfo = this.getOutMostPrefabInstanceInfo(mountedRoot);
                const outMostPrefabInstanceNode = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
                // 节点是挂在最外层的PrefabInstance下的mountedChildren
                if (outMostPrefabInstanceNode === mountedRoot) {
                    return true;
                }
            }
            nodeIter = nodeIter.parent;
            if (!nodeIter || this.isPrefabInstanceRoot(nodeIter)) {
                break;
            }
        }
        return false;
    }

    /**
     * 移除无效的propertyOverrides信息,移除组件时，需要移除关于该组件的propertyOverrides
     * @param root 预制体实例节点
     */
    public removeInvalidPropertyOverrides(root: Node) {
        const prefabInfo = root['_prefab'];
        if (prefabInfo && prefabInfo.instance) {
            const instance = prefabInfo.instance;
            const propertyOverrides = instance.propertyOverrides;
            const size = propertyOverrides.length;
            const targetMap = this.getTargetMap(root);
            if (!targetMap || Object.keys(targetMap).length === 0) {
                console.debug('removeInvalidPropertyOverrides return,targetMap is empty', root);
                return;
            }
            for (let index = size - 1; index >= 0; index--) {
                const propOverride = propertyOverrides[index];
                const targetInfo = propOverride.targetInfo;
                if (targetInfo) {
                    // 判断targetInfo是否存在，不存在的话，移除数据
                    const target = Prefab._utils.getTarget(targetInfo.localID, targetMap);
                    if (!target) {
                        propertyOverrides.splice(index, 1);
                        // console.log('移除无效的propertyOverrides信息', propOverride);
                    }
                }
            }
        }
    }

    /**
     * 脚本属性不存在时，或者预制体内的子节点/组件丢失时,要移除数据
     * @param root
     * @returns
     */
    public removeInvalidTargetOverrides(root: Node) {
        const prefabInfo = root?.['_prefab'];
        if (prefabInfo) {
            const targetOverrides = prefabInfo.targetOverrides;
            if (!targetOverrides) return;
            for (let index = targetOverrides.length - 1; index >= 0; index--) {
                const info: TargetOverrideInfo = targetOverrides[index];
                // 判断引用节点是否存在
                let source: Node | Component | null = info.source;
                const sourceInfo = info.sourceInfo;
                let target: Node | Component | null = null;
                const targetInfo = info.targetInfo;
                if (sourceInfo) {
                    if (info.source instanceof Node) {
                        source = this.getTarget(sourceInfo.localID, info.source);
                    }
                }

                // source (引用的节点或组件)
                // info.target (被引用的目标节点的预制体根节点)
                // targetInfo (被引用的 TargetInfo 信息，用来定位具体在哪个)

                // 1.如果 source 与 info.target 都没有也就是查询不到 target 也需要剔除
                if (!source && !info.target) {
                    targetOverrides.splice(index, 1);
                    continue;
                }
                // 2.如果没有 source 存在 info.target 也存在 targetInfo，但是需要查询一下是否有 target，如果没有就进行剔除
                if (!source && info.target && targetInfo && targetInfo.localID) {
                    target = this.getTarget(targetInfo.localID, info.target);
                    if (!target) {
                        targetOverrides.splice(index, 1);
                        continue;
                    }
                }

                if (!source || !targetInfo) {
                    continue;
                }

                if (!(info.target instanceof Node)) {
                    continue;
                }

                target = this.getTarget(targetInfo.localID, info.target);
                if (!target) {
                    continue;
                }

                // 属性不存在，目标不存在,类型不一致，则移除属性
                const propertyPath = info.propertyPath.slice();
                let targetPropOwner: any = source;
                for (let i = 0; i < propertyPath.length; i++) {
                    const propName = propertyPath[i];
                    const attr = CCClass.Attr.getClassAttrs(targetPropOwner.constructor);
                    targetPropOwner = targetPropOwner[propName];
                    // propertyPath中间可能会断掉，比如数组被清空
                    if (!targetPropOwner) {
                        targetOverrides.splice(index, 1);
                        break;
                    }
                    if (i === propertyPath.length - 1) {
                        const attrKey = propName + DELIMETER + 'ctor';
                        // 条件一: 当前值的属性目标值类型匹配
                        // 条件二：脚本中的属性类型（attr的ctor）应该是target的父类
                        // #14140 #14944 #13612 #14007
                        // 这里的逻辑经过反复修改，因为可能性实在太多了
                        // 需要考虑数组变化，类型变化，值残留，自定义类型，子类等
                        // 后续应该将清理的操作用户变成用户主动操作,在面板中显示实例上的override信息，并提供删除选项
                        if (!isInClassChain(targetPropOwner.constructor, target.constructor)
                            || (attr && attr[attrKey] && !isInClassChain(target.constructor, attr[attrKey]))) {
                            targetOverrides.splice(index, 1);
                        }
                    }
                }
            }
        }
    }
    /**
     * 清理预制体冗余数据
     * @param root
     */
    public removeInvalidPrefabData(root: Node) {
        // 清理targetOverrides
        this.removeInvalidTargetOverrides(root);

        // 清理propertyOverrides
        const prefabInfo = root['_prefab'];
        const nestedInstance = prefabInfo?.nestedPrefabInstanceRoots;
        if (nestedInstance) {
            // 嵌套预制体
            nestedInstance.forEach((node: Node) => {
                this.removeInvalidPropertyOverrides(node);
            });
        }
    }

    /**
     * 清除预制体中，嵌套预制体的propertOverrides对非预制体子节点的引用
     * @param root 预制体根节点
     * @return {nestedPrefabInstanceRoots:{illegalReference}}
     */
    public removeInvalidPropertyOverrideReference(root: Node) {
        const prefabInfo = this.getPrefab(root);
        const ret = new Map();
        if (prefabInfo) {
            prefabInfo.nestedPrefabInstanceRoots?.forEach((prefabInstanceNode: Node) => {
                const nestPrefabInfo = this.getPrefab(prefabInstanceNode);
                const propertyOverrides = nestPrefabInfo?.instance?.propertyOverrides;
                if (propertyOverrides) {
                    for (let index = propertyOverrides.length - 1; index >= 0; index--) {
                        const props = propertyOverrides[index];
                        let val: any = props.value;
                        if (val instanceof cc.Component.EventHandler) {
                            val = val.target;
                        } else if (val instanceof cc.Component) {
                            val = val.node;
                        }
                        if (val && val instanceof cc.Node && !val.isChildOf(root)) {
                            // console.warn('cleanIllegalPropertyOverrideReference', props);
                            propertyOverrides.splice(index, 1);
                            let backUp = ret.get(prefabInstanceNode);
                            if (!backUp) {
                                backUp = [];
                                ret.set(prefabInstanceNode, backUp);
                            }
                            backUp.push(props);
                        }
                    }

                }
            });
        }
        return ret;
    }
}

export const prefabUtils = new PrefabUtil();
