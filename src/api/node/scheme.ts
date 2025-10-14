import z from "zod";

//  todo: 组件属性的 Zod schema 未完成
export const ComponentPropertySchema = z.object({
    name: z.string().describe('属性名称'),
    type: z.string().describe('属性类型'),
    visible: z.boolean().describe('是否可见'),
    value: z.union([z.record(z.string(), z.any()), z.string()]).describe('属性值'),
    extends: z.array(z.string()).describe('继承的属性'),
});

// 节点组件的 Zod schema
export const ComponentItemSchema = z.object({
    name: z.string().describe('组件名称'),
    type: z.string().describe('组件类型'),
    enable: z.boolean().describe('是否启用'),
    nodeId: z.string().describe('节点的 id'),
    path: z.string().describe('节点路径'),

    //todo: 组件的属性，目前没完成
    properties: z.record(z.string(), ComponentPropertySchema).describe('组件属性'),
});

// 先声明类型接口
interface NodeQueryResultItemType {
    nodeId: string;
    path: string;
    name: string;
    type: string;
    component: z.infer<typeof ComponentItemSchema>[];
    children?: NodeQueryResultItemType[];
}

//预定义好几个类型，和对应的 schema，node 的 properties 中会有这些类型的属性
export const Vec3Schema = z.object({
    x: z.number().describe('x 轴坐标'),
    y: z.number().describe('y 轴坐标'),
    z: z.number().describe('z 轴坐标'),
});

// 节点属性的 schema，
export const NodePropertySchema = z.object({
    position: Vec3Schema.describe('节点位置'),
    scale: Vec3Schema.describe('节点缩放'),

    //继续往上加其他属性
    other:Vec3Schema.readonly().describe('其他属性'),
});

// 查询节点的参数
export const NodeQueryScheme = z.object({
    nodeId: z.string().optional().describe('节点的 id'),
    path: z.string().optional().describe('节点路径'),
    name: z.string().optional().describe('节点名称'),
    pattern: z.string().optional().describe('过滤的模式, 我们是不是要支持 glob 模式匹配？'),
    deeps: z.int().default(10).describe('查询的深度'),
    queryChildren: z.boolean().default(false).describe('是否查询子节点信息'),
}).describe('查询节点的选项参数，查询结果是传入的信息的交集');

// 查询节点的结果的 item
export const NodeQueryResultItemSchema: z.ZodType<NodeQueryResultItemType> = z.object({
    nodeId: z.string().describe('节点的 id'),
    path: z.string().describe('节点路径'),
    name: z.string().describe('节点名称'),
    type: z.string().describe('节点类型'),
    properties: NodePropertySchema.describe('节点属性'),
    component: z.array(ComponentItemSchema).describe('节点上的组件列表'),
    children: z.array(z.lazy(() => NodeQueryResultItemSchema)).optional().default([]).describe('子节点列表'),
});

// 查询节点的结果的 scheme
export const NodeQueryResultScheme = z.array(NodeQueryResultItemSchema).default([]).describe('查询节点的结果信息');

//节点更新的参数
export const NodeUpdateScheme = z.object({
    path: z.string().describe('节点路径'),
    properties: NodePropertySchema.partial().describe('要更新的节点属性，可以只更新部分属性'),
});

// 节点更新结果的 schema
export const NodeUpdateResultScheme = z.object({
    nodeId: z.string().describe('节点的 id'),
    path: z.string().describe('节点路径'),
});

// 更新节点组件的参数
export const ComponentUpdateScheme = z.object({
    nodeId: z.string().describe('节点的 uuid'),
    componentName: z.string().describe('组件名称'),
    properties: z.record(z.string(), z.any()).describe('要更新的属性值'),
});

// 从 scheme 中提取类型
export type TNodeQueryOptions = z.infer<typeof NodeQueryScheme>;
export type TNodeQueryResult = z.infer<typeof NodeQueryResultScheme>;
export type TNodeUpdateOptions = z.infer<typeof NodeUpdateScheme>;
export type TNodeUpdateResult = z.infer<typeof NodeUpdateResultScheme>;
