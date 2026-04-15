
export interface Vec2 {
    x: number;
    y: number;
}

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface Vec4 {
    x: number;
    y: number;
    z: number;
    w: number;
}

export interface Mat4 {
    m00: number;
    m01: number;
    m02: number;
    m03: number;

    m04: number;
    m05: number;
    m06: number;
    m07: number;

    m08: number;
    m09: number;
    m10: number;
    m11: number;

    m12: number;
    m13: number;
    m14: number;
    m15: number;
}

export type IPropertyValueType = IProperty | IProperty[] | null | undefined | number | boolean | string | Vec4 | Vec3 | Vec2 | Mat4 | any | Array<unknown>

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

/**
 * 组件的 dump 数据，以 IProperty 格式编码组件信息
 * 与 IComponent 不同，所有属性（包括 uuid, name, enabled）都通过 encodeObject 编码为 IProperty
 */
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
