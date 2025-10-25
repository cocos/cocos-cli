import { z } from 'zod';

// 创建组件信息
export const SchemaAddComponentInfo = z.object({
    nodePath: z.string().describe('节点路径'),
    //component: z.enum(Object.keys(globalComponentType) as [string, ...string[]]).describe('组件类型'),
    component: z.string().describe('组件名称，支持组件名称、组件资源的 URL 与 UUID'),
}).describe('添加组件的信息');

// 当前组件信息
export const SchemaComponentIdentifier = z.object({
    cid: z.string().describe('组件标识符'),
    path: z.string().describe('返回组件的路径，包含节点路径'),
    uuid: z.string().describe('组件的uuid'),
    name: z.string().describe('组件名称'),
    type: z.string().describe('组件类型'),
    enabled: z.boolean().describe('组件是否使能'),
}).describe('组件的标识');

// 移除组件
export const SchemaRemoveComponent = z.object({
    path: z.string().describe('组件的路径，包含节点路径'),
}).describe('移除组件需要的信息');

// 查询组件
export const SchemaQueryComponent = z.object({
    path: z.string().describe('组件的路径，包含节点路径'),
}).describe('查询组件需要的信息');

/**
 * 属性数据结构和配置选项
 * 用于描述编辑器中的属性字段，支持多种数据类型和UI控件
 */
export const SchemaProperty = z.object({
    value: z.union([
        z.record(z.string(), z.any()).describe('任意类型Object'),
        z.array(z.any()).describe('任意类型数组'),
        z.string().describe('字符串类型'),
        z.number().describe('数字类型'),
        z.boolean().describe('boolean类型'),
        z.null().describe('null类型'),
        z.any().describe('任意类型')
    ]).describe('属性的当前值，可以是键值对对象或基础类型值'),

    cid: z.string().optional().describe('组件标识符'),
    type: z.string().optional().describe('属性数据类型'),
    readonly: z.boolean().optional().describe('是否只读'),
    name: z.string().optional().describe('属性名称'),
    path: z.string().optional().describe('数据的搜索路径，由使用方填充'),
    isArray: z.boolean().optional().describe('是否为数组类型'),
    userData: z.record(z.string(), z.any()).optional().describe('用户透传数据')
}).describe('属性数据结构和编辑器配置选项，用于定义属性的值、UI显示、验证规则等');

// 设置属性选项
export const SchemaSetPropertyOptions = z.object({
    componentPath: z.string().describe('组件路径'),
    properties: z.record(
        z.string().describe('属性名称'),
        z.union([
            z.record(z.string(), z.any()).describe('任意类型Object'),
            z.array(z.unknown()).describe('任意类型数组'),
            z.string().describe('字符串类型'),
            z.number().describe('数字类型'),
            z.boolean().describe('boolean类型'),
            z.null().describe('空类型'),
            z.any().describe('any类型')
        ]).describe('属性类型，可以是联合中的任意类型'),
    )
}).describe('组件dump出来的信息');

export const SchemaComponent = SchemaProperty.extend({
    properties: z.record(
        z.string().describe('属性名称'),
        SchemaProperty,
    )
}).describe('组件dump出来的信息');

export const SchemaQueryAllComponentResult = z.array(z.string()).describe('所有组件集合，包含内置与自定义组件');


export const SchemaBuildinComponentTypes = z.array(z.string()).describe('所有内置组件的集合');

export const SchemaComponentResult = z.union([SchemaComponent, z.null()]).describe('获取当前组件信息返回的接口');
export const SchemaBooleanResult = z.boolean().describe('接口返回结果');

// 类型导出
export type TAddComponentInfo = z.infer<typeof SchemaAddComponentInfo>;
export type TComponentIdentifier = z.infer<typeof SchemaComponentIdentifier>;
export type TRemoveComponentOptions = z.infer<typeof SchemaRemoveComponent>;
export type TQueryComponentOptions = z.infer<typeof SchemaQueryComponent>;
export type TSetPropertyOptions = z.infer<typeof SchemaSetPropertyOptions>;
export type TComponentResult = z.infer<typeof SchemaComponentResult>;
export type TQueryAllComponentResult = z.infer<typeof SchemaQueryAllComponentResult>;