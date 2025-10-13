import { z } from 'zod';

import { NodeType } from '../../core/scene';


// 查询节点的参数
export const SchemeQueryNodeOptions = z.object({
    path: z.string().describe('节点相对路径'),
    index: z.number().optional().describe('节点重名时的索引'),
}).describe('查询的选项参数');

// 更新节点的参数
export const SchemeUpdateNodeOptions = z.object({
    path: z.string().describe('节点相对路径'),
    index: z.number().optional().describe('节点重名时的索引'),
    
    fields: z.record(z.string(), z.string()).describe('待修改的参数列表'),
}).describe('更新节点的选项参数');


// 删除节点的参数
export const SchemeDeleteNodeOptions = z.object({
    path: z.string().describe('节点相对路径'),
    index: z.number().optional().describe('节点重名时的索引'),
    keepWorldTransform: z.boolean().describe('保持世界变换'),
}).describe('删除节点的选项参数');


// 创建节点的参数
export const SchemeCreateNodeOptions = z.object({
    path: z.string().describe('创建的节点相对路径'),
    name: z.string().optional().describe('节点的名称'),
    workMode: z.enum(['2d', '3d']).optional().describe('节点工作模式，2D 还是 3D; 同一个 nodeType 有些支持2d也支持3d'),
    nodeType: z.enum(Object.values(NodeType) as [string, ...string[]]).describe('节点类型'),
    keepWorldTransform: z.boolean().optional().describe('保持世界变换'),
}).describe('创建节点的选项参数');

// 创建节点的参数
export const SchemeCreateNodeResult = z.object({
    path: z.string().describe('节点在场景中的路径'),
    index: z.number().optional().describe('节点有存在重名时的索引'),
    name: z.string().describe('节点名称'),
    children: z.record(z.string(), z.number()).optional().describe('子节点数组'),
}).describe('节点操作的结果信息');



// 类型导出
export type TDeleteNodeOptions = z.infer<typeof SchemeDeleteNodeOptions>;
export type TUpdateNodeOptions = z.infer<typeof SchemeUpdateNodeOptions>;
export type TCreateNodeOptions = z.infer<typeof SchemeCreateNodeOptions>;
export type TQueryNodeOptions = z.infer<typeof SchemeQueryNodeOptions>;
export type TNodeDetail = z.infer<typeof SchemeCreateNodeResult>;
