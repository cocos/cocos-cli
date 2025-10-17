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
    uuid: string; // 返回创建组件的uuid
}

/**
 * 创建组件
 */
export interface IAddComponentOptions {
    uuid: string;// 节点uuid
    component: string;// 组件注册到ccclass里的类名
}

/**
 * 删除组件
 */
export interface IDeleteComponentOptions {
    uuid: string;// 节点uuid
}


/**
 * 查询组件
 */
export interface IQueryComponentOptions {
    uuid: string;// 节点uuid
}

/**
 * 查询组件
 */
export interface ISetPropertyOptions {
    uuid: string; // 修改属性的对象的 uuid
    path: string; // 属性挂载对象的搜索路径
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
    removeComponent(params: IDeleteComponentOptions): Promise<boolean>;
    /**
     * 设置组件属性
     * @param params
     */
    setProperty(params: ISetPropertyOptions): Promise<boolean>;
    /**
     * 查询组件
     */
    queryComponent(params: IQueryComponentOptions): Promise<IComponentInfo>;
}
