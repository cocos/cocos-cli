import type { Node } from 'cc';
import type { IServiceEvents } from '../../scene-process/service/core';
import { INode, IPrefab } from '../node';
import type {
    IApplyPrefabChangesParams,
    ICreatePrefabFromNodeParams,
    IGetPrefabInfoParams,
    IIsPrefabInstanceParams,
    IRevertToPrefabParams,
    IUnlinkPrefabParams,
    IUnpackPrefabInstanceParams
} from './params';

/**
 * 预制体事件类型
 */
export interface IPrefabEvents {

}

export interface IPublicPrefabService extends Omit<IPrefabService, keyof IServiceEvents | 'removePrefabInfoFromNode' | 'filterChildOfPrefabAssetWhenRemoveNode'> {
}

export interface IPrefabService extends IServiceEvents {
    /**
     * 将节点转换为预制体资源
     */
    createPrefabFromNode(params: ICreatePrefabFromNodeParams): Promise<INode>;

    /**
     * 将节点的修改应用回预制体资源
     */
    applyPrefabChanges(params: IApplyPrefabChangesParams): Promise<boolean>;

    /**
     * 重置节点到预制体原始状态
     */
    revertToPrefab(params: IRevertToPrefabParams): Promise<boolean>;

    /**
     * 解耦预制体实例，使其成为普通节点
     */
    unpackPrefabInstance(params: IUnpackPrefabInstanceParams): Promise<INode>;

    /**
     * 检查节点是否为预制体实例
     */
    isPrefabInstance(params: IIsPrefabInstanceParams): Promise<boolean>;

    /**
     * 获取节点的预制体信息
     */
    getPrefabInfo(params: IGetPrefabInfoParams): Promise<IPrefab | null>;

    /**
     * 解绑预制体实例，使其成为普通节点
     */
    unlinkPrefab(params: IUnlinkPrefabParams): Promise<boolean>;

    /**
     * 移除 prefab info
     * @param node
     * @param removeNested
     */
    removePrefabInfoFromNode(node: Node, removeNested?: boolean): void;

    /**
     * Filter out prefab asset children that cannot be removed from the current context.
     */
    filterChildOfPrefabAssetWhenRemoveNode(uuids: string | string[]): string[];
}
