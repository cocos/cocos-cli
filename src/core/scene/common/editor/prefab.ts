import type { INode } from '../node';
import type { IComponentIdentifier } from '../component';
import type { IBaseIdentifier } from './base';

/**
 * 预制体信息
 */
export interface IPrefab extends IBaseIdentifier {
    name: string;
    children: INode[];
    components: IComponentIdentifier[];
}
