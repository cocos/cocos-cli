
import { z } from 'zod';

const FILE_EXTENSIONS = ['js', 'ts', 'jsx', 'tsx', 'json',
    'txt', 'md', 'xml', 'html', 'css'] as const;

// Information for inserting content at line n of the file // 在文件第 n 行插入内容的信息
export const SchemaInsertTextAtLineInfo = z.object({
    dbURL: z.string().describe('Asset URL of the file to be modified'), // 需要修改的文件的资产URL
    fileType: z.enum(FILE_EXTENSIONS).describe('File type'), // 文件类型
    lineNumber: z.number().min(1).default(1).describe('Line number (starting from 1)'), // 行号(从1开始)
    text: z.string().describe('Text content to insert'), // 需要插入的文本内容
}).describe('Information for inserting content starting from line lineNumber'); // 从第 lineNumber 行插入内容的信息

// Delete content from startLine to endLine of the file // 删除文件的第 startLine 到 endLine 行的内容
export const SchemaEraseLinesInRangeInfo = z.object({
    dbURL: z.string().describe('Asset URL of the file to be modified'), // 需要修改的文件的资产URL
    fileType: z.enum(FILE_EXTENSIONS).describe('File type'), // 文件类型
    startLine: z.number().min(1).default(1).describe('Start deleting from startLine'), // 从第 startLine 行开始删除
    endLine: z.number().min(1).default(1).describe('End deleting at endLine (endLine is also deleted)'), // 从第 endLine 行结束删除(endLine也删除)
}).describe('Information for deleting file content from startLine to endLine (endLine is also deleted)'); // 删除文件的第 startLine 行到 endLine 的信息(endLine也删除)

// Replace target text in file with replacement text // 替换文件的 目标文本 为 替换文本
export const SchemaReplaceTextInFileInfo = z.object({
    dbURL: z.string().describe('Asset URL of the file to be modified'), // 需要修改的文件的资产URL
    fileType: z.enum(FILE_EXTENSIONS).describe('File type'), // 文件类型
    targetText: z.string().nonempty().describe('Target text'), // 目标文本
    replacementText: z.string().describe('Replacement text'), // 替换文本
    regex: z.boolean().describe('Whether to use regular expressions') // 是否使用正则表达式
}).describe('Replace target text (text or regex) in file with replacement text'); // 替换文件的 目标文本（文本或者正则表达式） 为 替换文本

export const SchemaQueryFileTextInfo = z.object({
    dbURL: z.string().describe('Asset URL of the file to be queried'), // 需要查询文件的资产URL
    fileType: z.enum(FILE_EXTENSIONS).describe('File type'), // 文件类型
    startLine: z.number().min(1).default(1).describe('Start querying from startLine (default starts from line 1)'), // 从第 startLine 行开始查询(默认从第1行开始)
    lineCount: z.number().default(-1).describe('Number of lines to query starting from startLine (negative number for all lines, default -1)'), // 从第 startLine 行开始查询的行数(负数为全部行，默认-1)
}).describe('Information for querying file content starting from startLine for lineCount lines'); // 查询文件的第 startLine 开始, lineCount 行数的信息

// List supported file extension types // 列举支持的文件后缀类型
export const SchemaFileEditorResult = z.boolean().describe('Result of file editing'); // 文件编辑的结果
export const SchemaFileQueryTextResult = z.string().describe('Queried file content'); // 查询到的文件内容

export type TInsertTextAtLineInfo = z.infer<typeof SchemaInsertTextAtLineInfo>;
export type TEraseLinesInRangeInfo = z.infer<typeof SchemaEraseLinesInRangeInfo>;
export type TReplaceTextInFileInfo = z.infer<typeof SchemaReplaceTextInFileInfo>;
export type TQueryFileTextInfo = z.infer<typeof SchemaQueryFileTextInfo>;

export type TFileEditorResult = z.infer<typeof SchemaFileEditorResult>;
export type TFileQueryTextResult = z.infer<typeof SchemaFileQueryTextResult>;
