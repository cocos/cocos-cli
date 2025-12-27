import { z } from 'zod';

export const SchemaProjectPath = z.string().describe('Project Path'); // 项目路径
export type TProjectPath = z.infer<typeof SchemaProjectPath>;

export const SchemaPort = z.number().optional().describe('Port Number'); // 端口号
export type TPort = z.infer<typeof SchemaPort>;

export const SchemaProjectType = z.enum(['2d', '3d']).describe('Project Type'); // 项目类型
export type TProjectType = z.infer<typeof SchemaProjectType>;
