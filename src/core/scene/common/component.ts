import { IPropertyValueType } from '../@types/public';

/**
 * 代表一个组件
 */
export interface IComponentIdentifier {
    cid: string;
    path: string; // 返回创建组件的路径，包含节点路径
    uuid: string;
    name: string;
    type: string;
    enabled: boolean;
}

/**
 * 代表组件属性信息
 */
export interface IComponent extends IComponentIdentifier {
    properties: { [key: string]: IPropertyValueType };
}

/**
 * 创建组件
 */
export interface IAddComponentOptions {
    nodePath: string;// 组件路径
    component: string;// 组件注册到ccclass里的类名
}

/**
 * 删除组件
 */
export interface IRemoveComponentOptions {
    path: string;// 组件的路径，不包含节点路径
}

/**
 * 查询组件
 */
export interface IQueryComponentOptions {
    path: string;// 组件的路径，不包含节点路径
}

/**
 * 查询组件
 */
export interface ISetPropertyOptions {
    componentPath: string; // 修改属性的对象的 uuid
    // key: string; // 属性的 key
    properties: {
        [key: string]: null | undefined | number | boolean | string | Object | Array<unknown>;
    }; // 属性 dump 出来的数据
    record?: boolean;// 是否记录undo
}

/**
 * 节点的相关处理接口
 */
export interface IComponentService {
    /**
     * 创建组件
     * @param params
     */
    addComponent(params: IAddComponentOptions): Promise<IComponent>;
    /**
     * 删除组件
     * @param params 
     */
    removeComponent(params: IRemoveComponentOptions): Promise<boolean>;
    /**
     * 设置组件属性
     * @param params
     */
    setProperty(params: ISetPropertyOptions): Promise<boolean>;
    /**
     * 查询组件
     */
    queryComponent(params: IQueryComponentOptions): Promise<IComponent | null>;
    /**
     * 获取所有组件名，包含内置与自定义组件
     */
    queryAllComponent(): Promise<string[]>
}
