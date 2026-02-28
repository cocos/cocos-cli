import { basename, join } from 'path';
import { consola, type ConsolaInstance } from 'consola';
import type { Ora } from 'ora';
import pino from 'pino';
import i18n from './i18n';
import stripAnsi from 'strip-ansi';
export type IConsoleType = 'log' | 'warn' | 'error' | 'debug' | 'info' | 'success' | 'ready' | 'start';

interface IConsoleMessage {
    type: IConsoleType,
    value: any;
}
export interface trackTimeEndOptions {
    output?: boolean;
    label?: string;
    value?: number;
}

let rawConsole: any = global.console;

/**
 * 自定义的一个新 console 类型，用于收集日志
 * 集成 console 提供美观的日志输出
 */
export class NewConsole {
    command = false;
    messages: IConsoleMessage[] = [];
    private logDest: string = '';
    private _start = false;
    private memoryTrackMap: Map<string, number> = new Map();
    private trackTimeStartMap: Map<string, number> = new Map();
    private consola: ConsolaInstance;
    private pino: pino.Logger = pino({
        level: process.env.DEBUG === 'true' || process.argv.includes('--debug')
            ? 'debug' : 'trace', // 暂时全部记录
    });
    private cacheLogs = true;
    private isLogging = false;
    private isVerbose: boolean = false;

    // 进度管理相关
    private currentSpinner: Ora | null = null;
    private progressMode: boolean = false;
    private lastProgressMessage: string = '';
    private progressStartTime: number = 0;

    // 去重控制（控制台防抖与重复抑制）
    private lastPrintType?: IConsoleType;
    private lastPrintMessage?: string;
    private lastPrintTime = 0;
    private duplicateSuppressWindowMs = 800;

    _init = false;

    constructor() {
        // 初始化 consola 实例
        this.consola = consola.create({
            level: process.env.DEBUG === 'true' || process.argv.includes('--debug') ? 4 : 3,
            formatOptions: {
                colors: true,
                compact: false,
                date: false
            }
        });

        // 检查是否启用详细模式
        this.isVerbose = process.env.DEBUG === 'true' || process.argv.includes('--debug');
    }

    public init(logDest: string, cacheLogs = false) {
        if (this._init) {
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

        this.logDest = logDest;
        this.cacheLogs = cacheLogs;

        this._init = true;
    }

    /**
     * 开始记录资源导入日志
     * */
    public record(logDest?: string) {
        if (this._start) {
            console.warn('Console is already recording logs.');
            return;
        }
        logDest && (this.logDest = logDest);
        if (!this.logDest) {
            console.error('logDest is required');
            return;
        }
        // @ts-ignore
        if (globalThis.console.switchConsole) {
            // @ts-ignore
            globalThis.console.switchConsole(this);
            return;
        }

        this.flush(); // Finish previous writes

        // Reset pino using new log destination
        const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
        this.pino = pino({
            level: process.env.DEBUG === 'true' || process.argv.includes('--debug')
                ? 'debug' : 'trace', // 暂时全部记录
            transport: !isTest ? {
                targets: [
                    {
                        target: 'pino-transport-rotating-file',
                        options: {
                            dir: this.logDest,
                            filename: 'cocos',
                            enabled: true,
                            size: '1M',
                            interval: '1d',
                            compress: true,
                            immutable: true,
                            retentionDays: 30,
                            compressionOptions: { level: 6, strategy: 0 },
                            errorLogFile: join(this.logDest, 'errors.log'),
                            timestampFormat: 'iso',
                            skipPretty: false,
                            errorFlushIntervalMs: 100, // Reduced for faster flush
                        },
                    }
                ],
            } : undefined
        });

        this._start = true;

        const EXIT_FLUSH_GUARD = Symbol.for('console.exit.flush');
        // Auto-flush on exit
        if (!(process as any)[EXIT_FLUSH_GUARD]) {
            process.on('exit', () => {
                try {
                    this.flush();
                } catch (_e) {
                    // console.error('[Console] Flush failed on exit:', e.message);
                }
            });
            (process as any)[EXIT_FLUSH_GUARD] = true;
        }

        // @ts-ignore 将处理过的继承自 console 的新对象赋给 windows
        // 保存原始 console 引用，以便其他模块可以访问原始 console 避免死循环
        (this as any).__rawConsole = rawConsole;
        // @ts-ignore
        globalThis.console = this;
        rawConsole.debug(`Start record log in {file(${this.logDest})}`);
    }

    /**
     * 停止记录
     */
    public stopRecord() {
        if (!this._start) {
            console.warn('Console is not recording logs.');
            return;
        }
        rawConsole.debug(`Stop record asset-db log. {file(${this.logDest})}`);
        // @ts-ignore 将处理过的继承自 console 的新对象赋给 windows
        globalThis.console = rawConsole;
        this._start = false;
    }

    // --------------------- 重写 console 相关方法 -------------------------

    /**
     * 将参数数组格式化为消息字符串
     * 支持 Error 对象、多个参数等
     */
    private _formatMessage(...args: any[]): string {
        if (args.length === 0) {
            return '';
        }

        return args.map(arg => {
            if (arg instanceof Error) {
                return arg.stack || arg.message || String(arg);
            }
            return String(arg);
        }).join(' ');
    }

    /**
     * 通用的日志记录方法
     * @param type 日志类型
     * @param args 日志参数
     */
    private _logMessage(type: IConsoleType, ...args: any[]): void {
        if (this.isLogging) {
            // 如果正在记录日志，直接返回，避免死循环
            return;
        }
        // 防止递归调用
        this.isLogging = true;

        try {
            const message = this._formatMessage(...args);
            this._handleProgressMessage(type, message);

            if (this._start) {
                this.save();
            }
        } catch (error) {
            // 如果日志记录过程中出错，使用原始 console 输出，避免死循环
            // 不能使用 newConsole.error，因为那会再次触发这个流程
            try {
                const rawC = (this as any).__rawConsole || (globalThis as any).console?.__rawConsole || rawConsole;
                rawC.error('[NewConsole] Error in _logMessage:', error);
            } catch {
                // 如果连原始 console 都失败了，忽略（避免无限循环）
            }
        } finally {
            // 必须在 finally 中重置标志，确保即使出错也能重置
            this.isLogging = false;
        }
    }

    public log(...args: any[]) {
        this._logMessage('log', ...args);
    }

    public info(...args: any[]) {
        this._logMessage('info', ...args);
    }

    public success(...args: any[]) {
        this._logMessage('success', ...args);
    }

    public ready(...args: any[]) {
        this._logMessage('ready', ...args);
    }

    public start(...args: any[]) {
        this._logMessage('start', ...args);
    }

    public error(...args: any[]) {
        this._logMessage('error', ...args);
    }

    public warn(...args: any[]) {
        this._logMessage('warn', ...args);
    }

    public debug(...args: any[]) {
        this._logMessage('debug', ...args);
    }

    /**
     * 处理进度消息显示
     */
    private _handleProgressMessage(type: IConsoleType, message: string) {
        // 如果是错误或警告，总是显示
        if (type === 'error') {
            this._stopProgress();
            this._printOnce(type, message);
            return;
        }

        // 在进度模式下，使用 ora 显示
        if (this.progressMode) {
            this._updateProgress(message);
        } else {
            // 非进度模式，正常显示
            this._printOnce(type, message);
        }
    }

    /**
     * 控制台输出去重与防抖
     */
    private _printOnce(type: IConsoleType, message: string) {
        const now = Date.now();
        if (this.lastPrintType === type && this.lastPrintMessage === message && (now - this.lastPrintTime) < this.duplicateSuppressWindowMs) {
            // 在时间窗口内的重复消息不再打印，避免刷屏
            return;
        }
        this.lastPrintType = type;
        this.lastPrintMessage = message;
        this.lastPrintTime = now;
        
        // 控制台输出：保留 ANSI 转义码（用于彩色显示）
        // 使用 try-catch 包裹 consola 调用，避免 consola 内部错误触发全局错误处理器导致死循环
        try {
            this.consola[type](message);
        } catch (consolaError) {
            // 如果 consola 调用失败，使用原始 console 输出，避免死循环
            try {
                const rawC = (this as any).__rawConsole || (globalThis as any).console?.__rawConsole || rawConsole;
                rawC.error('[NewConsole] Failed to log to consola:', consolaError);
            } catch {
                // 如果连原始 console 都失败了，忽略（避免无限循环）
            }
        }
        
        // 文件日志：去除 ANSI 转义码（避免日志文件中出现乱码）
        const cleanMessage = stripAnsi(message);
        this.messages.push({
            type,
            value: cleanMessage,
        });

        // 使用 try-catch 包裹 pino 调用，避免 pino 内部错误触发全局错误处理器导致死循环
        try {
            switch (type) {
                case 'debug':
                    this.pino.debug(cleanMessage);
                    break;
                case 'log':
                    this.pino.info(cleanMessage);
                    break;
                case 'warn':
                    this.pino.warn(cleanMessage);
                    break;
                case 'error':
                    this.pino.error(cleanMessage);
                    break;
                case 'info':
                    this.pino.info(cleanMessage);
                    break;
                case 'success':
                    this.pino.info(cleanMessage);
                    break;
                case 'ready':
                    this.pino.info(cleanMessage);
                    break;
                case 'start':
                    this.pino.info(cleanMessage);
                    break;
            }
        } catch (pinoError) {
            // 如果 pino 调用失败，使用原始 console 输出，避免死循环
            // 不能使用 newConsole.error，因为那会再次触发这个流程
            try {
                const rawC = (this as any).__rawConsole || (globalThis as any).console?.__rawConsole || rawConsole;
                rawC.error('[NewConsole] Failed to log to pino:', pinoError);
            } catch {
                // 如果连原始 console 都失败了，忽略（避免无限循环）
            }
        }
    }

    /**
     * 开始进度模式
     */
    public startProgress(_initialMessage: string = 'Processing...') {
        // this.progressMode = true;
        // this.lastProgressMessage = initialMessage;

        // try {
        //     this.currentSpinner = ora({
        //         text: initialMessage,
        //         spinner: 'dots',
        //         color: 'blue'
        //     }).start();
        // } catch (error) {
        //     // 如果 ora 导入失败，回退到简单的文本显示
        //     console.log(`⏳ ${initialMessage}`);
        //     console.error(error);
        // }
    }

    /**
     * 更新进度消息
     */
    private _updateProgress(message: string) {
        if (this.currentSpinner) {
            this.lastProgressMessage = message;
            this.currentSpinner.text = message;
        }
    }

    /**
     * 停止进度模式
     */
    public stopProgress(success: boolean = true, finalMessage?: string) {
        if (this.currentSpinner) {
            const message = finalMessage || this.lastProgressMessage;
            if (success) {
                this.currentSpinner.succeed(message);
            } else {
                this.currentSpinner.fail(message);
            }
            this.currentSpinner = null;
        } else {
            // 如果没有 spinner，使用简单的文本显示
            const message = finalMessage || this.lastProgressMessage;
            if (success) {
                console.log(`✅ ${message}`);
            } else {
                console.log(`❌ ${message}`);
            }
        }
        this.progressMode = false;
    }

    /**
     * 停止当前进度（不显示成功/失败状态）
     */
    private _stopProgress() {
        if (this.currentSpinner) {
            this.currentSpinner.stop();
            this.currentSpinner = null;
        }
        this.progressMode = false;
    }

    private async save() {
        if (!this._start || !this.messages.length) {
            return;
        }
        if (!this.cacheLogs) {
            this.messages.shift(); // pop first message
        }
    }

    trackMemoryStart(name: string) {
        const heapUsed = process.memoryUsage().heapUsed;
        this.memoryTrackMap.set(name, heapUsed);
        return heapUsed;
    }

    trackMemoryEnd(name: string, _output = true) {
        // TODO test
        // const start = this.memoryTrackMap.get(name);
        // if (!start) {
        //     return 0;
        // }
        // const heapUsed = process.memoryUsage().heapUsed;
        // this.memoryTrackMap.delete(name);
        // const res = heapUsed - start;
        // if (output) {
        //     // 数值过小时不输出，没有统计意义
        //     res > 1024 * 1024 && console.debug(`[Assets Memory track]: ${name} start:${formateBytes(start)}, end ${formateBytes(heapUsed)}, increase: ${formateBytes(res)}`);
        //     return output;
        // }
        // return res;
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
        const label = typeof options.label === 'string' ? i18n.transI18nName(options.label) : message;
        this.debug(label + ` (${durTime}ms)`);
        this.trackTimeStartMap.delete(message);
        return durTime;
    }

    // --------------------- 构建相关便捷方法 -------------------------

    /**
     * 显示构建开始信息
     */
    public buildStart(platform: string) {
        this.start(`🚀 Starting build for ${platform}`);
        this.info(`📋 Detailed logs will be saved to log file`);
        this.startProgress(`Building ${platform}...`);
    }

    /**
     * 显示构建完成信息
     */
    public buildComplete(platform: string, duration: string, success: boolean = true) {
        this.stopProgress(success);
        if (success) {
            this.success(`✅ Build completed successfully for ${platform} in ${duration}`);
        } else {
            this.error(`❌ Build failed for ${platform} after ${duration}`);
        }
    }

    /**
     * 显示插件任务信息
     */
    public pluginTask(pkgName: string, funcName: string, status: 'start' | 'complete' | 'error', duration?: string) {
        const pluginInfo = `${pkgName}:${funcName}`;
        switch (status) {
            case 'start':
                this.info(`🔧 ${pluginInfo} starting...`);
                break;
            case 'complete':
                this.success(`✅ ${pluginInfo} completed${duration ? ` in ${duration}` : ''}`);
                break;
            case 'error':
                this.error(`❌ ${pluginInfo} failed`);
                break;
        }
    }

    /**
     * 显示进度信息（在进度模式下更新，否则正常显示）
     */
    public progress(message: string, current: number, total: number) {
        const percentage = Math.round((current / total) * 100);
        const progressBar = this.createProgressBar(percentage);
        const progressMessage = `${progressBar} ${percentage}% - ${message}`;

        if (this.progressMode) {
            this._updateProgress(progressMessage);
        } else {
            this.info(progressMessage);
        }
    }

    /**
     * 创建进度条
     */
    private createProgressBar(percentage: number, width: number = 20): string {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return `[${bar}]`;
    }

    /**
     * 显示阶段信息
     */
    public stage(stage: string, message?: string) {
        const stageText = `[${stage}]`;
        if (message) {
            this.info(`${stageText} ${message}`);
        } else {
            this.info(stageText);
        }
    }

    /**
     * 显示任务开始（带进度）
     */
    public taskStart(taskName: string, description?: string) {
        const message = description ? `${taskName}: ${description}` : taskName;
        this.start(`🚀 ${message}`);
        this.startProgress(message);
    }

    /**
     * 显示任务完成
     */
    public taskComplete(taskName: string, success: boolean = true, duration?: string) {
        const message = duration ? `${taskName} completed in ${duration}` : `${taskName} completed`;
        this.stopProgress(success, message);
        if (success) {
            this.success(`✅ ${message}`);
        } else {
            this.error(`❌ ${taskName} failed`);
        }
    }

    public flush() {
        try {
            this.pino?.flush?.();
        } catch (_e) {
            // ignore
        }
    }

    // --------------------- Common Level -------------------------
    /**
     * 获取最近的日志信息
     */
    public queryLogs(count: number, type?: IConsoleType): string[] {
        const messages: string[] = [];
        for (let i = this.messages.length - 1; i >= 0 && count > 0; --i) {
            const msg = this.messages[i];
            if (!type || msg.type === type) {
                if (type) {
                    messages.push(`${translate(msg.value)}`);
                } else {
                    messages.push(`[${msg.type.toUpperCase()}] ${translate(msg.value)}`);
                }
                --count;
            }
        }
        messages.reverse();
        return messages;
    }
    /**
     * 清除所有日志信息
     */
    public clearLogs(): void {
        this.messages.length = 0;
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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            // noop
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
