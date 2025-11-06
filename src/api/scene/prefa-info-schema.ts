import { z } from 'zod';
import { NodeIdentifierSchema } from './node-schema';
import { SchemaComponentIdentifier } from './component-schema';
import { IMountedChildrenInfo } from '../../core/scene';

// 首先定义基础 schema
export const SchemaOptimizationPolicy = z.nativeEnum({
    AUTO: 0,
    SINGLE_INSTANCE: 0,
    MULTI_INSTANCE: 1,
}).describe('优化策略');

export const SchemaTargetInfo = z.object({
    localID: z.array(z.string()),
}).describe('目标信息');

export const SchemaMountedChildrenInfo: z.ZodType<IMountedChildrenInfo> = z.object({
    targetInfo: SchemaTargetInfo.nullable(),
    nodes: z.array(z.lazy(() => NodeIdentifierSchema)),
}).describe('挂载的子节点信息');

export const SchemaPropertyOverrideInfo = z.object({
    targetInfo: SchemaTargetInfo.nullable(),
    propertyPath: z.array(z.string()),
    value: z.any(),
}).describe('属性重写信息');

export const SchemaMountedComponentsInfo = z.object({
    targetInfo: SchemaTargetInfo.nullable(),
    components: z.array(SchemaComponentIdentifier),
}).describe('挂载的组件信息');

export const SchemaPrefabInstance = z.object({
    fileId: z.string(),
    prefabRootNode: z.lazy(() => NodeIdentifierSchema).optional(),
    mountedChildren: z.array(SchemaMountedChildrenInfo).default([]),
    mountedComponents: z.array(SchemaMountedComponentsInfo).default([]),
    propertyOverrides: z.array(SchemaPropertyOverrideInfo).default([]),
    removedComponents: z.array(SchemaTargetInfo).default([]),
}).describe('预制体实例');

export const SchemaCompPrefabInfo = z.object({
    fileId: z.string(),
}).describe('组件预制体信息');

export const SchemaTargetOverrideInfo = z.object({
    source: z.union([SchemaComponentIdentifier, NodeIdentifierSchema, z.null()]),
    sourceInfo: SchemaTargetInfo.nullable(),
    propertyPath: z.array(z.string()),
    target: z.lazy(() => NodeIdentifierSchema).nullable(),
    targetInfo: SchemaTargetInfo.nullable(),
}).describe('目标重写信息');

export const SchemaPrefab = z.object({
    data: z.lazy(() => NodeIdentifierSchema).describe('预制体中的根节点'),
    optimizationPolicy: SchemaOptimizationPolicy,
    persistent: z.boolean(),
}).describe('预制体');

export const SchemaPrefabInfo = z.object({
    /** 关联的预制体资源信息 */
    asset: SchemaPrefab.optional(),
    root: z.lazy(() => NodeIdentifierSchema).optional(),
    instance: SchemaPrefabInstance.optional(),
    fileId: z.string(),
    targetOverrides: z.array(SchemaTargetOverrideInfo).optional().default([]),
    nestedPrefabInstanceRoots: z.array(NodeIdentifierSchema).optional().default([]).describe('嵌套预制体实例根节点列表'),
}).describe('预制体信息');
