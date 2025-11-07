
import { z } from 'zod';

const FILE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.json',
    '.txt', '.md', '.xml', '.html', '.css'] as const;

// 在文件第 n 行插入内容的信息
export const SchemaInsertTextAtLineInfo = z.object({
    dbURL: z.string().describe('需要修改文件名'),
    fileType: z.enum(FILE_EXTENSIONS).describe('文件类型'),
    lineNumber: z.number().default(0).describe('行号'),
    text: z.string().describe('需要插入的文本内容'),
}).describe('从第 lineNumber 行插入内容的信息');

// 删除文件的第 startLine 到 endLine 行的内容
export const SchemaEraseLinesInRangeInfo = z.object({
    dbURL: z.string().describe('需要修改文件名'),
    fileType: z.enum(FILE_EXTENSIONS).describe('文件类型'),
    startLine: z.number().default(0).describe('从第 startLine 行开始删除'),
    endLine: z.number().default(1).describe('从第 endLine 行结束删除(endLine也删除)'),
}).describe('删除文件的第 startLine 行到 endLine 的信息(endLine也删除)');

// 替换文件的 目标文本 为 替换文本
export const SchemaReplaceTextInFileInfo = z.object({
    dbURL: z.string().describe('需要修改文件名'),
    fileType: z.enum(FILE_EXTENSIONS).describe('文件类型'),
    targetText: z.string().describe('目标文本'),
    replacementText: z.string().describe('替换文本'),
}).describe('替换文件的 目标文本（正则表达式） 为 替换文本');

// 列举支持的文件后缀类型
export const SchemaFileEditorResult = z.boolean().describe('文件编辑的结果');

export type TInsertTextAtLineInfo = z.infer<typeof SchemaInsertTextAtLineInfo>;
export type TEraseLinesInRangeInfo = z.infer<typeof SchemaEraseLinesInRangeInfo>;
export type TReplaceTextInFileInfo = z.infer<typeof SchemaReplaceTextInFileInfo>;

export type TFileEditorResult = z.infer<typeof SchemaFileEditorResult>;
