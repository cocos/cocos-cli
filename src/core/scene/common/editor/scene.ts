import type { INode } from '../node';
import type { IComponentIdentifier } from '../component';
import type { IBaseIdentifier } from './base';
import { IPrefabInfo } from '../prefab';
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
    _globals: any;
    isScene: boolean;
    autoReleaseAssets: IProperty;

    uuid: IProperty;
    children: any[];
    parent: any;
    __type__: string;
    targetOverrides?: any;
}
