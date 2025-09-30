import { z } from 'zod';

export const SchemeJsonStr = z.string().min(1).describe('有效的 JSON 格式字符串，用于创建 JSON 资源文件');
export const SchemeCreateJsonFile = z.object({
    filePath: z.string().describe('创建的文件在文件系统中的绝对路径'),
    dbPath: z.string().describe('资源在数据库中的路径，使用 db:// 协议格式'),
    uuid: z.string().describe('资源的唯一标识符 UUID'),
}).describe('创建 JSON 文件的结果信息');
export const SchemeDirOrDbPath = z.string().min(1).describe('目录或资源的路径，可以是文件系统路径或 db:// 协议路径');
export const SchemeDbDirResult = z.object({
    dbPath: z.string().describe('操作后的资源路径，使用 db:// 协议格式'),
}).describe('资源数据库目录操作的结果');

export type TJsonStr = z.infer<typeof SchemeJsonStr>;
export type TDirOrDbPath = z.infer<typeof SchemeDirOrDbPath>;
export type TCreateJsonFileResult = z.infer<typeof SchemeCreateJsonFile>;
export type TDbDirResult = z.infer<typeof SchemeDbDirResult>;