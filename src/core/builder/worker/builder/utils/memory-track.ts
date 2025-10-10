
/**
 * 内存统计 构建内存性能测试 A022
 */
export class MemoryTrack {
    private _startMemory = 0;
    private _maxMemory = 0;
    private _interval = 0;
    private _intervalId: NodeJS.Timeout | null = null;
    // 是否开启内存统计
    static enabled = false;
    private _lastMemory = 0;

    constructor(interval = 1000) {
        this._interval = interval;
    }

    start() {
        if (!MemoryTrack.enabled) {
            return;
        }
        console.debug(`memory track start, ${getMemorySize()}`);
        this._startMemory = this.currentMemory;
        this._intervalId = setInterval(() => {
            const currentMemory = this.currentMemory;
            this._maxMemory = Math.max(this._maxMemory, currentMemory);
            const increment = currentMemory - this._lastMemory;
            if (increment < 0) {
                return;
            }
            if (increment > 1024 * 1024 * 5) {
                console.debug(`memory track increment > 1M, increment: ${formateBytes(increment)}, current: ${formateBytes(currentMemory)}, last: ${formateBytes(this._lastMemory)}`);
                this._lastMemory = currentMemory;
            }
        }, this._interval);
    }

    stop() {
        if (!MemoryTrack.enabled) {
            return;
        }
        if (this._intervalId) {
            console.debug(`memory track stop, ${getMemorySize()}`);
            clearInterval(this._intervalId);
            this.printResult();
        }
    }

    get memoryUsage() {
        return this._maxMemory - this._startMemory;
    }

    get currentMemory() {
        return process.memoryUsage().heapUsed;
    }

    // 打印内存使用情况
    printResult() {
        if (!MemoryTrack.enabled) {
            return;
        }
        console.log(`memory track usage: ${formateBytes(this.memoryUsage)}`);
    }
}

export function formateBytes(bytes: number) {
    const data = bytes / 1024 / 1024;
    if (data < 1) {
        return (bytes / 1024).toFixed(2) + 'KB';
    }
    return (data).toFixed(2) + 'MB';
}

/**
 * 获取当前内存占用
 */
export function getMemorySize() {
    const memory = process.memoryUsage();
    return 'Process: heapTotal ' + formateBytes(memory.heapTotal) + ' heapUsed ' + formateBytes(memory.heapUsed) + ' rss ' + formateBytes(memory.rss);
}