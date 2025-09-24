import { z } from 'zod';

export const uriPath = z.string().describe('uri path');
export type TypeUriPath = z.infer<typeof uriPath>;

export const queryResult = z.object({
    url: z.string().describe('url'),
}).describe('query url result');
export type TypeQueryResult = z.infer<typeof queryResult>;

export const jsonStr = z.string().describe('json string');
export type TypeJsonStr = z.infer<typeof jsonStr>;

export const importResult = z.object({
    filePath: z.string().describe('file path'),
    dbPath: z.string().describe('db path'),
    uuid: z.string().describe('asset uuid'),
}).describe('import assets result');
export type TypeImportResult = z.infer<typeof importResult>;

export const dirOrDbPath = z.string().describe('dir or db path');
export type TypeDirOrDbPath = z.infer<typeof dirOrDbPath>;
export const refreshDirResult = z.object({
    dbPath: z.string().describe('will be db:// protocol path'),
}).describe('refresh dir result');
export type TypeRefreshDirResult = z.infer<typeof refreshDirResult>;