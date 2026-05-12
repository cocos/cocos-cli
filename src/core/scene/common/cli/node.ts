import type { INodeProperties } from '../node';
import type { IComponentInfo } from './component';
import type { IComponentIdentifier } from '../component';
import type { IPrefabInfo } from './prefab';

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
