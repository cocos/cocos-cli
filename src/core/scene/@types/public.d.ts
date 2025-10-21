
export type IPropertyValueType = IProperty | IProperty[] | null | undefined | number | boolean | string | Vec4 | Vec3 | Vec2 | Mat4 | Array<unknown>

export interface IProperty {
    value: { [key: string]: IPropertyValueType } | IPropertyValueType;
    type?: string;
    readonly?: boolean;
    name?: string;
    path?: string; // 数据的搜索路径，这个是由使用方填充的
    isArray?: boolean;
    userData?: { [key: string]: any }; // 用户透传的数据
}