import type { INode } from '../node';
import type { IComponent } from '../component';

export enum OptimizationPolicy {
    AUTO = 0,
    SINGLE_INSTANCE = 0,
    MULTI_INSTANCE = 1,
}

export interface IPrefabInstance {
    fileId: string;
    prefabRootNode?: INode;
    mountedChildren: IMountedChildrenInfo[];
    mountedComponents: IMountedComponentsInfo[];
    propertyOverrides: IPropertyOverrideInfo[];
    removedComponents: ITargetInfo[];
    targetMap: ITargetMap;
}

export interface IMountedChildrenInfo {
    targetInfo: ITargetInfo | null;
    nodes: INode[];
}

export interface IPropertyOverrideInfo {
    targetInfo: ITargetInfo | null;
    propertyPath: string[];
    value: any;
}

export interface ITargetInfo {
    localID: string[];
}

export interface ICompPrefabInfo {
    fileId: string;
}

export interface ITargetMap {
    [k: string]: ITargetMap | INode | IComponent;
}

export interface IMountedComponentsInfo {
    targetInfo: ITargetInfo | null;
    components: IComponent[];
}

export interface ITargetOverrideInfo {
    source: IComponent | INode | null;
    sourceInfo: ITargetInfo | null;
    propertyPath: string[];
    target: INode | null;
    targetInfo: ITargetInfo | null;
}

export interface IPrefab {
    name: string;
    uuid: string;
    data: INode,
    optimizationPolicy: OptimizationPolicy,
    persistent: boolean,
}

export interface IPrefabInfo {
    /** 关联的预制体资源信息 */
    asset?: IPrefab;
    root?: INode;
    instance?: IPrefabInstance;
    fileId: string;
    targetOverrides: ITargetOverrideInfo[];
    nestedPrefabInstanceRoots: INode[];
}
