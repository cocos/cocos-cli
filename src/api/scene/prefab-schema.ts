import { z } from 'zod';
import { SchemaPrefabInfo } from './prefab-info-schema';

// Create Prefab Options // 创建预制体参数
export const SchemaCreatePrefabFromNodeOptions = z.object({
    /** Source node path to convert to prefab */ // 要转换为预制体的源节点路径
    nodePath: z.string().describe('Source node path to convert to prefab'), // 要转换为预制体的源节点路径
    /** Prefab asset save URL */ // 预制体资源保存 URL
    dbURL: z.string().describe('Prefab asset save URL. Note: The final node name will change according to the resource name saved at the end of the URL'), // 预制体资源保存 URL，注意：最终节点名会跟着 URL 最后存的资源名进程变更
    /** Whether to force overwrite existing resources */ // 是否强制覆盖现有资源
    overwrite: z.boolean().optional().describe('Whether to force overwrite existing resources'), // 是否强制覆盖现有资源
}).describe('Create Prefab Options'); // 创建预制体参数

// Apply Changes Options // 应用修改参数
export const SchemaApplyPrefabChangesOptions = z.object({
    nodePath: z.string().describe('Node path'), // 节点路径
}).describe('Apply changes to prefab options'); // 应用修改到预制体参数

export const SchemaApplyPrefabChangesResult = z.boolean().describe('Whether the prefab changes were applied successfully'); // 是否应用预制体修改成功

// Revert Options // 重置参数
export const SchemaRevertToPrefabOptions = z.object({
    nodePath: z.string().describe('Node path'), // 节点路径
}).describe('Revert prefab options'); // 重置预制体参数

export const SchemaRevertToPrefabResult = z.boolean().describe('Whether the prefab instance was reverted successfully'); // 是否重置预制体实例成功

// Unpack Options // 解耦参数
export const SchemaUnpackPrefabInstanceOptions = z.object({
    /** Prefab instance node to unpack */ // 要解耦的预制体实例节点
    nodePath: z.string().describe('Prefab instance node to unpack'), // 要解耦的预制体实例节点
    /** Recursively unpack all nested prefabs */ // 递归解耦所有子预制体
    recursive: z.boolean().optional().describe('Recursively unpack all nested prefabs'), // 递归解耦所有子预制体
}).describe('Unpack prefab options'); // 解耦预制体参数

// Query Options Interface // 查询参数接口
export const SchemaIsPrefabInstanceOptions = z.object({
    nodePath: z.string().describe('Node path'), // 节点路径
}).describe('Query if it is a prefab options'); // 查询是否是预制体参数

export const SchemaIsPrefabInstanceResult = z.boolean().describe('Return value of whether it is a prefab instance'); // 是否为预制体实例返回值

// Get node prefab info options interface // 获取节点的预制体信息参数接口
export const SchemaGetPrefabInfoOptions = z.object({
    nodePath: z.string().describe('Node path'), // 节点路径
}).describe('Get node prefab info options'); // 获取节点的预制体信息参数

export const SchemaGetPrefabResult = z.union([SchemaPrefabInfo, z.null()]).describe('Get prefab info return value'); // 获取预制体信息返回值

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
