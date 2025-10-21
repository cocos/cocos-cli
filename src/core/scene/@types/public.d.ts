
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

    type?: string;
    readonly?: boolean;

    name?: string;

    path?: string; // 数据的搜索路径，这个是由使用方填充的

    isArray?: boolean;

    userData?: { [key: string]: any }; // 用户透传的数据
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
