import { z } from 'zod';
import { NodeQueryResultSchema } from './node-schema';

export const SchemaSceneName = z.string().describe('场景资源名称');

export const SchemaSceneAssetType = z.string().describe('场景资源类型');

export const SchemaSceneAssetUUID = z.string().describe('场景资源唯一标识符 UUID');

export const SchemaSceneURL = z.string().describe('场景资源使用 db:// 协议格式');

export const SchemaSceneUrlOrUUID = z.union([SchemaSceneAssetUUID, SchemaSceneURL]).describe('使用 db:// 协议格式或者 UUID');

const SchemaSceneIdentifier = z.object({
    assetUuid: SchemaSceneAssetUUID,
    url: SchemaSceneURL,
    name: SchemaSceneName,
    type: SchemaSceneAssetType,
}).describe('场景基础信息');

const SchemaScene = SchemaSceneIdentifier.extend({
    children: z.array(z.lazy(() => NodeQueryResultSchema)).optional().default([]).describe('子节点列表'),
}).describe('场景信息');

export const SchemaCurrentSceneResult = z.union([SchemaScene, z.null()]).describe('获取当前场景返回数据');

export const SchemaOpenSceneResult = SchemaScene.describe('打开场景操作的结果信息');

export const SchemaCloseSceneResult = z.boolean().describe('关闭场景结果');

export const SchemaSaveSceneResult = z.boolean().describe('保存场景结果');

export const SchemaSoftReloadScene = SchemaScene.describe('软重载场景结果');

export const SchemaCreateSceneOptions = z.object({
    baseName: z.string().describe('场景资源名称'),
    templateType: z.enum(['2d', '3d', 'quality']).optional().default('2d').describe('场景模板类型，默认 2D'),
    dbURL: z.string().describe('目标目录 URL（db://assets/xxx 格式），用于存放场景文件'),
}).describe('创建场景参数');

export const SchemaCreateSceneResult = SchemaSceneIdentifier.describe('创建场景操作的结果信息');

// 类型导出
export type TUrlOrUUID = z.infer<typeof SchemaSceneUrlOrUUID>;
export type TCurrentSceneResult = z.infer<typeof SchemaCurrentSceneResult>;
export type TOpenSceneResult = z.infer<typeof SchemaOpenSceneResult>;
export type TCloseSceneResult = z.infer<typeof SchemaCloseSceneResult>;
export type TSaveSceneResult = z.infer<typeof SchemaSaveSceneResult>;
export type TCreateSceneOptions = z.infer<typeof SchemaCreateSceneOptions>;
export type TCreateSceneResult = z.infer<typeof SchemaCreateSceneResult>;
export type TSoftReloadScene = z.infer<typeof SchemaSoftReloadScene>;
