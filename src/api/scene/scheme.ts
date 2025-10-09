import { z } from 'zod';

// 场景名称相关的 scheme
export const SchemeSceneUUID = z.string().describe('场景资源的唯一标识符 UUID');

// 当前场景信息
export const SchemeCurrentOpenSceneResult = z.object({
    path: z.string().describe('打开的场景文件路径'),
    uuid: z.string().describe('场景资源的唯一标识符 UUID'),
    url: z.string().describe('场景在数据库中的路径，使用 db:// 协议格式'),
    name: z.string().describe('场景名称'),
}).describe('当前场景的信息');

// 打开场景的结果
export const SchemeOpenSceneResult = z.object({
    path: z.string().describe('打开的场景文件路径'),
    uuid: z.string().describe('场景资源的唯一标识符 UUID'),
}).describe('打开场景操作的结果信息');

// 关闭场景的结果
export const SchemeCloseSceneResult = z.object({
    path: z.string().optional().describe('关闭的场景文件路径'),
}).describe('关闭场景操作的结果信息');

// 保存场景的结果
export const SchemeSaveSceneResult = z.object({
    path: z.string().describe('保存的场景文件路径'),
    uuid: z.string().describe('场景资源的唯一标识符 UUID'),
}).describe('保存场景操作的结果信息');

// 创建场景的参数
export const SchemeCreateSceneOptions = z.object({
    name: z.string().describe('场景名称'),
    templateType: z.enum(['default', '2d', '3d', 'quality']).optional().default('default').describe('场景模板类型'),
    targetPath: z.string().describe('场景创建的目标路径'),
}).describe('创建场景的选项参数');

// 创建场景的结果
export const SchemeCreateSceneResult = z.object({
    path: z.string().describe('创建的场景文件路径'),
    url: z.string().describe('场景在数据库中的路径，使用 db:// 协议格式'),
    uuid: z.string().describe('场景资源的唯一标识符 UUID'),
}).describe('创建场景操作的结果信息');

// 类型导出
export type TSceneUUID = z.infer<typeof SchemeSceneUUID>;
export type TCurrentOpenSceneResult = z.infer<typeof SchemeCurrentOpenSceneResult>;
export type TOpenSceneResult = z.infer<typeof SchemeOpenSceneResult>;
export type TCloseSceneResult = z.infer<typeof SchemeCloseSceneResult>;
export type TSaveSceneResult = z.infer<typeof SchemeSaveSceneResult>;
export type TCreateSceneOptions = z.infer<typeof SchemeCreateSceneOptions>;
export type TCreateSceneResult = z.infer<typeof SchemeCreateSceneResult>;
