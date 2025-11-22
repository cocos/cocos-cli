import { z } from 'zod';

export const SchemaProjectPath = z.string().describe('项目路径');
export type TProjectPath = z.infer<typeof SchemaProjectPath>;

export const SchemaPort = z.number().optional().describe('端口号');
export type TPort = z.infer<typeof SchemaPort>;

export const SchemaProjectType = z.enum(['2d', '3d']).describe('项目类型');
export type TProjectType = z.infer<typeof SchemaProjectType>;
