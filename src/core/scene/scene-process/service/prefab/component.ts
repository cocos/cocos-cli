import { Scene, Component, instantiate, js, MissingScript, Node, Prefab } from 'cc';
import { prefabUtils } from './utils';
import dumpUtil from '../dump';
import { Rpc } from '../../rpc';
import { Service } from '../core';
import { prefabWriteSession } from './write-session';
import { withPrefabCandidate } from './write-candidate';
import { reconcilePrefabWrite } from './write-runtime';
import type { IApplyPrefabInfo } from './node';

const nodeMgr = EditorExtends.Node;

type CompPrefabInfo = Prefab._utils.CompPrefabInfo;
const CompPrefabInfo = Prefab._utils.CompPrefabInfo;
type PrefabInstance = Prefab._utils.PrefabInstance;

export interface IComponentPrefabData {
    prefabInfo: CompPrefabInfo | null;
}

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

    /** Publish only the selected removed-component override, leaving other overrides intact. */
    public async applyRemovedComponent(nodeUUID: string, fileID: string): Promise<IApplyPrefabInfo | null> {
        const node = nodeMgr.getNode(nodeUUID);
        if (!node) return null;

        const { outMostPrefabInstanceNode, targetPath } = prefabUtils.getOutMostPrefabInstanceInfo(node);
        const prefabInfo = outMostPrefabInstanceNode && prefabUtils.getPrefab(outMostPrefabInstanceNode);
        const instance = prefabInfo?.instance;
        if (!outMostPrefabInstanceNode || !instance || !prefabInfo.asset) return null;
        const assetUuid = prefabInfo.asset._uuid;
        if (prefabUtils.isSubAsset(assetUuid)) return null;

        const componentPath = [...targetPath.slice(1), fileID];
        if (!instance.removedComponents.some(target =>
            target.localID.length === componentPath.length
            && target.localID.every((id, index) => id === componentPath[index]))) return null;

        const assetRoot = prefabUtils.getPrefabAssetNodeInstance(prefabInfo);
        if (!assetRoot) return null;
        const info = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [assetUuid]);
        if (!info) return null;

        const content = withPrefabCandidate(assetRoot, candidate => {
            const component = prefabUtils.getTarget(componentPath, candidate) as Component | null;
            if (!component) throw new Error('The removed component no longer exists in the Prefab source.');

            // A nested removal belongs to the outer source's override data. Apply the
            // existing nested/mounted rules only to the detached source candidate.
            const rootInfo = prefabUtils.getPrefab(candidate);
            if (rootInfo) rootInfo.instance = undefined;
            if (node['_prefab']?.instance && node['_prefab'].instance !== instance) {
                this.onRemoveComponentInGeneralMode(component, candidate);
            }
            component._destroyImmediate();
            const result = prefabUtils.generatePrefabDataFromNode(candidate);
            if (!result) throw new Error('Could not prepare the Prefab component removal.');
            return result.prefabData;
        });
        const receipt = await prefabWriteSession.commit(assetUuid, content);
        await reconcilePrefabWrite(receipt, async () => {
            try {
                prefabUtils.fireBeforeChangeMsg(outMostPrefabInstanceNode);
                prefabUtils.deleteRemovedComponent(instance, componentPath);
                prefabUtils.removePrefabAssetNodeInstanceCache(prefabInfo);
                prefabUtils.fireChangeMsg(outMostPrefabInstanceNode);
            } catch (error) {
                await prefabWriteSession.markUnavailable();
                throw error;
            }
        });
        return {
            nodeUUID: outMostPrefabInstanceNode.uuid,
            assetUuid,
            assetSource: info.source,
            oldPrefabContent: receipt.before.content,
            newPrefabContent: receipt.after.content,
            receipt,
        };
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
                    mountedCompsMap.set(targetPath, { prefabInfo: null });
                } else {
                    mountedCompsMap.set([mountedComp.__prefab.fileId], { prefabInfo: null });
                    prefabUtils.setMountedRoot(mountedComp, undefined);
                }
            });
        }

        prefabInstance.mountedComponents = [];

        return mountedCompsMap;
    }
}

export const componentOperation = new ComponentOperation();
