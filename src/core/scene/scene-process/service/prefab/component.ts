import { Scene, Component, instantiate, js, MissingScript, Node, Prefab } from 'cc';
import { prefabUtils } from './utils';
import dumpUtil from '../dump';
import { Rpc } from '../../rpc';
import { Service } from '../core';
// import { SceneUndoCommand } from '../../../export/undo';

const nodeMgr = EditorExtends.Node;

type CompPrefabInfo = Prefab._utils.CompPrefabInfo;
const CompPrefabInfo = Prefab._utils.CompPrefabInfo;
type PrefabInstance = Prefab._utils.PrefabInstance;

export interface IComponentPrefabData {
    prefabInfo: CompPrefabInfo | null;
}

export interface IRemovedComponentInfo {
    nodeUUID: string;
    compIndex: number;
    compData: Component;
}

// class ApplyRemoveComponentCommand extends SceneUndoCommand {
//     public removedCompInfo: IRemovedComponentInfo | null = null;
//     private _undoFunc: Function;
//     private _redoFunc: Function;
//     constructor(undoFunc: Function, redoFunc: Function) {
//         super();
//         this._undoFunc = undoFunc;
//         this._redoFunc = redoFunc;
//     }
//
//     public async undo() {
//         if (this.removedCompInfo) {
//             this._undoFunc(this.removedCompInfo);
//         }
//     }
//
//     public async redo() {
//         if (this.removedCompInfo) {
//             this._redoFunc(this.removedCompInfo.nodeUUID, this.removedCompInfo.compData.__prefab!.fileId);
//         }
//     }
// }

/**
 * Component 相关的操作
 */
class ComponentOperation {
    public isRevertingRemovedComponents = false;
    public isRemovingMountedComponents = false;
    private compMap: { [index: string]: Component } = {}; // uuid->comp映射表，用于diff比较

    public cacheComp(comp: Component) {
        this.compMap[comp.uuid] = comp._instantiate()!;
    }

    public getCachedComp(uuid: string) {
        return this.compMap[uuid];
    }

    public clearCompCache() {
        this.compMap = {};
    }

    public onAddComponent(comp: Component) {
        this.cacheComp(comp);
        if (this.isRevertingRemovedComponents) {
            return;
        }
        const node = comp.node;
        // @ts-ignore
        if (node && node['_prefab']) {
            this.updateMountedComponents(node);
        }
    }

    public onComponentAdded(comp: Component) {
        this.cacheComp(comp);

        if (Service.Editor.getCurrentEditorType() === 'prefab' && comp.node &&
            // @ts-ignore
            comp.node['_prefab']) {
            // prefab节点上的Component需要添加prefab信息
            if (!comp.__prefab) {
                comp.__prefab = new CompPrefabInfo();
                comp.__prefab!.fileId = comp.uuid;
            }
        }
    }

    public onRemoveComponentInGeneralMode(comp: Component, rootNode: Node | Scene | null) {
        if (this.isRemovingMountedComponents) {
            return;
        }

        const node = comp.node;
        // @ts-ignore
        if (node && node['_prefab']) {
            const mountedRoot = prefabUtils.getMountedRoot(comp);
            if (comp.__prefab && !mountedRoot) {
                this.onPrefabComponentRemoved(comp);
            } else {
                this.updateMountedComponents(node);
            }
        }
    }

    private onPrefabComponentRemoved(comp: Component) {
        const compPrefabInfo = comp.__prefab;
        if (!compPrefabInfo) {
            return;
        }

        const node = comp.node;
        // @ts-ignore
        const prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            return;
        }

        // 向上查找PrefabInstance路径
        const outMostPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(node);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return;
        }
        const targetPath: string[] = outMostPrefabInstanceInfo.targetPath;
        // @ts-ignore
        const outMostPrefabInstance: Prefab._utils.PrefabInstance | undefined = outMostPrefabInstanceNode['_prefab']?.instance;

        if (outMostPrefabInstance) {
            targetPath.splice(0, 1); // 不需要存最外层的PrefabInstance的fileID，方便override可以在PrefabInstance复制后复用  
            targetPath.push(compPrefabInfo.fileId);

            prefabUtils.fireBeforeChangeMsg(outMostPrefabInstanceNode);

            prefabUtils.addRemovedComponent(outMostPrefabInstance, targetPath);

            prefabUtils.fireChangeMsg(outMostPrefabInstanceNode);
        }
    }

    public onComponentRemovedInGeneralMode(comp: Component, rootNode: Node | Scene | null) {
        if (this.isRemovingMountedComponents) {
            return;
        }

        prefabUtils.checkToRemoveTargetOverride(comp, rootNode);
    }

    /**
     * 将 PrefabInstance 上删除的组件应用到 PrefabAsset 中
     * @param nodeUUID 节点的uuid
     * @param fileID component的fileID
     */
    public async doApplyRemovedComponent(nodeUUID: string, fileID: string): Promise<null | IRemovedComponentInfo> {
        const node = nodeMgr.getNode(nodeUUID);

        if (!node) {
            return null;
        }

        const outMostPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(node);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return null;
        }
        const targetPath: string[] = outMostPrefabInstanceInfo.targetPath;
        // @ts-ignore
        const outMostPrefabInstance: Prefab._utils.PrefabInstance | undefined = outMostPrefabInstanceNode['_prefab']?.instance;

        // @ts-ignore
        const outMostPrefabInfo = outMostPrefabInstanceNode['_prefab'];
        if (outMostPrefabInstance && outMostPrefabInfo && outMostPrefabInfo.asset) {
            const assetUUID = outMostPrefabInfo.asset._uuid;
            // 如果是子资源，则不能应用
            if (prefabUtils.isSubAsset(assetUUID)) {
                console.warn('can\'t apply RemovedComponent in SubAsset Prefab');
                return null;
            }

            targetPath.splice(0, 1);
            targetPath.push(fileID);

            const assetRootNode = prefabUtils.getPrefabAssetNodeInstance(outMostPrefabInfo);
            if (!assetRootNode) {
                return null;
            }

            const targetCompInAsset = prefabUtils.getTarget(targetPath, assetRootNode) as Component;
            const compIndex = targetCompInAsset.node.components.indexOf(targetCompInAsset);
            const compData = targetCompInAsset._instantiate();
            if (!compData) {
                return null;
            }

            // #14002 移除组件是嵌套预制体的组件，需要额外处理。是mounted的组件就移除mounted信息，不是的话要更新removedComponents属性
            // 可以参考applyPrefab的结果 
            if (node['_prefab']?.instance && node['_prefab']?.instance !== outMostPrefabInstance) {
                // @ts-ignore
                const assetRootPrefabInfo = assetRootNode._prefab!;
                const oldInstance = assetRootPrefabInfo.instance;
                assetRootPrefabInfo.instance = undefined;
                this.onRemoveComponentInGeneralMode(targetCompInAsset, assetRootNode);
                assetRootPrefabInfo.instance = oldInstance;
            }

            // 删除Component
            targetCompInAsset._destroyImmediate();

            // 去掉instance,否则里边的mountedRoot会被消除
            // @ts-ignore
            const assetRootNodePrefab = assetRootNode['_prefab'];
            if (assetRootNodePrefab) {
                assetRootNodePrefab.instance = undefined;
            }

            const ret = prefabUtils.generatePrefabDataFromNode(assetRootNode);

            if (!ret) return null;
            const prefabData = ret.prefabData;

            const info = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [outMostPrefabInfo.asset._uuid]);

            if (!info) return null;

            prefabUtils.fireBeforeChangeMsg(outMostPrefabInstanceNode);
            prefabUtils.deleteRemovedComponent(outMostPrefabInstance, targetPath);
            prefabUtils.fireChangeMsg(outMostPrefabInstanceNode);

            await Rpc.getInstance().request('assetManager', 'createAsset', [{
                target: info.source,
                content: prefabData,
                overwrite: true
            }]);

            // cce.SceneFacadeManager.abortSnapshot();
            return {
                nodeUUID,
                compIndex,
                compData,
            };
        }

        return null;
    }

    /**
     * undo ApplyRemovedComponent 操作
     * @param IRemovedComponentInfo 移除的component信息
     */
    public async undoApplyRemovedComponent(removedCompInfo: IRemovedComponentInfo) {
        if (!removedCompInfo) {
            return;
        }

        const node = nodeMgr.getNode(removedCompInfo.nodeUUID);

        if (!node) {
            return;
        }

        const outMostPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(node);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return;
        }
        const targetPath: string[] = outMostPrefabInstanceInfo.targetPath;
        // @ts-ignore
        const outMostPrefabInstance: Prefab._utils.PrefabInstance | undefined = outMostPrefabInstanceNode['_prefab']?.instance;

        // @ts-ignore
        const outMostPrefabInfo = outMostPrefabInstanceNode['_prefab'];
        if (outMostPrefabInstance && outMostPrefabInfo && outMostPrefabInfo.asset) {
            targetPath.splice(0, 1);
            const nodeLocalID = targetPath.slice();
            // @ts-ignore
            nodeLocalID.push(node['_prefab'].fileId);
            const compFileID = removedCompInfo.compData.__prefab!.fileId;
            targetPath.push(compFileID);

            const assetRootNode = prefabUtils.getPrefabAssetNodeInstance(outMostPrefabInfo);
            if (!assetRootNode) {
                return;
            }

            const nodeInAsset = prefabUtils.getTarget(nodeLocalID, assetRootNode);
            // @ts-ignore
            nodeInAsset._addComponentAt(removedCompInfo.compData, removedCompInfo.compIndex);

            const ret = prefabUtils.generatePrefabDataFromNode(assetRootNode);

            if (!ret) return;

            const info = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [outMostPrefabInfo.asset._uuid]);
            if (!info) return;

            prefabUtils.fireBeforeChangeMsg(outMostPrefabInstanceNode);
            prefabUtils.addRemovedComponent(outMostPrefabInstance, targetPath);
            prefabUtils.fireChangeMsg(outMostPrefabInstanceNode);

            await Rpc.getInstance().request('assetManager', 'createAsset', [{
                target: info.source,
                content: ret.prefabData,
                overwrite: true
            }]);
            // cce.SceneFacadeManager.abortSnapshot();
        }
    }

    public async applyRemovedComponent(nodeUUID: string, fileID: string) {
        // const command = new ApplyRemoveComponentCommand(
        //     this.undoApplyRemovedComponent.bind(this), this.doApplyRemovedComponent.bind(this));
        // const undoID = cce.SceneFacadeManager.beginRecording(nodeUUID, { customCommand: command });
        const removedCompInfo = await this.doApplyRemovedComponent(nodeUUID, fileID);
        if (removedCompInfo) {
            // command.removedCompInfo = removedCompInfo;
            // cce.SceneFacadeManager.endRecording(undoID);
            // cce.SceneFacadeManager.snapshot();
            // cce.SceneFacadeManager.abortSnapshot();
        } else {
            // cce.SceneFacadeManager.cancelRecording(undoID);
        }
    }

    public async cloneComponentToNode(node: Node, clonedComp: Component) {
        const copyCompDump = dumpUtil.dumpComponent(clonedComp);
        // 不要同步_objFlags，否则因为没有onEnable的标记会导致onDisable不被调用
        // delete copyCompDump.value._objFlags;
        const newComp = node.addComponent(js.getClassName(clonedComp));

        const components = node.components;
        if (components && components.length) {
            const lastIndex = components.length - 1;
            const lastComp = components[lastIndex];
            if (lastComp && lastComp === newComp) {
                await dumpUtil.restoreProperty(node, `__comps__.${lastIndex}`, copyCompDump);

                // MissingScript的_$erialized要特殊还原
                if (newComp instanceof MissingScript) {
                    // 这里_$erialized因为有node引用没法简单的clone出一份，只能
                    // 先用prefabAsset上的component身上的那份数据
                    // @ts-expect-error
                    newComp._$erialized = clonedComp._$erialized;
                }
            }
        }
    }

    /**
     * 撤销 removedComponent，会将PrefabAsset中的Component还原到当前节点上
     * @param nodeUUID node的UUID
     * @param fileID component的fileID
     */
    public async revertRemovedComponent(nodeUUID: string, fileID: string) {
        const node = nodeMgr.getNode(nodeUUID);

        if (!node) {
            return;
        }

        const outMostPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(node);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return;
        }
        const targetPath: string[] = outMostPrefabInstanceInfo.targetPath;
        // @ts-ignore
        const outMostPrefabInstance: Prefab._utils.PrefabInstance | undefined = outMostPrefabInstanceNode['_prefab']?.instance;

        // @ts-ignore
        const outMostPrefabInfo = outMostPrefabInstanceNode['_prefab'];
        if (outMostPrefabInstance && outMostPrefabInfo && outMostPrefabInfo.asset) {
            targetPath.splice(0, 1);
            targetPath.push(fileID);

            const assetRootNode = instantiate(outMostPrefabInfo.asset);
            if (!assetRootNode) {
                return;
            }
            // const undoId = cce.SceneFacadeManager.beginRecording([outMostPrefabInstanceNode.uuid, nodeUUID]);
            const targetCompInAsset = prefabUtils.getTarget(targetPath, assetRootNode) as Component;

            prefabUtils.fireBeforeChangeMsg(node);
            this.isRevertingRemovedComponents = true;
            await this.cloneComponentToNode(node, targetCompInAsset);
            this.isRevertingRemovedComponents = false;
            prefabUtils.fireChangeMsg(node);

            prefabUtils.fireBeforeChangeMsg(outMostPrefabInstanceNode);
            prefabUtils.deleteRemovedComponent(outMostPrefabInstance, targetPath);
            prefabUtils.fireChangeMsg(outMostPrefabInstanceNode);
            // cce.SceneFacadeManager.endRecording(undoId);
        }
    }

    public updateMountedComponents(node: Node) {
        // PrefabInstance中增加/删除Component，需要更新mountedComponents
        // @ts-ignore
        const prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            return;
        }

        // 向上查找PrefabInstance路径
        const outMostPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(node);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return null;
        }
        const targetPath: string[] = outMostPrefabInstanceInfo.targetPath;
        // @ts-ignore
        const outMostPrefabInfo = outMostPrefabInstanceNode['_prefab'];
        const outMostPrefabInstance: PrefabInstance | undefined = outMostPrefabInfo?.instance;

        if (!outMostPrefabInstanceNode || !outMostPrefabInfo || !outMostPrefabInstance) {
            return;
        }

        const assetRootNode = prefabUtils.getPrefabAssetNodeInstance(outMostPrefabInfo);
        if (!assetRootNode) {
            return;
        }

        targetPath.splice(0, 1); // 不需要存最外层的PrefabInstance的fileID，方便override可以在PrefabInstance复制后复用  
        targetPath.push(prefabInfo.fileId);

        const nodeInAsset: Node = prefabUtils.getTarget(targetPath, assetRootNode) as Node;
        if (!nodeInAsset) {
            return;
        }
        const compsFileIDs = nodeInAsset.components.map((comp) => {
            return comp.__prefab?.fileId;
        });

        const mountedComponents: Component[] = [];
        for (let i = 0; i < node.components.length; i++) {
            const comp = node.components[i];
            const compPrefabInfo = comp.__prefab;
            // 非Prefab中的component
            if (!compPrefabInfo) {
                mountedComponents.push(comp);
            } else {
                // 不在prefabAsset中的component，要加到mountedComponents
                if (!compsFileIDs.includes(comp.__prefab?.fileId)) {
                    // 1. mountedRoot为空表示为新加的Component
                    // 2. mountedRoot不为空需要查看是不是挂在这个PrefabInstance节点下的，因为可能是挂在
                    // 里层PrefabInstance里,这里就不应该重复添加
                    const mountedRoot = prefabUtils.getMountedRoot(comp);
                    if (!mountedRoot || mountedRoot === outMostPrefabInstanceNode) {
                        mountedComponents.push(comp);
                    }
                }
            }
        }

        prefabUtils.fireBeforeChangeMsg(outMostPrefabInstanceNode);

        if (mountedComponents.length > 0) {
            const mountedComponentsInfo = prefabUtils.getPrefabInstanceMountedComponents(outMostPrefabInstance, targetPath);
            mountedComponentsInfo.components = mountedComponents;
            mountedComponentsInfo.components.forEach((comp) => {
                prefabUtils.setMountedRoot(comp, outMostPrefabInstanceNode);
            });
        } else {
            for (let i = 0; i < outMostPrefabInstance.mountedComponents.length; i++) {
                const compInfo = outMostPrefabInstance.mountedComponents[i];
                if (compInfo.isTarget(targetPath)) {
                    compInfo.components.forEach((comp) => {
                        prefabUtils.setMountedRoot(comp, undefined);
                    });

                    outMostPrefabInstance.mountedComponents.splice(i, 1);
                    break;
                }
            }
        }

        prefabUtils.fireChangeMsg(outMostPrefabInstanceNode);
    }

    public applyMountedComponents(node: Node) {
        const rootNode: Node = node;

        // @ts-ignore
        const prefabInfo = rootNode['_prefab'];
        if (!prefabInfo) {
            return;
        }
        const prefabInstance = prefabInfo.instance;
        if (!prefabInstance) {
            return;
        }

        const mountedCompsMap = new Map<string[], IComponentPrefabData>();
        const mountedComponents = prefabInstance.mountedComponents;

        for (let i = 0; i < mountedComponents.length; i++) {
            const mountedComponentInfo = mountedComponents[i];
            const targetInfo = mountedComponentInfo.targetInfo;
            if (!targetInfo) continue;

            const target = prefabUtils.getTarget(targetInfo.localID, rootNode) as Node;
            if (!target) continue;

            // 把mountedComponentInfo中的组件加到PrefabAsset中
            mountedComponentInfo.components.forEach((mountedComp) => {
                if (!mountedComp.__prefab) {
                    mountedComp.__prefab = new CompPrefabInfo();
                    mountedComp.__prefab.fileId = mountedComp.uuid;
                }
                // 节点挂载嵌套预制体身上
                if (targetInfo.localID.length > 1) { 
                    prefabInfo.instance = undefined;
                    const nestedInstPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(target);
                    prefabInfo.instance = prefabInstance;
                    const nestedInstNode = nestedInstPrefabInstanceInfo.outMostPrefabInstanceNode;
                    if (!nestedInstNode) {
                        return;
                    }

                    // @ts-ignore
                    const nestedInstPrefabInfo = nestedInstNode['_prefab'];
                    if (!nestedInstPrefabInfo) {
                        return;
                    }
                    const nestedInstPrefabInstance = nestedInstPrefabInfo.instance;
                    if (!nestedInstPrefabInstance) {
                        return;
                    }

                    // @ts-ignore
                    const targetPrefabInfo = target['_prefab'];
                    if (!targetPrefabInfo) {
                        return;
                    }
                    // 更新预制体数据，localID从第二个开始(数据存在嵌套预制体实例上，所以可以忽略第一个fileID(自身))
                    const mountedNodePath = nestedInstPrefabInstanceInfo.targetPath.slice(1);
                    mountedNodePath.push(targetPrefabInfo.fileId);
                    const nestedMountedComponentInfo = prefabUtils.getPrefabInstanceMountedComponents(nestedInstPrefabInstance, mountedNodePath);
                    nestedMountedComponentInfo.components.push(mountedComp);
                    prefabUtils.setMountedRoot(mountedComp, nestedInstNode);
                    
                    // 记录undo索引数据,从根节点开始找，所以需要第一个fileID
                    const targetPath = nestedInstPrefabInstanceInfo.targetPath.slice();
                    targetPath.push(mountedComp.__prefab.fileId);
                    mountedCompsMap.set(targetPath, {prefabInfo: null});
                } else {
                    mountedCompsMap.set([mountedComp.__prefab.fileId], {prefabInfo: null});
                    prefabUtils.setMountedRoot(mountedComp, undefined);
                }
            });
        }

        prefabInstance.mountedComponents = [];

        return mountedCompsMap;
    }
}

export const componentOperation = new ComponentOperation();
