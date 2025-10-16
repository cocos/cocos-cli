import { z } from 'zod';

export const SchemaSceneName = z.string().describe('场景资源名称');
export const SchemaSceneAssetType = z.string().describe('场景资源类型');
export const SchemaSceneUUID = z.string().describe('场景资源唯一标识符 UUID');
export const SchemaScenePath = z.string().describe('场景资源文件系统路径（Unix/Windows格式）');
export const SchemaSceneURL = z.string().describe('场景资源使用 db:// 协议格式');
export const SchemaScenePathOrURL = z.union([SchemaSceneUUID, SchemaScenePath]).describe('场景资源的文件系统路径（Unix/Windows格式）或者 使用 db:// 协议格式');
export const SchemaSceneTemplateType = z.enum(['2d', '3d', 'quality']).optional().default('2d').describe('场景模板类型')
export const SchemaUrlOrUUIDOrPath = z.string().min(1).describe('场景资源的 URL、UUID 或文件路径');
const SchemaSceneIdentifier = z.object({
    path: SchemaScenePath,
    uuid: SchemaSceneUUID,
    url: SchemaSceneURL,
    name: SchemaSceneName,
    type: SchemaSceneAssetType,
}).describe('场景基础信息');
const SchemaScene = SchemaSceneIdentifier.extend({

}).describe('场景信息');
export const SchemaCurrentSceneResult = z.union([SchemaScene, z.null()]).describe('获取当前场景返回数据');
export const SchemaOpenSceneResult = SchemaScene.describe('打开场景操作的结果信息');
export const SchemaCloseSceneResult = z.boolean().describe('关闭场景结果');
export const SchemaSaveSceneResult = z.boolean().describe('保存场景结果');
export const SchemaSoftReloadScene = z.boolean().describe('软重载场景结果');
export const SchemaCreateSceneOptions = z.object({
    targetPathOrURL: SchemaScenePathOrURL,
    templateType: SchemaSceneTemplateType,
}).describe('创建场景参数');
export const SchemaCreateSceneResult = SchemaScene.describe('创建场景操作的结果信息');

// 类型导出
export type TUrlOrUUIDOrPath = z.infer<typeof SchemaUrlOrUUIDOrPath>;
export type TCurrentSceneResult = z.infer<typeof SchemaCurrentSceneResult>;
export type TOpenSceneResult = z.infer<typeof SchemaOpenSceneResult>;
export type TCloseSceneResult = z.infer<typeof SchemaCloseSceneResult>;
export type TSaveSceneResult = z.infer<typeof SchemaSaveSceneResult>;
export type TCreateSceneOptions = z.infer<typeof SchemaCreateSceneOptions>;
export type TCreateSceneResult = z.infer<typeof SchemaCreateSceneResult>;
export type TSoftReloadScene = z.infer<typeof SchemaSoftReloadScene>;
