import type { IComponentIdentifier } from '../component';
import type { IPropertyValueType } from '../../@types/public';
import type { ICompPrefabInfo } from '../prefab';

export interface IComponentInfo extends IComponentIdentifier {
    properties: { [key: string]: IPropertyValueType };
    prefab: ICompPrefabInfo | null;
}

/**
 * CLI 设置组件属性的选项
 */
export interface ISetPropertyOptionsInfo {
    componentPath: string;
    properties: {
        [key: string]: null | undefined | number | boolean | string | object | Array<unknown>;
    };
    record?: boolean;
}
