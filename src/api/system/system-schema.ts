
import { z } from 'zod';
import { IConsoleType } from '../../core/base/console';

const consoleTypeValues: IConsoleType[] = [
    'log', 'warn', 'error', 'debug', 'info', 'success', 'ready', 'start'
];

// Query CLI log information // 查询 cli 日志信息
export const SchemaQueryLogParamInfo = z.object({
    number: z.number().default(10).describe('Get the last n lines of the log file'), // 获取日志文件的最后 n 行内容
    logLevel: z.enum(consoleTypeValues as [IConsoleType, ...IConsoleType[]]).optional().describe('Log level') // 日志级别
}).describe('Log information to query'); // 需要查询的日志信息

// Return CLI log information // 返回 cli 日志信息
export const SchemaQueryLogResult = z.array(z.string()).describe('Log information'); // 日志信息

// Clear CLI log information // 清除 cli 日志信息
export const SchemaClearLogResult = z.boolean().describe('Clear log information'); // 清除日志信息

// Type export // 类型导出
export type TQueryLogParamInfo = z.infer<typeof SchemaQueryLogParamInfo>;
export type TQueryLogResult = z.infer<typeof SchemaQueryLogResult>;

export type TClearLogResult = z.infer<typeof SchemaClearLogResult>;
