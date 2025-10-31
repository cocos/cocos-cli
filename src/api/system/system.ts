
import {
    SchemaQueryLogParamInfo,
    SchemaQueryLogResult,
    TQueryLogParamnfo,
    TQueryLogResult
} from './system-schema';

import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { newConsole } from '../../core/base/console';

export class systemApi {
    /**
     * 查询 cli 日志信息
     */
    @tool('system-query-logs')
    @title('查询 cli 日志')
    @description('返回执行 cli 后产生的日志信息。第一个参数是指返回最后前 n 行的日志信息，loglevel需要查询的日志级别，例如Error，Warning，Info，Debug等')
    @result(SchemaQueryLogResult)
    async queryLogs(@param(SchemaQueryLogParamInfo) queryParam: TQueryLogParamnfo): Promise<CommonResultType<TQueryLogResult>> {
        try {
            const logs = newConsole.queryLogs(queryParam.number, queryParam.logLevel);
            return {
                code: COMMON_STATUS.SUCCESS,
                data: logs,
            }
        } catch (e) {
            return {
                code: COMMON_STATUS.FAIL,
                reason: e instanceof Error ? e.message : String(e)
            };
        }
    }

}
