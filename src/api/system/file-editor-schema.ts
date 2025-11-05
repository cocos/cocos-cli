
import { number, z } from 'zod';
import { IConsoleType } from '../../core/base/console';

// 在文件第 n 行插入内容的信息
export const SchemaInsertTextAtLineInfo = z.object({
   filename:z.string().describe("需要修改文件名"),
   lineNumber:z.number().default(0).describe("行号"),
   text:z.string().describe("需要插入的文本内容"),
}).describe('从第 lineNumber 行插入内容的信息');

// 删除文件的第 startLine 到 endLine 行的内容
export const SchemaEraseLinesInRangeInfo = z.object({
   filename:z.string().describe("需要修改文件名"),
   startLine:z.number().default(0).describe("从第 startLine 行开始删除"),
   endLine:z.number().default(1).describe("从第 endLine 行开始结束删除"),
}).describe('删除文件的第 startLine 行到 endLine 的信息');

// 删除文件的第 startLine 到 endLine 行的内容
export const SchemaReplaceTextInFileInfo = z.object({
   filename:z.string().describe("需要修改文件名"),
   targetText:z.string().describe("目标文本"),
   replacementText:z.string().describe("替换文本"),
}).describe('替换文件的 目标文本 为 替换文本');

// 删除文件的第 startLine 到 endLine 行的内容
export const SchemaReplaceTextWithRegexInFileInfo = SchemaReplaceTextInFileInfo.extend({
}).describe('替换文件的 目标文本（正则表达式） 为 替换文本');

export const SchemaFileEditorResult = z.boolean().describe('文件编辑的结果');


export type TInsertTextAtLineInfo = z.infer<typeof SchemaInsertTextAtLineInfo>;
export type TEraseLinesInRangeInfo = z.infer<typeof SchemaEraseLinesInRangeInfo>;
export type TReplaceTextInFileInfo = z.infer<typeof SchemaReplaceTextInFileInfo>;
export type TReplaceTextWithRegexInFileInfo = z.infer<typeof SchemaReplaceTextWithRegexInFileInfo>;

export type TFileEditorResult = z.infer<typeof SchemaFileEditorResult>;
