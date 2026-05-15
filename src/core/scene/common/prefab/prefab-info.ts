export interface ICompPrefabInfo {
    fileId: string;
}

export interface ITargetOverrideInfo {
    source: string;
    sourceInfo?: string[];
    propertyPath: string[];
    target: string;
    targetInfo?: string[];
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
