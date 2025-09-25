import { z } from 'zod';

export const jsonStr = z.string().describe('json string');
export type TypeJsonStr = z.infer<typeof jsonStr>;

export const createJsonFile = z.object({
    filePath: z.string().describe('file path'),
    dbPath: z.string().describe('db path'),
    uuid: z.string().describe('asset uuid'),
}).describe('create json file result');
export type TypeCreateJsonFileResult = z.infer<typeof createJsonFile>;

export const dirOrDbPath = z.string().describe('dir or db path');
export type TypeDirOrDbPath = z.infer<typeof dirOrDbPath>;
export const dbDirResult = z.object({
    dbPath: z.string().describe('will be db:// protocol path'),
}).describe('asset db dir result');
export type TypeDbDirResult = z.infer<typeof dbDirResult>;