import type { Component, Node } from 'cc';
import type { IPropertyValueType, IProperty } from '../@types/public';
import type { IServiceEvents } from '../scene-process/service/core';
import type { ICompPrefabInfo } from './prefab';
import type { IChangeNodeOptions, INodeEvents } from './node';

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
    prefab: ICompPrefabInfo | null;
}

export interface IComponentForPinK extends IProperty {
    value: {
        enabled: IPropertyValueType;
        uuid: IPropertyValueType;
        name: IPropertyValueType;
    } & Record<string, IPropertyValueType>;
    mountedRoot?: string;
}

/**
 * 创建/添加组件
 */
export interface IAddComponentOptions {
    nodePathOrUuid: string;// 节点路径或 uuid
    component: string;// 组件类名
}

/**
 * 删除组件
 */
export interface IRemoveComponentOptions {
    pathOrUuidOrUrl: string;// 组件的路径、uuid 或 url
}

/**
 * 查询组件
 */
export interface IQueryComponentOptions {
    pathOrUuidOrUrl: string;// 组件的路径、uuid 或 url
    isFull?: boolean;       // 默认为false，cli默认输出简单的信息，pink设置为true，返回详细的信息，结构不一样
}

/**
 * 查询组件
 */
export interface ISetPropertyOptions {
    componentPath: string; // 修改属性的对象的 uuid
    // key: string; // 属性的 key
    properties: {
        [key: string]: null | undefined | number | boolean | string | object | Array<unknown>;
    }; // 属性 dump 出来的数据
    record?: boolean;// 是否记录undo
}

export interface ISetPropertyOptionsForPink {
    uuid: string; // 修改属性的对象的 uuid
    path: string; // 属性挂载对象的搜索路径
    // key: string; // 属性的 key
    dump: IProperty; // 属性 dump 出来的数据
    record?: boolean;// 是否记录undo
}


/**
 * 执行组件方法选项
 */
export interface IExecuteComponentMethodOptions {
    uuid: string;
    name: string;
    args: any[];
}

/**
 * 场景事件类型
 */
export interface IComponentEvents extends INodeEvents {
    'component:add': [Component];
    'component:before-remove': [Component];
    'component:remove': [Component];
    'component:set-property': [Component, IChangeNodeOptions];
    'component:added': [Component];
    'component:removed': [Component];
    'component:before-add-component': [string, Node];
}

export interface IPublicComponentService extends Omit<IComponentService, keyof IServiceEvents |
    'init' |
    'unregisterCompMgrEvents'
> {}

/**
 * 组件的相关处理接口
 */
export interface IComponentService extends IServiceEvents {
    /**
     * 添加组件
     * @param params
     */
    addComponent(params: IAddComponentOptions): Promise<IComponent>;

    /**
     * 创建组件
     * @param params
     */
    createComponent(params: IAddComponentOptions): Promise<boolean> ;

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
     * 设置组件属性，pink专属接口，因为结构与ISetPropertyOptions是不同的
     * @param params
     */
    setPropertyForPink(uuid: string, path: string, dump: IProperty, record?: boolean): Promise<boolean>;
    
    /**
     * 查询组件
     */
    queryComponent(params: IQueryComponentOptions): Promise<IComponent | IComponentForPinK | null>;

    /**
     * 获取所有组件名，包含内置与自定义组件
     */
    queryAllComponent(): Promise<string[]>

    // pink 相关接口
    /**
     * 复位组件
     */
    resetComponent(params: IQueryComponentOptions): Promise<boolean>;

    /**
     * 执行组件方法
     */
    executeComponentMethod(options: IExecuteComponentMethodOptions): Promise<boolean>

    // 不对外接口

    init(): void;
    unregisterCompMgrEvents(): void;
}
