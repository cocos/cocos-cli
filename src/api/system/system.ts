
import {
    SchemaClearLogResult,
    SchemaQueryLogParamInfo,
    SchemaQueryLogResult,
    TClearLogResult,
    TQueryLogParamInfo,
    TQueryLogResult
} from './system-schema';

import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { newConsole } from '../../core/base/console';
import { FileEditorApi } from './file-editor';

export class SystemApi {
    public fileEditor: FileEditorApi;
    
    constructor() {
        this.fileEditor = new FileEditorApi();
    }

    /**
     * Query CLI log information // 查询 cli 日志信息
     */
    @tool('system-query-logs')
    @title('Query CLI logs') // 查询 cli 日志
    @description('Returns log information generated after executing CLI. The first parameter refers to returning the last n lines of log information, loglevel is the log level to query, such as Error, Warning, Info, Debug, etc.') // 返回执行 cli 后产生的日志信息。第一个参数是指返回最后前 n 行的日志信息，loglevel需要查询的日志级别，例如Error，Warning，Info，Debug等
    @result(SchemaQueryLogResult)
    async queryLogs(@param(SchemaQueryLogParamInfo) queryParam: TQueryLogParamInfo): Promise<CommonResultType<TQueryLogResult>> {
        try {
            const logs = newConsole.queryLogs(queryParam.number, queryParam.logLevel);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: logs,
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

    /**
     * Clear CLI log information // 清除 cli 日志信息
     */
    @tool('system-clear-logs')
    @title('Clear CLI logs') // 清除 cli 日志
    @description('Clear CLI log information') // 清除 cli 日志信息
    @result(SchemaClearLogResult)
    async clearLogs(): Promise<CommonResultType<TClearLogResult>> {
        try {
            newConsole.clearLogs();
            return {
                code: COMMON_STATUS.SUCCESS,
                data: true,
            };
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }
}
