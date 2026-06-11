import type { INodeIdentifier, INodeInfo } from './node';
import type { IComponentIdentifier } from './component';
import type { IBaseIdentifier } from '../editor/base';
import type { IPrefabInfo } from './prefab';

export interface ISceneInfo extends IBaseIdentifier {
    name: string;
    prefab: IPrefabInfo | null;
    children?: INodeIdentifier[];
    components?: IComponentIdentifier[];
}
