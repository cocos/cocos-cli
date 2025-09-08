import { existsSync } from 'fs';
import { appendFile, outputFileSync, readdir, remove } from 'fs-extra';
import { basename } from 'path';
import { transI18nName } from './utils';
export type IConsoleType = 'log' | 'warn' | 'error' | 'debug';

interface IConsoleMessage {
    type: IConsoleType,
    value: any;
}
export interface trackTimeEndOptions {
    output?: boolean;
    label?: string;
    value?: number;
}

let rawConsole: any;

/**
 * 自定义的一个新 console 类型，用于收集日志
 */
export class NewConsole {
    command = false;
    messages: IConsoleMessage[] = [];
    private logDest: string = '';
    private _start = false;
    private memoryTrackMap: Map<string, number> = new Map();
    private trackTimeStartMap: Map<string, number> = new Map();

    _init = false;

    public init(logDest: string) {
        if (!this._init) {
            return;
        }
        // 兼容可能存在多个同样自定义 console 的处理
        // @ts-ignore
        if (console.__rawConsole) {
            // @ts-ignore
            rawConsole = console.__rawConsole;
        } else {
            rawConsole = console;
        }
        // @ts-ignore 手动继承 console
        this.__proto__.__proto__ = rawConsole;
        this.initLogFiles(logDest);
        this._init = true;
    }

    public initLogFiles(logDest: string) {
        this.logDest = logDest;
        try {
            if (!existsSync(this.logDest)) {
                // 每次设置 id 的时候，初始化任务的 log 信息，注意顺序
                outputFileSync(this.logDest, '');
            }
        } catch (error) {
            console.debug(error);
        }
    }

    /**
     * 开始记录资源导入日志
     * */
    public record() {
        // HACK 合并进程后，日志会互相污染干扰，目前只能优先保障构建的日志记录。
        // TODO 3.8 可以考虑将编译、运行都拆到和脚本编译等类似的独立进程内
        // @ts-ignore
        if (window.console.switchConsole) {
            // @ts-ignore
            window.console.switchConsole(this);
            return;
        }
        this._start = true;
        // @ts-ignore 将处理过的继承自 console 的新对象赋给 windows
        window.console = this;
        rawConsole.debug(`Start record asset-db log in {file(${this.logDest})}`);
    }

    /**
     * 停止记录
     */
    public stopRecord() {
        rawConsole.debug(`Stop record asset-db log. {file(${this.logDest})}`);
        // @ts-ignore 将处理过的继承自 console 的新对象赋给 windows
        window.console = rawConsole;
        this._start = false;
    }

    // --------------------- 重写 console 相关方法 -------------------------

    public log(...args: any[]) {
        rawConsole.log(...args);
        if (!this._start) {
            return;
        }
        this.messages.push({
            type: 'log',
            value: args,
        });
        this.save();
    }

    public error(error: Error | string) {
        rawConsole.error(error);
        if (!this._start) {
            return;
        }
        this.messages.push({
            type: 'error',
            value: error,
        });
        this.save();
    }

    public warn(...args: any[]) {
        rawConsole.warn(...args);
        if (!this._start) {
            return;
        }
        this.messages.push({
            type: 'warn',
            value: args,
        });
        this.save();
    }

    public debug(...args: any[]) {
        rawConsole.debug(...args);
        if (!this._start) {
            return;
        }
        this.messages.push({
            type: 'debug',
            value: args,
        });
        this.save();
    }

    private async save() {
        if (!this._start || !this.messages.length) {
            return;
        }

        const msgInfo = this.messages.shift();
        await this.saveLog(msgInfo!.type, msgInfo!.value);
    }

    /**
     * 收集日志
     * @param type 日志类型
     * @param info 日志内容
     */
    private async saveLog(type: IConsoleType, info: any[] | string) {
        if (!info || !existsSync(this.logDest)) {
            return;
        }

        const content = `${getRealTime()}-${type}: ${translate(info)}\n`;
        appendFile(this.logDest, content);
        // if (this.command) {
        //     ccWorker.Ipc.send('build-worker:stdout', type, content);
        // }
    }

    trackMemoryStart(name: string) {
        const heapUsed = process.memoryUsage().heapUsed;
        this.memoryTrackMap.set(name, heapUsed);
        return heapUsed;
    }

    trackMemoryEnd(name: string, output = true) {
        const start = this.memoryTrackMap.get(name);
        if (!start) {
            return 0;
        }
        const heapUsed = process.memoryUsage().heapUsed;
        this.memoryTrackMap.delete(name);
        const res = heapUsed - start;
        if (output) {
            // 数值过小时不输出，没有统计意义
            res > 1024 * 1024 && console.debug(`[Assets Memory track]: ${name} start:${formateBytes(start)}, end ${formateBytes(heapUsed)}, increase: ${formateBytes(res)}`);
            return output;
        }
        return res;
    }

    trackTimeStart(message: string, time?: number) {
        if (this.trackTimeStartMap.has(message)) {
            this.trackTimeStartMap.delete(message);
        }
        this.trackTimeStartMap.set(message, time || Date.now());
    }

    trackTimeEnd(message: string, options: trackTimeEndOptions = {}, time?: number): number {
        const recordTime = this.trackTimeStartMap.get(message);
        if (!recordTime) {
            this.debug(`trackTimeEnd failed! Can not find the track time ${message} start`);
            return 0;
        }
        time = time || Date.now();
        const durTime = time - recordTime;
        const label = typeof options.label === 'string' ? transI18nName(options.label) : message;
        this.debug(label + ` (${durTime}ms)`);
        this.trackTimeStartMap.delete(message);
        return durTime;
    }
}

export function formateBytes(bytes: number) {
    return (bytes / 1024 / 1024).toFixed(2) + 'MB';
}

export function transTimeToNumber(time: string) {
    time = basename(time, '.log');
    const info = time.match(/-(\d+)$/);
    if (info) {
        const timeStr = Array.from(time);
        timeStr[info.index!] = ':';
        return new Date(timeStr.join('')).getTime();
    }
    return new Date().getTime();
}

function translate(msg: any): string {
    if (typeof msg === 'string' && !msg.includes('\n') || typeof msg === 'number') {
        return String(msg);
    }
    if (typeof msg === 'string' && msg.includes('\n')) {
        return translate(msg.split('\n'));
    }

    if (typeof msg === 'object') {
        if (Array.isArray(msg)) {
            let res = '';
            msg.forEach((data: any) => {
                res += `${translate(data)}\r`;
            });
            return res;
        }
        try {
            if (msg.stack) {
                return translate(msg.stack);
            }
            return JSON.stringify(msg);
        } catch (error) {

        }
    }
    return msg && msg.toString && msg.toString();
}

/**
 * 获取最新时间
 * @returns 2019-03-26 11:03
 */
export function getRealTime() {
    const time = new Date();
    return time.toLocaleDateString().replace(/\//g, '-') + ' ' + time.toTimeString().slice(0, 8);
}

export const newConsole = new NewConsole();
