'use strict';

interface IMessageInfo {
    type: string;
    path: string;
    method?: string;
    args?: any[];
    logDest?: string;
}

process.on('uncaughtException', (err) => {
    console.error(err);
});

process.on('message', async function (msgInfo: IMessageInfo) {
    if (msgInfo.type === 'execute-script' && process.send) {
        recordChildLog(msgInfo.logDest);
        const res = await executeScript(msgInfo.path, msgInfo.method, msgInfo.args);
        process.send({
            data: (res instanceof Error) ? res.message : res,
            code: (res instanceof Error) ? -1 : 0,
            type: 'execute-script-end',
        });
    }
});

// 子进程警告输出 HACK 1/2
const RawWarning = console.warn;
console.warn = function warning(...args: any[]) {
    try {
        if (typeof args[0] === 'string') {
            args[0] = '[warning]' + args[0];
        } else if (args[0] && args[0].name) {
            args[0].name = '[warning]' + args[0].name;
        }
    } catch (error) {
        console.debug(error);
    }
    RawWarning(...args);
};

console.log(`enter sub process ${process.pid}, ${process.debugPort}, see: chrome://inspect/#devices`);

let currentLogDest = '';
function recordChildLog(logDest?: string) {
    if (!logDest || currentLogDest === logDest) {
        return;
    }
    try {
        const { newConsole } = require('../../../base/console');
        newConsole.init(logDest, true);
        newConsole.record(logDest);
        currentLogDest = logDest;
    } catch (error) {
        console.error(error);
    }
}

async function executeScript(path: string, method = 'handler', args: any[] = []): Promise<any> {
    try {
        const module = require(path);
        return await module[method](...args);
    } catch (error) {
        console.error(error);
        return error;
    }
}
