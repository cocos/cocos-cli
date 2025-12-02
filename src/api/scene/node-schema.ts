import { z } from 'zod';

import { IPrefabInfo, NodeType } from '../../core/scene';
import { INode } from '../../core/scene';
import { SchemaQuat, SchemaVec3 } from '../base/schema-value-types';
import { SchemaNodeIdentifier, SchemaComponentIdentifier } from '../base/schema-identifier';
import { SchemaPrefabInfo } from './prefab-info-schema';

// 节点属性的 schema，
export const SchemaNodeProperty = z.object({
    position: SchemaVec3.describe('节点位置'),
    // worldPosition: Vec3Schema.describe('节点位置'),
    rotation: SchemaQuat.describe('节点旋转, 四元数'),
    // worldRotation: QuatSchema.describe('节点旋转, 四元数'),
    eulerAngles: SchemaVec3.describe('节点旋转，欧拉角'),
    // angle: z.number().describe('本地坐标系下的旋转，用欧拉角表示，但是限定在 z 轴上'),
    scale: SchemaVec3.describe('节点缩放'),
    // worldScale: Vec3Schema.describe('节点缩放'),
    // worldMatrix: Mat4Schema.describe('节点的世界变换矩阵'),
    // forward: Vec3Schema.describe('节点的前方向向量, 默认前方为 -z 方向'),
    // up: Vec3Schema.describe('当前节点在世界空间中朝上的方向向量'),
    // right: Vec3Schema.describe('当前节点在世界空间中朝右的方向向量'),
    mobility: z.number().describe('节点的移动性，static 表示静态节点，movable 表示可移动节点, Stationary 固定节点'),
    layer: z.number().describe('节点所在的层级'),
    // hasChangedFlags: z.number().describe('这个节点的空间变换信息在当前帧内是否有变过？'),
    active: z.boolean().describe('节点是否激活'),
    // activeInHierarchy: z.boolean().readonly().describe('节点在场景中是否激活'),
});

export const SchemaNode: z.ZodType<INode> = SchemaNodeIdentifier.extend({
    properties: SchemaNodeProperty.describe('节点属性'),
    prefab: z.union([SchemaPrefabInfo, z.null()]).describe('预制体信息'),
    children: z.array(z.lazy(() => SchemaNode)).default([]).describe('子节点列表'),
    components: z.array(SchemaComponentIdentifier).default([]).describe('节点上的组件列表'),
});

// 查询节点的参数
export const SchemaNodeSearch = SchemaNodeIdentifier.extend({
    deeps: z.number().default(10).describe('查询的深度'),
    queryChildren: z.boolean().default(false).describe('是否查询子节点信息'),
}).describe('查询节点的选项参数，查询结果是传入的信息的交集');

// 查询节点的参数
export const SchemaNodeQuery = z.object({
    path: z.string().describe('节点路径'),
    queryChildren: z.boolean().default(false).describe('是否查询子节点信息'),
}).describe('查询节点的选项参数，查询结果是传入的信息的交集');

// 查询节点的结果
export const SchemaNodeQueryResult: z.ZodType<INode> = SchemaNode;

//节点更新的参数
export const SchemaNodeUpdate = z.object({
    path: z.string().describe('节点相对路径'),
    name: z.string().optional().describe('更新的节点名称'),
    properties: SchemaNodeProperty.partial().optional().describe('要更新的节点属性，可以只更新部分属性'),
}).describe('更新节点的选项参数');

// 节点更新结果的 schema
export const SchemaNodeUpdateResult = z.object({
    path: z.string().describe('节点相对路径'),
});

// 节点删除结果的 schema
export const SchemaNodeDeleteResult = z.object({
    path: z.string().describe('节点路径'),
});

// 删除节点的参数
export const SchemaNodeDelete = z.object({
    path: z.string().describe('节点相对路径'),
    keepWorldTransform: z.boolean().optional().describe('保持世界变换'),
}).describe('删除节点的选项参数');

const SchemaNodeCreateBase = z.object({
    path: z.string().describe('创建的节点相对路径，根节点是场景节点; 该路径为父节点路径,完整节点路径为父路径+节点名，根节点路径为 "/"'),
    name: z.string().optional().describe('节点的名称，不传，系统会默认一个名字'),
    workMode: z.enum(['2d', '3d']).optional().describe('节点工作模式，2D 还是 3D; 同一个 nodeType 有些支持2d也支持3d'),
    keepWorldTransform: z.boolean().optional().describe('保持世界变换'),
    position: SchemaVec3.optional().describe('节点位置'),
    canvasRequired: z.boolean().optional().describe('是否需要 Canvas'),
});

export const SchemaNodeCreateByAsset = SchemaNodeCreateBase.extend({
    dbURL: z.string().describe('预制体资源路径，如果是从某个预制体创建，请传入这个参数，格式为自定义的db 路径比如 db://assets/abc.prefab'),
});

export const SchemaNodeCreateByType = SchemaNodeCreateBase.extend({
    nodeType: z.enum(Object.values(NodeType) as [string, ...string[]]).describe('节点类型'),
});

// 类型导出
export type TDeleteNodeOptions = z.infer<typeof SchemaNodeDelete>;
export type TUpdateNodeOptions = z.infer<typeof SchemaNodeUpdate>;
export type TCreateNodeByAssetOptions = z.infer<typeof SchemaNodeCreateByAsset>;
export type TCreateNodeByTypeOptions = z.infer<typeof SchemaNodeCreateByType>;
export type TQueryNodeOptions = z.infer<typeof SchemaNodeQuery>;
export type TNodeDetail = z.infer<typeof SchemaNodeQueryResult>;
export type TNodeUpdateResult = z.infer<typeof SchemaNodeUpdateResult>;
export type TNodeDeleteResult = z.infer<typeof SchemaNodeDeleteResult>;
export type TNode = z.infer<typeof SchemaNode>;