import { ITargetOverrideInfo } from '../prefab';
import { IProperty } from '../../@types/public';

export interface IScene {
    path: string;
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
    targetOverrides?: ITargetOverrideInfo[];
}
