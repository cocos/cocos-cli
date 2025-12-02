import { z } from 'zod';
import { SchemaNodeIdentifier, SchemaComponentIdentifier } from '../base/schema-identifier';

// 首先定义基础 schema
export const SchemaOptimizationPolicy = z.number().describe('优化策略，AUTO: 0，SINGLE_INSTANCE: 1，MULTI_INSTANCE：1');

export const SchemaTargetInfo = z.object({
    localID: z.array(z.string()).describe('由 fileId 组成的数组'),
}).describe('用来定义预制体内目标的信息');

export const SchemaMountedChildrenInfo = z.object({
    targetInfo: SchemaTargetInfo.nullable().describe('父节点信息，对应预制体中被挂载的实际节点'),
    nodes: z.array(SchemaNodeIdentifier).describe('挂载节点数组'),
}).describe('挂载的子节点信息');

export const SchemaPropertyOverrideInfo = z.object({
    targetInfo: SchemaTargetInfo.nullable().describe('目标信息，用于查找目标节点或组件'),
    propertyPath: z.array(z.string()).describe('属性的路径'),
    value: z.any().describe('属性类型的实际值'),
}).describe('记录预制体实例对属性的覆盖信息');

export const SchemaMountedComponentsInfo = z.object({
    targetInfo: SchemaTargetInfo.nullable().describe('父节点信息，对应预制体中被挂载的实际节点'),
    components: z.array(SchemaComponentIdentifier).describe('挂载组件数组'),
}).describe('预制体实例上，不属于预制体资源的组件的信息');

export const SchemaPrefabInstance = z.object({
    fileId: z.string().describe('用于唯一标识一个 PrefabInstance，用于 propertyOverride 的索引查找'),
    prefabRootNode: SchemaNodeIdentifier.optional().describe('在嵌套的预制体上会记录其外部的 Prefab 的 Root 节点信息。比如 PrefabA -> PrefabB，B 的这个字段就指向 PrefabA 节点'),
    mountedChildren: z.array(SchemaMountedChildrenInfo).describe('存在于预制体实例上的，不属于预制体资源中的节点数据,比如创建预制体 A，往 A 或其子节点上，添加的节点，都会记录在这里'),
    mountedComponents: z.array(SchemaMountedComponentsInfo).describe('存在于预制体实例上的，不属于预制体资源中的组件数据,比如创建预制体A，往A或其子节点上，添加的组件，都会记录在这里'),
    propertyOverrides: z.array(SchemaPropertyOverrideInfo).describe('保存所有对 Prefab 的属性覆写数据，预制体加载时会先根据资源创建节点，再把覆盖的属性重写掉'),
    removedComponents: z.array(SchemaTargetInfo).describe('移除的组件资源数组,把预制体资源内原本有的组件移除掉时，数据保存在这里，不是直接引用组件，而是通过 TargetInfo 记录组件的位置'),
}).describe('预制体资源创建的实例对象，简称预制体实例');

export const SchemaCompPrefabInfo = z.object({
    fileId: z.string().describe('记录组件的 id，在预制体文件中唯一；用于 targetInfo 查找组件时使用'),
}).describe('组件预制体信息');

export const SchemaTargetOverrideInfo = z.object({
    source: z.union([SchemaComponentIdentifier, SchemaNodeIdentifier, z.null()]).describe('引用的节点或组件'),
    sourceInfo: SchemaTargetInfo.nullable().describe('如果是预制体内子节点或组件的引用，需要 targetInfo 来定位'),
    propertyPath: z.array(z.string()).describe('').describe('属性路径'),
    target: SchemaNodeIdentifier.nullable().describe('被引用的目标节点的预制体根节点'),
    targetInfo: SchemaTargetInfo.nullable().describe('被引用的 TargetInfo 信息，用来定位具体在哪个'),
}).describe('目标重写信息');

export const SchemaPrefab = z.object({
    name: z.string().describe('预制体名称'),
    uuid: z.string().describe('预制体 UUID'),
    data: SchemaNodeIdentifier.describe('预制体中的根节点'),
    optimizationPolicy: SchemaOptimizationPolicy,
    persistent: z.boolean().describe('是否为持久节点'),
}).describe('预制体');

/** 关联的预制体资源信息 */
export const SchemaPrefabInfo = z.object({
    asset: SchemaPrefab.optional().describe('预制资源信息'),
    root: SchemaNodeIdentifier.optional().optional().describe('指向 Prefab 的根节点'),
    instance: SchemaPrefabInstance.optional().describe('预制体实例对象，有这个属性，说明这个节点是预制体实例'),
    fileId: z.string().describe('唯一标识一个Prefab中的Node节点，部分引用会通过该id来查找对应节点'),
    targetOverrides: z.array(SchemaTargetOverrideInfo).describe('记录对其它预制体的子节点/组件的引用关系'),
    nestedPrefabInstanceRoots: z.array(SchemaNodeIdentifier).describe('预制体根节点会有这个信息，记录所有的嵌套预制体实例的节点'),
}).nullable().describe('预制体信息');
