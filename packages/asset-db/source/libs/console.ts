
export const enum LogLevel {
    NONE = 0,
    Error,
    WARN,
    LOG,
    DEBUG,
}

export class CustomConsole {
    constructor(level?: LogLevel) {
        level = level || LogLevel.DEBUG;
        // 默认直接转发，避免性能消耗
        this.debug = console.debug.bind(console);
        this.log = console.log.bind(console);
        this.warn = console.warn.bind(console);
        this.error = console.error.bind(console);

        // 根据 level 配置，在初始化 console 时就确认好不同方法的实现减少后续不必要的判断
        if (level < LogLevel.DEBUG) {
            this.debug = () => { };
        }
        if (level < LogLevel.LOG) {
            this.log = () => { };
        }
        if (level < LogLevel.WARN) {
            this.warn = () => { };
        }
        if (level < LogLevel.Error) {
            this.error = () => { };
        }
    }

    // 仅作为接口定义
    debug: (...args: any[]) => void;
    log: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
}