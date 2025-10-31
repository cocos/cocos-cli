
import { number, z } from 'zod';
import { IConsoleType } from '../../core/base/console';

const consoleTypeValues: IConsoleType[] = [
    'log', 'warn', 'error', 'debug', 'info', 'success', 'ready', 'start'
];

// 查询 cli 日志信息
export const SchemaQueryLogParamInfo = z.object({
    number: z.number().default(10).describe('获取日志文件的最后 n 行内容'),
    logLevel: z.enum(consoleTypeValues as [IConsoleType, ...IConsoleType[]]).optional().describe('日志级别')
}).describe('需要查询的日志信息');

// 返回 cli 日志信息
export const SchemaQueryLogResult = z.array(z.string()).describe('日志信息');

// 类型导出
export type TQueryLogParamnfo = z.infer<typeof SchemaQueryLogParamInfo>;
export type TQueryLogResult = z.infer<typeof SchemaQueryLogResult>;