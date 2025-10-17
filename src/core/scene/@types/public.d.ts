
export type IPropertyValueType = IProperty | IProperty[] | null | undefined | number | boolean | string | Vec4 | Vec3 | Vec2 | Mat4 | Array<unknown>

export interface IPropertyGroupOptions {
    id: string // 默认 'default'
    name: string,
    displayOrder: number, // 默认 Infinity, 排在最后面
    style: string // 默认为 'tab'
}

export type IPropertyLock = {
    default: number;
    message: string
};

export interface IProperty {
    value: { [key: string]: IPropertyValueType } | IPropertyValueType;

    cid?: string;
    type?: string;
    readonly?: boolean;

    name?: string;

    path?: string; // 数据的搜索路径，这个是由使用方填充的

    isArray?: boolean;

    userData?: { [key: string]: any }; // 用户透传的数据
}

export interface INode {
    active: IProperty;
    locked: IProperty;
    name: IProperty;
    position: IProperty;

    /**
     * 此为 dump 数据，非 node.rotation
     * 实际指向 node.eulerAngles
     * rotation 为了给用户更友好的文案
     */
    rotation: IProperty;
    mobility: IProperty;

    scale: IProperty;
    layer: IProperty;
    uuid: IProperty;

    children: any[];
    parent: any;

    __comps__: IProperty[];
    __type__: string;
    __prefab__?: any;
    _prefabInstance?: any;
    removedComponents?: IRemovedComponentInfo[];
}


/**
 * 组件信息
 */
export interface IComponentMenu {
    name: string;// 节点uuid
    cid: string;// 组件注册到ccclass里的类名
    path: string;// 组件注册到ccclass里的类名
    assetUuid: string;// 组件注册到ccclass里的类名
}
