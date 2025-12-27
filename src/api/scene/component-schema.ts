import { z } from 'zod';
import type { IComponent } from '../../core/scene';
import { SchemaComponentIdentifier } from '../base/schema-identifier';
import { SchemaCompPrefabInfo } from './prefab-info-schema';

// Create component information // 创建组件信息
export const SchemaAddComponentInfo = z.object({
    nodePath: z.string().describe('Node path'), // 节点路径
    //component: z.enum(Object.keys(globalComponentType) as [string, ...string[]]).describe('组件类型'),
    component: z.string().describe('Component name, supports component name, component resource URL and UUID'), // 组件名称，支持组件名称、组件资源的 URL 与 UUID
}).describe('Information for adding a component'); // 添加组件的信息

// Remove component // 移除组件
export const SchemaRemoveComponent = z.object({
    path: z.string().describe('Path of the component, including node path'), // 组件的路径，包含节点路径
}).describe('Information required to remove a component'); // 移除组件需要的信息

// Query component // 查询组件
export const SchemaQueryComponent = z.object({
    path: z.string().describe('Path of the component, including node path'), // 组件的路径，包含节点路径
}).describe('Information required to query a component'); // 查询组件需要的信息

// Vec2
export const Vec2Type = z.object({
    x: z.number().describe('x coordinate'), // x 坐标
    y: z.number().describe('y coordinate'), // y 坐标
}).describe('Vec2 type'); // Vec2 类型

// Vec3
export const Vec3Type = z.object({
    x: z.number().describe('x coordinate'), // x 坐标
    y: z.number().describe('y coordinate'), // y 坐标
    z: z.number().describe('z coordinate'), // z 坐标
}).describe('Vec3 type'); // Vec3 类型

// Vec4
export const Vec4Type = z.object({
    x: z.number().describe('x coordinate'), // x 坐标
    y: z.number().describe('y coordinate'), // y 坐标
    z: z.number().describe('z coordinate'), // z 坐标
    w: z.number().describe('w coordinate'), // w 坐标
}).describe('Vec4 type'); // Vec4 类型

// Mat4
export const Mat4Type = z.object({
    m00: z.number().describe('Row 1 Column 1'), // 第1行第1列
    m01: z.number().describe('Row 1 Column 2'), // 第1行第2列
    m02: z.number().describe('Row 1 Column 3'), // 第1行第3列
    m03: z.number().describe('Row 1 Column 4'), // 第1行第4列

    m10: z.number().describe('Row 2 Column 1'), // 第2行第1列
    m11: z.number().describe('Row 2 Column 2'), // 第2行第2列
    m12: z.number().describe('Row 2 Column 3'), // 第2行第3列
    m13: z.number().describe('Row 2 Column 4'), // 第2行第4列

    m20: z.number().describe('Row 3 Column 1'), // 第3行第1列
    m21: z.number().describe('Row 3 Column 2'), // 第3行第2列
    m22: z.number().describe('Row 3 Column 3'), // 第3行第3列
    m23: z.number().describe('Row 3 Column 4'), // 第3行第4列

    m30: z.number().describe('Row 4 Column 1'), // 第4行第1列
    m31: z.number().describe('Row 4 Column 2'), // 第4行第2列
    m32: z.number().describe('Row 4 Column 3'), // 第4行第3列
    m33: z.number().describe('Row 4 Column 4'), // 第4行第4列
}).describe('Mat4 type'); // Vec4 类型


/**
 * Property data structure and configuration options // 属性数据结构和配置选项
 * Used to describe property fields in the editor, supporting multiple data types and UI controls // 用于描述编辑器中的属性字段，支持多种数据类型和UI控件
 */
export const SchemaProperty = z.object({
    value: z.union([
        z.record(z.string(), z.any()).describe('Any type Object'), // 任意类型Object
        z.array(z.any()).describe('Any type Array'), // 任意类型数组
        z.string().describe('String type'), // 字符串类型
        z.number().describe('Number type'), // 数字类型
        z.boolean().describe('Boolean type'), // boolean类型
        Vec2Type,
        Vec3Type,
        Vec4Type,
        Mat4Type,
        z.null().describe('Null type'), // null类型
        z.any().describe('Any type') // 任意类型
    ]).describe('Current value of the property, can be a key-value object or a basic type value'), // 属性的当前值，可以是键值对对象或基础类型值

    cid: z.string().optional().describe('Component identifier'), // 组件标识符
    type: z.string().optional().describe('Property data type'), // 属性数据类型
    readonly: z.boolean().optional().describe('Whether it is read-only'), // 是否只读
    name: z.string().optional().describe('Property name'), // 属性名称
    path: z.string().optional().describe('Search path for data, filled by the user'), // 数据的搜索路径，由使用方填充
    isArray: z.boolean().optional().describe('Whether it is an array type'), // 是否为数组类型
    userData: z.record(z.string(), z.any()).optional().describe('User pass-through data') // 用户透传数据
}).describe('Property data structure and editor configuration options, used to define property values, UI display, validation rules, etc.'); // 属性数据结构和编辑器配置选项，用于定义属性的值、UI显示、验证规则等

// Set property options // 设置属性选项
export const SchemaSetPropertyOptions = z.object({
    componentPath: z.string().describe('Component path'), // 组件路径
    properties: z.record(
        z.string().describe('Property name'), // 属性名称
        z.union([
            z.record(z.string(), z.any()).describe('Any type Object'), // 任意类型Object
            z.array(z.unknown()).describe('Any type Array'), // 任意类型数组
            z.string().describe('String type'), // 字符串类型
            z.number().describe('Number type'), // 数字类型
            z.boolean().describe('Boolean type'), // boolean类型
            z.null().describe('Null type'), // 空类型
            z.any().describe('Any type') // any类型
        ]).describe('Property type, can be any type in the union'), // 属性类型，可以是联合中的任意类型
    )
}).describe('Information required to set component properties'); // 设置组件属性所需要的信息

export const SchemaComponent: z.ZodType<IComponent> = SchemaComponentIdentifier.extend({
    properties: z.record(
        z.string().describe('Property name'), // 属性名称
        SchemaProperty,
    ).describe('Component properties'), // 组件属性
    prefab: SchemaCompPrefabInfo.nullable().describe('Information of the component in the prefab') // 预制体中组件的信息
}).describe('Component information'); // 组件信息

export const SchemaQueryAllComponentResult = z.array(z.string()).describe('Collection of all components, including built-in and custom components'); // 所有组件集合，包含内置与自定义组件

export const SchemaComponentResult = z.union([SchemaComponent, z.null()]).describe('Interface returned when getting current component information'); // 获取当前组件信息返回的接口
export const SchemaBooleanResult = z.boolean().describe('Interface return result'); // 接口返回结果

// Type export // 类型导出
export type TAddComponentInfo = z.infer<typeof SchemaAddComponentInfo>;
export type TComponentIdentifier = z.infer<typeof SchemaComponentIdentifier>;
export type TRemoveComponentOptions = z.infer<typeof SchemaRemoveComponent>;
export type TQueryComponentOptions = z.infer<typeof SchemaQueryComponent>;
export type TSetPropertyOptions = z.infer<typeof SchemaSetPropertyOptions>;
export type TComponentResult = z.infer<typeof SchemaComponentResult>;
export type TQueryAllComponentResult = z.infer<typeof SchemaQueryAllComponentResult>;
export type TBooleanResult = z.infer<typeof SchemaBooleanResult>;