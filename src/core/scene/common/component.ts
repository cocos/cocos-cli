import { IProperty } from '../@types/public';

export interface IComponentInfo extends IProperty {
    uuid: string;
    enabled: string;
    properties: IProperty;
}

/**
 * 组件信息
 */
export interface IComponent {
    path: string; // 返回创建组件的路径，包含节点路径
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
    mountPath: string;     // 属性挂载对象的搜索路径
    // key: string; // 属性的 key
    properties: IProperty; // 属性 dump 出来的数据
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
    queryComponent(params: IQueryComponentOptions): Promise<IComponentInfo | null>;
}
