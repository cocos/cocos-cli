import { IProperty, IComponent } from '../@types/public';
/**
 * 节点信息
 */
export interface IComponentInfo {
    
}

// set-property 消息的 options 定义
export interface SetPropertyOptions {
    uuid: string; // 修改属性的对象的 uuid
    path: string; // 属性挂载对象的搜索路径
    // key: string; // 属性的 key
    dump: IProperty; // 属性 dump 出来的数据
    record?: boolean;// 是否记录undo
}

/**
 * 创建组件
 */
export interface ICreateComponentOptions {
    uuid: string;// 节点uuid
    component: string;// 组件注册到ccclass里的类名
}


/**
 * 节点的相关处理接口
 */
export interface IComponentManager {
    /**
     * 创建组件
     * @param params
     */
    createComponent(params: ICreateComponentOptions): Promise<IComponentInfo | null>;
    /**
     * 删除组件
     * @param params 
     */
    deleteComponent(params: ICreateComponentOptions): Promise<IComponentInfo | null>;
    /**
     * 设置组件属性
     * @param params
     */
    setProperty(params: SetPropertyOptions): Promise<boolean>;
    /**
     * 查询组件
     */
    queryComponent(params: ICreateComponentOptions): Promise<IComponent | null>;
}
