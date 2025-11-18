
import { z } from 'zod';

const FILE_EXTENSIONS = ['js', 'ts', 'jsx', 'tsx', 'json',
    'txt', 'md', 'xml', 'html', 'css'] as const;

// 在文件第 n 行插入内容的信息
export const SchemaInsertTextAtLineInfo = z.object({
    dbURL: z.string().describe('需要修改文件名'),
    fileType: z.enum(FILE_EXTENSIONS).describe('文件类型'),
    lineNumber: z.number().min(1).default(1).describe('行号(从1开始)'),
    text: z.string().describe('需要插入的文本内容'),
}).describe('从第 lineNumber 行插入内容的信息');

// 删除文件的第 startLine 到 endLine 行的内容
export const SchemaEraseLinesInRangeInfo = z.object({
    dbURL: z.string().describe('需要修改文件名'),
    fileType: z.enum(FILE_EXTENSIONS).describe('文件类型'),
    startLine: z.number().min(1).default(1).describe('从第 startLine 行开始删除'),
    endLine: z.number().min(1).default(1).describe('从第 endLine 行结束删除(endLine也删除)'),
}).describe('删除文件的第 startLine 行到 endLine 的信息(endLine也删除)');

// 替换文件的 目标文本 为 替换文本
export const SchemaReplaceTextInFileInfo = z.object({
    dbURL: z.string().describe('需要修改文件名'),
    fileType: z.enum(FILE_EXTENSIONS).describe('文件类型'),
    targetText: z.string().nonempty().describe('目标文本'),
    replacementText: z.string().describe('替换文本'),
    regex: z.boolean().describe('是否使用正则表达式')
}).describe('替换文件的 目标文本（文本或者正则表达式） 为 替换文本');

export const SchemaQueryFileTextInfo = z.object({
    dbURL: z.string().describe('需要查询文件名'),
    fileType: z.enum(FILE_EXTENSIONS).describe('文件类型'),
    startLine: z.number().min(1).default(1).describe('从第 startLine 行开始查询(默认从第1行开始)'),
    lineCount: z.number().default(-1).describe('从第 startLine 行开始查询的行数(负数为全部行，默认-1)'),
}).describe('查询文件的第 startLine 开始, lineCount 行数的信息');

// 列举支持的文件后缀类型
export const SchemaFileEditorResult = z.boolean().describe('文件编辑的结果');
export const SchemaFileQueryTextResult = z.string().describe('查询到的文件内容');

export type TInsertTextAtLineInfo = z.infer<typeof SchemaInsertTextAtLineInfo>;
export type TEraseLinesInRangeInfo = z.infer<typeof SchemaEraseLinesInRangeInfo>;
export type TReplaceTextInFileInfo = z.infer<typeof SchemaReplaceTextInFileInfo>;
export type TQueryFileTextInfo = z.infer<typeof SchemaQueryFileTextInfo>;

export type TFileEditorResult = z.infer<typeof SchemaFileEditorResult>;
export type TFileQueryTextResult = z.infer<typeof SchemaFileQueryTextResult>;
