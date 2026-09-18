/**
 * 记录并管理执行过程中在 globalThis 上新增的属性，
 * 在下一次 record 时自动清理上次新增的属性。
 */
export class GlobalEnv {
    public async record(fn: () => Promise<void>) {
        this.clear();
        this._queue.push(async () => {
            const beforeKeys = Object.keys(globalThis);
            await fn();
            const afterKeys = Object.keys(globalThis);
            for (const afterKey of afterKeys) {
                if (!beforeKeys.includes(afterKey)) {
                    this._incrementalKeys.add(afterKey);
                }
            }
        });
        await this.processQueue();
    }

    private clear() {
        this._queue.push(async () => {
            for (const incrementalKey of this._incrementalKeys) {
                delete (globalThis as any)[incrementalKey];
            }
            this._incrementalKeys.clear();
        });
    }

    private async processQueue() {
        while (this._queue.length > 0) {
            const next = this._queue.shift();
            if (next) await next();
        }
    }

    private _incrementalKeys = new Set<string>();
    private _queue: (() => Promise<void>)[] = [];
}
