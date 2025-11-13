
import {
    SchemaInsertTextAtLineInfo,
    SchemaEraseLinesInRangeInfo,
    SchemaReplaceTextInFileInfo,
    SchemaFileEditorResult,

    TInsertTextAtLineInfo,
    TFileEditorResult,
    TEraseLinesInRangeInfo,
    TReplaceTextInFileInfo,
    SchemaQueryFileTextInfo,
    TQueryFileTextInfo,
    TFileQueryTextResult,
    SchemaFileQueryTextResult,
} from './file-editor-schema';

import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { insertTextAtLine, eraseLinesInRange, replaceTextInFile, queryLinesInFile } from '../../core/filesystem/file-edit';

export class FileEditorApi {
    @tool('file-insert-text')
    @title('在文件第n行前插入内容')
    @description('在文件第 n 行前插入内容，返回成功或者失败。行号大于文件总行数时，插入到文件末尾')
    @result(SchemaFileEditorResult)
    async insertTextAtLine(@param(SchemaInsertTextAtLineInfo) param: TInsertTextAtLineInfo): Promise<CommonResultType<TFileEditorResult>> {
        try {
            const result = await insertTextAtLine(param.dbURL, param.fileType, param.lineNumber, param.text);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: result,
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('file-delete-text')
    @title('删除文件第 startLine 到 endLine 之间的内容')
    @description('删除文件第 startLine 到 endLine 之间的内容，返回成功或者失败')
    @result(SchemaFileEditorResult)
    async eraseLinesInRange(@param(SchemaEraseLinesInRangeInfo) param: TEraseLinesInRangeInfo): Promise<CommonResultType<TFileEditorResult>> {
        try {
            const result = await eraseLinesInRange(param.dbURL, param.fileType, param.startLine, param.endLine);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: result,
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('file-replace-text')
    @title('替换文件中的 目标文本 为 替换文本')
    @description('替换文件中的 目标文本(含正则表达式) 为 替换文本，只替换唯一出现的目标文本（如果有多个视为失败），返回成功或者失败')
    @result(SchemaFileEditorResult)
    async replaceTextInFile(@param(SchemaReplaceTextInFileInfo) param: TReplaceTextInFileInfo): Promise<CommonResultType<TFileEditorResult>> {
        try {
            const result = await replaceTextInFile(param.dbURL, param.fileType, param.targetText, param.replacementText, param.regex);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: result,
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    @tool('file-query-text')
    @title('查询文件指定行数的内容')
    @description('查询文件从 startLine 行开始的指定行数内容，返回查询到的内容数组')
    @result(SchemaFileQueryTextResult)
    async queryFileText(@param(SchemaQueryFileTextInfo) param: TQueryFileTextInfo): Promise<CommonResultType<TFileQueryTextResult>> {
        try {
            const result = await queryLinesInFile(param.dbURL, param.fileType, param.startLine, param.lineCount);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: result,
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }
}
