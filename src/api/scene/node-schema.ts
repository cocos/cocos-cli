import { z } from 'zod';

import { NodeType } from '../../core/scene';
import { INode, MobilityMode } from '../../core/scene';
import { Mat4Schema, QuatSchema, Vec3Schema } from '../base/value-types';
import { SchemaComponent } from './component-schema';


// 节点属性的 schema，
export const NodePropertySchema = z.object({
    position: Vec3Schema.describe('节点位置'),
    worldPosition: Vec3Schema.describe('节点位置'),
    rotation: QuatSchema.describe('节点旋转, 四元数'),
    worldRotation: QuatSchema.describe('节点旋转, 四元数'),
    eulerAngles: Vec3Schema.describe('节点旋转，欧拉角'),
    angle: z.number().describe('本地坐标系下的旋转，用欧拉角表示，但是限定在 z 轴上'),
    scale: Vec3Schema.describe('节点缩放'),
    worldScale: Vec3Schema.describe('节点缩放'),
    worldMatrix: Mat4Schema.describe('节点的世界变换矩阵'),
    forward: Vec3Schema.describe('节点的前方向向量, 默认前方为 -z 方向'),
    up: Vec3Schema.describe('当前节点在世界空间中朝上的方向向量'),
    right: Vec3Schema.describe('当前节点在世界空间中朝右的方向向量'),
    mobility: z.nativeEnum(MobilityMode).describe('节点的移动性，static 表示静态节点，movable 表示可移动节点, Stationary 固定节点'),
    layer: z.number().describe('节点所在的层级'),
    hasChangedFlags: z.number().describe('这个节点的空间变换信息在当前帧内是否有变过？'),
    active: z.boolean().describe('节点是否激活'),
    activeInHierarchy: z.boolean().readonly().describe('节点在场景中是否激活'),
});


const NodeIdentifierSchema = z.object({
    nodeId: z.string().describe('节点的 id'),
    path: z.string().describe('节点路径'),
    name: z.string().describe('节点名称'),
}).describe('节点标识符');

// 查询节点的参数
export const NodeSearchSchema = NodeIdentifierSchema.extend({
    deeps: z.number().default(10).describe('查询的深度'),
    queryChildren: z.boolean().default(false).describe('是否查询子节点信息'),
}).describe('查询节点的选项参数，查询结果是传入的信息的交集');


// 查询节点的参数
export const NodeQuerySchema = z.object({
    path: z.string().describe('节点路径'),
    queryChildren: z.boolean().default(false).describe('是否查询子节点信息'),
}).describe('查询节点的选项参数，查询结果是传入的信息的交集');

// 查询节点的结果
export const NodeQueryResultSchema: z.ZodType<INode> = NodeIdentifierSchema.extend({
    properties: NodePropertySchema.describe('节点属性'),
    children: z.array(z.lazy(() => NodeQueryResultSchema)).optional().default([]).describe('子节点列表'),
    component: z.array(z.lazy(() => SchemaComponent)).default([]).describe('节点上的组件列表'),
});

//节点更新的参数
export const NodeUpdateSchema = z.object({
    path: z.string().describe('节点相对路径'),
    name: z.string().optional().describe('更新的节点名称'),
    properties: NodePropertySchema.partial().describe('要更新的节点属性，可以只更新部分属性'),
}).describe('更新节点的选项参数');

// 节点更新结果的 schema
export const NodeUpdateResultSchema = z.object({
    path: z.string().describe('节点相对路径'),
});

// 节点删除结果的 schema
export const NodeDeleteResultSchema = z.object({
    path: z.string().describe('节点路径'),
});


// 删除节点的参数
export const NodeDeleteSchema = z.object({
    path: z.string().describe('节点相对路径'),
    keepWorldTransform: z.boolean().optional().describe('保持世界变换'),
}).describe('删除节点的选项参数');


// 创建节点的参数
export const NodeCreateSchema = z.object({
    assetPath: z.string().optional().describe('预制体资源路径，如果是从某个预制体创建，请传入这个参数，格式为自定义的db 路径比如 db://assets/abc.prefab'),
    path: z.string().describe('创建的节点相对路径，根节点是场景节点'),
    name: z.string().optional().describe('节点的名称，不传，系统会默认一个名字'),
    workMode: z.enum(['2d', '3d']).optional().describe('节点工作模式，2D 还是 3D; 同一个 nodeType 有些支持2d也支持3d'),
    nodeType: z.enum(Object.values(NodeType) as [string, ...string[]]).describe('节点类型'),
    keepWorldTransform: z.boolean().optional().describe('保持世界变换'),
    position: Vec3Schema.optional().default({ x: 0, y: 0, z: 0 }).describe('节点位置'),
}).describe('创建节点的选项参数');


// 类型导出
export type TDeleteNodeOptions = z.infer<typeof NodeDeleteSchema>;
export type TUpdateNodeOptions = z.infer<typeof NodeUpdateSchema>;
export type TCreateNodeOptions = z.infer<typeof NodeCreateSchema>;
export type TQueryNodeOptions = z.infer<typeof NodeQuerySchema>;
export type TNodeDetail = z.infer<typeof NodeQueryResultSchema>;
export type TNodeUpdateResult = z.infer<typeof NodeUpdateResultSchema>;
export type TNodeDeleteResult = z.infer<typeof NodeDeleteResultSchema>;
