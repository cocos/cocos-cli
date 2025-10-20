import { result } from 'lodash';
import { z } from 'zod';

// 创建组件信息
export const SchemaAddComponentInfo = z.object({
    nodePath: z.string().describe('节点路径'),
    component: z.string().describe('组件名称'),
}).describe('添加组件的信息');

// 当前组件信息
export const SchemaComponent = z.object({
    path: z.string().describe('返回组件的路径，不包含节点路径'),
}).describe('当前组件的信息');

// 移除组件
export const SchemaRemoveComponent = z.object({
    path: z.string().optional().describe('组件的路径，不包含节点路径'),
}).describe('移除组件需要的信息');

// 查询组件
export const SchemaQueryComponent = z.object({
    path: z.string().optional().describe('组件的路径，不包含节点路径'),
}).describe('查询组件需要的信息');

/**
 * 属性数据结构和配置选项
 * 用于描述编辑器中的属性字段，支持多种数据类型和UI控件
 */
export const SchemaProperty = z.object({
    value: z.union([
        z.record(z.string(), z.any()),
        z.any()
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
    componentPath: z.string().describe('组件路径名'),
    mountPath: z.string().describe('属性名称'),
    properties: SchemaProperty.describe('需要修改的属性'),
    record: z.boolean().optional().default(true).describe('是否记录undo'),
}).describe('设置组件属性的信息');


export const SchemaComponentInfoResult = SchemaProperty.extend({
    properties: SchemaProperty.describe('组件的值对象'),
    enabled: z.any().describe('组件是否启用'),
    uuid: z.string().describe('组件的唯一标识符'),
}).describe('组件dump信息');

export const SchemaBooleanResult = z.boolean().describe('接口返回结果');

// 类型导出
export type TAddComponentInfo = z.infer<typeof SchemaAddComponentInfo>;
export type TComponent = z.infer<typeof SchemaComponent>;
export type TSetPropertyOptions = z.infer<typeof SchemaSetPropertyOptions>;
export type TComponentInfoResult = z.infer<typeof SchemaComponentInfoResult>;