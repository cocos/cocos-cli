import type { INodeIdentifier } from '../node';
import type { IComponentIdentifier } from '../component';

export enum OptimizationPolicy {
    AUTO = 0,
    SINGLE_INSTANCE = 1,
    MULTI_INSTANCE = 2,
}

export interface IPrefabInstance {
    fileId: string;
    prefabRootNode?: INodeIdentifier;
    mountedChildren: IMountedChildrenInfo[];
    mountedComponents: IMountedComponentsInfo[];
    propertyOverrides: IPropertyOverrideInfo[];
    removedComponents: ITargetInfo[];
}

export interface IMountedChildrenInfo {
    targetInfo: ITargetInfo | null;
    nodes: INodeIdentifier[];
}

export interface IPropertyOverrideInfo {
    targetInfo: ITargetInfo | null;
    propertyPath: string[];
    value?: any;
}

export interface ITargetInfo {
    localID: string[];
}

export interface ICompPrefabInfo {
    fileId: string;
}

export interface IMountedComponentsInfo {
    targetInfo: ITargetInfo | null;
    components: IComponentIdentifier[];
}

export interface ITargetOverrideInfo {
    source: IComponentIdentifier | INodeIdentifier | null;
    sourceInfo: ITargetInfo | null;
    propertyPath: string[];
    target: INodeIdentifier | null;
    targetInfo: ITargetInfo | null;
}

export interface IPrefab {
    name: string;
    uuid: string;
    data: INodeIdentifier,
    optimizationPolicy: OptimizationPolicy,
    persistent: boolean,
}

export interface IPrefabInfo {
    /** 关联的预制体资源信息 */
    asset?: IPrefab;
    root?: INodeIdentifier;
    instance?: IPrefabInstance;
    fileId: string;
    targetOverrides: ITargetOverrideInfo[];
    nestedPrefabInstanceRoots: INodeIdentifier[];
}

export enum PrefabState {
    NotAPrefab = 0, // Normal node, not a Prefab
    PrefabChild = 1, // Child node of a Prefab, without PrefabInstance
    PrefabInstance = 2, // Root node of a Prefab that contains a PrefabInstance
    PrefabLostAsset = 3, // Prefab node with missing asset
}

export interface IPrefabStateInfo {
    state: PrefabState;
    isUnwrappable: boolean;
    isRevertable: boolean;
    isApplicable: boolean;
    isAddedChild: boolean;
    isNested: boolean;
    assetUuid: string;
}
