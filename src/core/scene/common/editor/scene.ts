import type { INode } from '../node';
import type { IComponentIdentifier } from '../component';
import type { IBaseIdentifier } from './base';

/**
 * 场景信息
 */
export interface IScene extends IBaseIdentifier {
    name: string;
    children: INode[];
    components: IComponentIdentifier[];
}
