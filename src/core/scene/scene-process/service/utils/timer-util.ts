interface IWaitingData {
    needCallAfterWaiting: boolean;
    callFunc?: Function;
    args?: any[];
    waitingTimer?: NodeJS.Timeout;
}

class TimerUtil {
    private _timeInterval = 200;
    constructor(timeInterval?: number) {
        this._timeInterval = timeInterval ?? 200;
    }
    private _callWaitingMap: Map<string, IWaitingData> = new Map<string, IWaitingData>();

    /**
     * 限制一个方法在一定时间内的调用次数
     * @param key 这个方法的一个唯一标识
     * @param func 方法
     * @param args 参数
     */
    public callFunctionLimit(key: string, func: Function, ...args: any[]) {
        let waitingData = this._callWaitingMap.get(key);

        let canCallFunc = false;
        if (waitingData) {
            if (!waitingData.waitingTimer) {
                canCallFunc = true;
            } else {
                waitingData.callFunc = func;
                waitingData.args = args;
                waitingData.needCallAfterWaiting = true;
            }
        } else {
            waitingData = {
                needCallAfterWaiting: false,
            };
            this._callWaitingMap.set(key, waitingData);
            canCallFunc = true;
        }

        if (canCallFunc) {
            func(...args);
            waitingData.waitingTimer = setTimeout(() => {
                if (waitingData) {
                    waitingData.waitingTimer = undefined;
                }

                if (waitingData && waitingData.needCallAfterWaiting) {
                    waitingData.needCallAfterWaiting = false;
                    if (waitingData.callFunc) {
                        const args = waitingData.args ?? [];
                        this.callFunctionLimit(key, waitingData.callFunc, ...args);
                    }
                }
            }, this._timeInterval);

        }
    }

    public clear() {
        this._callWaitingMap.forEach((call) => {
            if (call.waitingTimer) clearTimeout(call.waitingTimer);
        });
        this._callWaitingMap.clear();
    }
}

export { TimerUtil };
