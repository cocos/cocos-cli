'use strict';

const createMap = cc.js.createMap;
const fastRemoveAt = cc.js.array.fastRemoveAt;
import Pool from './pool';

type Constructor<T = {}> = new (...args: any[]) => T;

function empty() {}

class CallbackInfo {
    public callback: Function = empty;
    public target: Object | undefined = undefined;
    public once = false;
    public off: Function | undefined;

    public set(callback: Function, target?: Object, once?: boolean, off?: Function) {
        this.callback = callback;
        this.target = target;
        this.once = !!once;
        this.off = off;
    }
}

const callbackInfoPool = new Pool(() => {
    return new CallbackInfo();
}, 32);

class CallbackList {
    public callbackInfos: Array<CallbackInfo | null> = [];
    public isInvoking = false;
    public containCanceled = false;

    /**
     * @zh
     * 从列表中移除与指定目标相同回调函数的事件。
     * @param cb - 指定回调函数
     */
    public removeByCallback(cb: Function) {
        for (let i = 0; i < this.callbackInfos.length; ++i) {
            const info = this.callbackInfos[i];
            if (info && info.callback === cb) {
                callbackInfoPool.free(info);
                fastRemoveAt(this.callbackInfos, i);
                --i;
            }
        }
    }
    /**
     * @zh
     * 从列表中移除与指定目标相同调用者的事件。
     * @param target - 指定调用者
     */
    public removeByTarget(target: Object) {
        for (let i = 0; i < this.callbackInfos.length; ++i) {
            const info = this.callbackInfos[i];
            if (info && info.target === target) {
                callbackInfoPool.free(info);
                fastRemoveAt(this.callbackInfos, i);
                --i;
            }
        }
    }

    /**
     * @zh
     * 移除指定编号事件。
     *
     * @param index - 指定编号。
     */
    public cancel(index: number) {
        const info = this.callbackInfos[index];
        if (info) {
            callbackInfoPool.free(info);
            this.callbackInfos[index] = null;
        }
        this.containCanceled = true;
    }

    /**
     * @zh
     * 注销所有事件。
     */
    public cancelAll() {
        for (let i = 0; i < this.callbackInfos.length; i++) {
            const info = this.callbackInfos[i];
            if (info) {
                callbackInfoPool.free(info);
                this.callbackInfos[i] = null;
            }
        }
        this.containCanceled = true;
    }

    // filter all removed callbacks and compact array
    public purgeCanceled() {
        for (let i = this.callbackInfos.length - 1; i >= 0; --i) {
            const info = this.callbackInfos[i];
            if (!info) {
                fastRemoveAt(this.callbackInfos, i);
            }
        }
        this.containCanceled = false;
    }

    public clear() {
        this.cancelAll();
        this.callbackInfos.length = 0;
        this.isInvoking = false;
        this.containCanceled = false;
    }
}

const MAX_SIZE = 16;
const callbackListPool = new Pool<CallbackList>(() => {
    return new CallbackList();
}, MAX_SIZE);

interface ICallbackTable {
    [x: string]: CallbackList | undefined;
}

/**
 * @zh
 * CallbacksInvoker 用来根据 Key 管理事件监听器列表并调用回调方法。
 * @class CallbacksInvoker
 */
export class CallbacksInvoker {
    protected _callbackTable: ICallbackTable = createMap(true);

    /**
     * @zh
     * 事件添加管理
     * @param key - 一个监听事件类型的字符串。
     * @param callback - 事件分派时将被调用的回调函数。
     * @param target
     * @param once - 是否只调用一次。
     */
    public on(key: string, callback: Function, target?: Object, once?: boolean) {
        let list = this._callbackTable[key];
        if (!list) {
            list = this._callbackTable[key] = callbackListPool.alloc();
        }
        const info = callbackInfoPool.alloc();
        info.set(callback, target, once);
        list.callbackInfos.push(info);
    }

    /**
     * @zh
     * 检查指定事件是否已注册回调。
     *
     * @param key - 一个监听事件类型的字符串。
     * @param callback - 事件分派时将被调用的回调函数。
     * @param target - 调用回调的目标。
     * @return - 指定事件是否已注册回调。
     */
    public hasEventListener(key: string, callback?: Function, target?: Object) {
        const list = this._callbackTable[key];
        if (!list) {
            return false;
        }

        // check any valid callback
        const infos = list.callbackInfos;
        if (!callback) {
            // Make sure no cancelled callbacks
            if (list.isInvoking) {
                for (const info of infos) {
                    if (info) {
                        return true;
                    }
                }
                return false;
            } else {
                return infos.length > 0;
            }
        }

        for (let i = 0; i < infos.length; ++i) {
            const info = infos[i];
            if (info && info.callback === callback && info.target === target) {
                return true;
            }
        }
        return false;
    }

    /**
     * @zh
     * 移除在特定事件类型中注册的所有回调或在某个目标中注册的所有回调。
     *
     * @param keyOrTarget - 要删除的事件键或要删除的目标。
     */
    public removeAll(keyOrTarget: string | Object) {
        if (typeof keyOrTarget === 'string') {
            // remove by key
            const list = this._callbackTable[keyOrTarget];
            if (list) {
                if (list.isInvoking) {
                    list.cancelAll();
                } else {
                    list.clear();
                    callbackListPool.free(list);
                    delete this._callbackTable[keyOrTarget];
                }
            }
        } else if (keyOrTarget) {
            // remove by target
            for (const key in this._callbackTable) {
                const list = this._callbackTable[key]!;
                if (list.isInvoking) {
                    const infos = list.callbackInfos;
                    for (let i = 0; i < infos.length; ++i) {
                        const info = infos[i];
                        if (info && info.target === keyOrTarget) {
                            list.cancel(i);
                        }
                    }
                } else {
                    list.removeByTarget(keyOrTarget);
                }
            }
        }
    }
    public removeAllListeners() {
        Object.keys(this._callbackTable).forEach((key) => {
            this.removeAll(key);
        });
    }
    /**
     * @zh
     * 删除之前与同类型，回调，目标注册的回调。
     *
     * @param key - 一个监听事件类型的字符串。
     * @param callback - 移除指定注册回调。如果没有给，则删除全部同事件类型的监听。
     * @param target - 调用回调的目标。
     */
    public off(key: string, callback?: Function, target?: Object) {
        const list = this._callbackTable[key];
        if (list) {
            const infos = list.callbackInfos;
            if (callback) {
                for (let i = 0; i < infos.length; ++i) {
                    const info = infos[i];
                    if (info && info.callback === callback && info.target === target) {
                        if (list.isInvoking) {
                            list.cancel(i);
                        } else {
                            fastRemoveAt(infos, i);
                            callbackInfoPool.free(info);
                        }
                        break;
                    }
                }
            } else {
                this.removeAll(key);
            }
        }
    }

    /**
     * @zh
     * 事件派发
     *
     * @param key - 一个监听事件类型的字符串
     * @param args
     */
    public emit(key: string, ...args: any[]) {
        const list: CallbackList = this._callbackTable[key]!;
        if (list) {
            const rootInvoker = !list.isInvoking;
            list.isInvoking = true;

            const infos = list.callbackInfos;
            for (let i = 0, len = infos.length; i < len; ++i) {
                const info = infos[i];
                if (info) {
                    const callback = info.callback;
                    const target = info.target;
                    // Pre off once callbacks to avoid influence on logic in callback
                    if (info.once) {
                        this.off(key, callback, target);
                    }
                    if (target) {
                        callback.call(target, ...args);
                    } else {
                        callback(...args);
                    }
                }
            }

            if (rootInvoker) {
                list.isInvoking = false;
                if (list.containCanceled) {
                    list.purgeCanceled();
                }
            }
        }
    }
}
