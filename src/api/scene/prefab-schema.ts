import { z } from 'zod';
import { SchemaPrefabInfo } from './prefab-info-schema';

// 创建预制体参数
export const SchemaCreatePrefabFromNodeOptions = z.object({
    /** 要转换为预制体的源节点路径 */
    nodePath: z.string().describe('要转换为预制体的源节点路径'),
    /** 预制体资源保存 URL */
    dbURL: z.string().describe('预制体资源保存 URL，注意：最终节点名会跟着 URL 最后存的资源名进程变更'),
    /** 是否强制覆盖现有资源 */
    overwrite: z.boolean().optional().describe('是否强制覆盖现有资源'),
}).describe('创建预制体参数');

// 应用修改参数
export const SchemaApplyPrefabChangesOptions = z.object({
    nodePath: z.string().describe('节点路径'),
}).describe('应用修改到预制体参数');

export const SchemaApplyPrefabChangesResult = z.boolean().describe('是否应用预制体修改成功');

// 重置参数
export const SchemaRevertToPrefabOptions = z.object({
    nodePath: z.string().describe('节点路径'),
}).describe('重置预制体参数');

export const SchemaRevertToPrefabResult = z.boolean().describe('是否重置预制体实例成功');

// 解耦参数
export const SchemaUnpackPrefabInstanceOptions = z.object({
    /** 要解耦的预制体实例节点 */
    nodePath: z.string().describe('要解耦的预制体实例节点'),
    /** 递归解耦所有子预制体 */
    recursive: z.boolean().optional().describe('递归解耦所有子预制体'),
}).describe('解耦预制体参数');

// 查询参数接口
export const SchemaIsPrefabInstanceOptions = z.object({
    nodePath: z.string().describe('节点路径'),
}).describe('查询是否是预制体参数');

export const SchemaIsPrefabInstanceResult = z.boolean().describe('是否为预制体实例返回值');

// 获取节点的预制体信息参数接口
export const SchemaGetPrefabInfoOptions = z.object({
    nodePath: z.string().describe('节点路径'),
}).describe('获取节点的预制体信息参数');

export const SchemaGetPrefabResult = z.union([SchemaPrefabInfo, z.null()]).describe('获取预制体信息返回值');

export type TCreatePrefabFromNodeOptions = z.infer<typeof SchemaCreatePrefabFromNodeOptions>;
export type TApplyPrefabChangesOptions = z.infer<typeof SchemaApplyPrefabChangesOptions>;
export type TApplyPrefabChangesResult = z.infer<typeof SchemaApplyPrefabChangesResult>;
export type TRevertToPrefabOptions = z.infer<typeof SchemaRevertToPrefabOptions>;
export type TRevertToPrefabResult = z.infer<typeof SchemaRevertToPrefabResult>;
export type TUnpackPrefabInstanceOptions = z.infer<typeof SchemaUnpackPrefabInstanceOptions>;
export type TIsPrefabInstanceOptions = z.infer<typeof SchemaIsPrefabInstanceOptions>;
export type TIsPrefabInstanceResult = z.infer<typeof SchemaIsPrefabInstanceResult>;
export type TGetPrefabInfoParams = z.infer<typeof SchemaGetPrefabInfoOptions>;
export type TGetPrefabResult = z.infer<typeof SchemaGetPrefabResult>;
