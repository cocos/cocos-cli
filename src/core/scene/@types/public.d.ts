
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
    default?: any; // 默认值

    // 多选节点之后，这里存储多个数据，用于自行判断多选后的显示效果，无需更新该数据
    values?: ({ [key: string]: IPropertyValueType } | IPropertyValueType)[];

    lock?: { [key in keyof Vec4]?: IPropertyLock };

    cid?: string;
    type?: string;
    ui?: { name: string; data?: any }; // 是否用指定的 UI 组件，name 是组件的名称
    readonly?: boolean;
    visible?: boolean;
    name?: string;

    elementTypeData?: IProperty; // 数组里的数据的默认值 dump

    path?: string; // 数据的搜索路径，这个是由使用方填充的

    isArray?: boolean;
    invalid?: boolean;
    extends?: string[]; // 继承链
    displayName?: string; // 显示到界面上的名字
    displayOrder?: number; // 显示排序
    help?: string; // 帮助文档的 url 地址
    group?: IPropertyGroupOptions; // tab
    tooltip?: string; // 提示文本
    editor?: any; // 组件上定义的编辑器数据
    animatable?: boolean; // 是否可以在动画中编辑
    radioGroup?: boolean; // 是否渲染为 RadioGroup

    // Enum
    enumList?: any[]; // enum 类型的 list 选项数组

    bitmaskList?: any[];

    // Number
    min?: number; // 数值类型的最小值
    max?: number; // 数值类型的最大值
    step?: number; // 数值类型的步进值
    slide?: boolean; // 数组是否显示为滑块
    unit?: string; // 显示的单位
    radian?: boolean; // 标识是否为角度

    // Label
    multiline?: boolean; // 字符串是否允许换行
    // nullable?: boolean; 属性是否允许为空

    optionalTypes?: string[]; // 对属性是 object 且是可变类型的数据的支持，比如 render-pipeline

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
    mountedRoot?: string;
}

export interface IComponent extends IProperty {
    value: {
        enabled: IPropertyValueType;
        uuid: IPropertyValueType;
        name: IPropertyValueType;
    } & Record<string, IPropertyValueType>;
    mountedRoot?: string;
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

export interface IScene {
    name: IProperty;
    active: IProperty;
    locked: IProperty;
    _globals: any;
    isScene: boolean;
    autoReleaseAssets: IProperty;

    uuid: IProperty;
    children: any[];
    parent: any;
    __type__: string;
    targetOverrides?: any;
}

export interface ITargetOverrideInfo {
    source: string;
    sourceInfo?: string[];
    propertyPath: string[];
    target: string;
    targetInfo?: string[];
}