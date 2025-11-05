
import {
    SchemaInsertTextAtLineInfo,
    SchemaEraseLinesInRangeInfo,
    SchemaFileEditorResult,
    SchemaReplaceTextInFileInfo,
    SchemaReplaceTextWithRegexInFileInfo,

    TInsertTextAtLineInfo,
    TFileEditorResult,
    TEraseLinesInRangeInfo,
    TReplaceTextInFileInfo,
    TReplaceTextWithRegexInFileInfo,
} from './file-editor-schema';

import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { insertTextAtLine, eraseLinesInRange, replaceTextInFile, replaceTextWithRegexInFile } from '../../core/filesystem/file-edit';

export class FileEditorApi {
    @tool('file-editor-insert-text-at-line')
    @title('在文件第n行后插入内容')
    @description('在文件第 n 行后插入内容，返回成功或者失败')
    @result(SchemaFileEditorResult)
    async insertTextAtLine(@param(SchemaInsertTextAtLineInfo) param: TInsertTextAtLineInfo): Promise<CommonResultType<TFileEditorResult>> {
        try {
            const result = await insertTextAtLine(param.filename, param.lineNumber, param.text);
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

    @tool('file-editor-erase-lines-in-range')
    @title('删除文件第 startLine 到 endLine 之间的内容')
    @description('删除文件第 startLine 到 endLine 之间的内容，返回成功或者失败')
    @result(SchemaFileEditorResult)
    async eraseLinesInRange(@param(SchemaEraseLinesInRangeInfo) param: TEraseLinesInRangeInfo): Promise<CommonResultType<TFileEditorResult>> {
        try {
            const result = await eraseLinesInRange(param.filename, param.startLine, param.endLine);
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

    @tool('file-editor-replace-text-in-file')
    @title('替换文件中的 目标文本 为 替换文本')
    @description('替换文件中的 目标文本 为 替换文本，只会替换首次出现的目标版本，返回成功或者失败')
    @result(SchemaFileEditorResult)
    async replaceTextInFile(@param(SchemaReplaceTextInFileInfo) param: TReplaceTextInFileInfo): Promise<CommonResultType<TFileEditorResult>> {
        try {
            const result = await replaceTextInFile(param.filename, param.targetText, param.replacementText);
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

    @tool('file-editor-replace-text-with-regex-in-file')
    @title('替换文件中的 目标文本(含正则表达式) 为 替换文本')
    @description('替换文件中的 目标文本(含正则表达式) 为 替换文本，会替换所有的目标文本，返回成功或者失败')
    @result(SchemaFileEditorResult)
    async replaceTextWithRegexInFile(@param(SchemaReplaceTextWithRegexInFileInfo) param: TReplaceTextWithRegexInFileInfo): Promise<CommonResultType<TFileEditorResult>> {
        try {
            const result = await replaceTextWithRegexInFile(param.filename, param.targetText, param.replacementText);
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
