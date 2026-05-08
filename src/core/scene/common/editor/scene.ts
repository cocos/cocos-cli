import type { INode } from '../node';
import type { IComponentIdentifier } from '../component';
import type { IBaseIdentifier } from './base';
import { IPrefabInfo, ITargetOverrideInfoForEditor } from '../prefab';
import { IProperty } from '../../@types/public';

/**
 * 场景信息
 */
export interface IScene extends IBaseIdentifier {
    name: string;
    prefab: IPrefabInfo | null,
    children: INode[];
    components: IComponentIdentifier[];
}

export interface ISceneForEditor {
    name: IProperty;
    active: IProperty;
    locked: IProperty;
    _globals: Record<string, IProperty>;
    isScene: boolean;
    autoReleaseAssets: IProperty;

    uuid: IProperty;
    children: IProperty[];
    parent: string;
    __type__: string;
    targetOverrides?: ITargetOverrideInfoForEditor[];
}
