import type { IVec3 } from '../value-types';
import type { MobilityMode } from '../node';
import type { IComponentInfo, IComponentIdentifier } from './component';
import type { IPrefabInfo } from './prefab';

// 节点基础属性接口
export interface INodeProperties {
    position: IVec3; // 节点位置
    rotation: IVec3; // 节点旋转，欧拉角
    scale: IVec3; // 节点缩放
    mobility: MobilityMode; // 节点的移动性
    layer: number; // 节点所在的层级
    active: boolean; // 节点是否激活
}

// 节点更新参数接口
export interface IUpdateNodeParams {
    path: string;
    name?: string;
    properties?: Partial<INodeProperties>; // 节点属性
}

// 节点更新结果接口
export interface IUpdateNodeResult {
    path: string; // 节点相对根节点路径
}

export interface INodeIdentifier {
    nodeId: string;
    path: string;
    name: string;
}

export interface INodeInfo extends INodeIdentifier {
    properties: INodeProperties;
    components?: IComponentInfo[] | IComponentIdentifier[];
    children?: INodeInfo[];
    prefab: IPrefabInfo | null;
}
