import { spawn, SpawnOptions } from 'child_process';

export const enum LogLevel {
    LOG,
    WARN,
    ERROR,
    NULL,
}

export interface IQuickSpawnOption extends SpawnOptions {
    cwd?: string;
    env?: any;
    // 输出等级，默认 log 级别以上都打印
    logLevel?: LogLevel;

    downGradeWaring?: boolean; // 警告将会转为 log 打印，默认为 false
    downGradeLog?: boolean; // log 将会转为 debug 打印，默认为 true
    downGradeError?: boolean; // 错误将会转为警告打印，默认为 false

    onlyPrintWhenError?: boolean;// 日志都正常收集，但仅在发生错误时打印信息，其他时候静默处理

    prefix?: string; // log 输出前缀
}

/**
* 快速开启子进程
* @param command 
* @param cmdParams 
* @param options 
* @returns 
*/
export function quickSpawn(command: string, cmdParams: string[], options: IQuickSpawnOption = {
    downGradeLog: true,
    onlyPrintWhenError: true,
    prefix: '',
}): Promise<boolean> {
    return new Promise((resolve, reject) => {
        options.prefix = options.prefix || '';
        const child = spawn(command, cmdParams, {
            cwd: options?.cwd || undefined,
            env: options?.env,
            ...options,
        });

        let outputData = '';
        function output(type: 'log' | 'debug' | 'warn' | 'error', data: Buffer) {
            if (options.onlyPrintWhenError) {
                outputData += data;
                return;
            }
            if (type === 'log' && options.downGradeLog) {
                type = 'debug';
            } else if (type === 'warn' && options.downGradeWaring) {
                type = 'log';
            } else if (type === 'error' && options.downGradeError) {
                type = 'warn';
            }
            console[type](options.prefix + data.toString());
        }
        if (options.logLevel !== undefined && options.logLevel >= 0) {
            child.stdout!.on('data', (data) => {
                output('log', data);
            });
        }
        if (options.logLevel !== undefined && options.logLevel >= 1) {
            child.stderr!.on('data', (err) => {
                const error = err.toString();
                // 过滤掉空或只有换行的报错
                if (!error || error === '\n') {
                    return;
                }
                output('error', err);
            });
        }

        child.on('close', (code) => {
            if (code !== 0) {
                reject(options.prefix + `Child process exit width code ${code}: ${command} ${cmdParams.toString()}`);
            } else {
                resolve(true);
            }
        });
        child.on('error', (err: Error) => {
            outputData && console.debug(options.prefix + 'child process output: ', { outputData });
            console.error(options.prefix + `child process error: ${command} ${cmdParams.toString()}`);
            reject(err);
        });
        child.on('exit', (code) => {
            !options.onlyPrintWhenError && console.debug(options.prefix + `Child process exit width code ${code}`);
        });
    });
}