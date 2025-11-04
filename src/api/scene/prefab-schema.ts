import { z } from 'zod';
import { SchemaPrefabInfo } from './prefa-info-schema';

// 创建预制体参数
export const SchemaCreatePrefabFromNodeParams = z.object({
    /** 要转换为预制体的源节点路径 */
    nodePath: z.string().describe('要转换为预制体的源节点路径'),
    /** 预制体资源保存 URL */
    assetURL: z.string().describe('预制体资源保存 URL'),
    /** 是否强制覆盖现有资源 */
    overwrite: z.boolean().optional().describe('是否强制覆盖现有资源'),
});

// 应用修改参数
export const SchemaApplyPrefabChangesParams = z.object({
    nodePath: z.string().describe('节点路径'),
});

export const SchemaApplyPrefabChangesResult = z.boolean().describe('是否应用预制体修改成功');

// 重置参数
export const SchemaRevertToPrefabParams = z.object({
    nodePath: z.string().describe('节点路径'),
});

export const SchemaRevertToPrefabResult = z.boolean().describe('是否重置预制体实例成功');

// 解耦参数
export const SchemaUnpackPrefabInstanceParams = z.object({
    /** 要解耦的预制体实例节点 */
    nodePath: z.string().describe('要解耦的预制体实例节点'),
    /** 递归解耦所有子预制体 */
    recursive: z.boolean().optional().describe('递归解耦所有子预制体'),
});


// 查询参数接口
export const SchemaIsPrefabInstanceParams = z.object({
    nodePath: z.string().describe('节点路径'),
});

export const SchemaIsPrefabInstanceResult = z.boolean().describe('是否为预制体实例返回值');

// 获取节点的预制体信息参数接口
export const SchemaGetPrefabInfoParams = z.object({
    nodePath: z.string().describe('节点路径'),
});

export const SchemaGetPrefabResult = z.union([SchemaPrefabInfo, z.null()]).describe('获取预制体信息返回值');

// 布尔结果 Schema
export const SchemaBooleanResult = z.object({
    success: z.boolean().describe('操作是否成功'),
});

export type TCreatePrefabFromNodeParams = z.infer<typeof SchemaCreatePrefabFromNodeParams>;
export type TApplyPrefabChangesParams = z.infer<typeof SchemaApplyPrefabChangesParams>;
export type TApplyPrefabChangesResult = z.infer<typeof SchemaApplyPrefabChangesResult>;
export type TRevertToPrefabParams = z.infer<typeof SchemaRevertToPrefabParams>;
export type TRevertToPrefabResult = z.infer<typeof SchemaRevertToPrefabResult>;
export type TUnpackPrefabInstanceParams = z.infer<typeof SchemaUnpackPrefabInstanceParams>;
export type TIsPrefabInstanceParams = z.infer<typeof SchemaIsPrefabInstanceParams>;
export type TIsPrefabInstanceResult = z.infer<typeof SchemaIsPrefabInstanceResult>;
export type TGetPrefabInfoParams = z.infer<typeof SchemaGetPrefabInfoParams>;
export type TGetPrefabResult = z.infer<typeof SchemaGetPrefabResult>;
