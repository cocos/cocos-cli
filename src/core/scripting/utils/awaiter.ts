import { asserts } from './asserts';

export class Awaiter<TValue, TError = any> {
    public resolve(value: TValue) {
        asserts(this._state === State.PENDING);
        this._result = value;
        this._state = State.RESOLVED;
        for (const { resolve } of this._queue) {
            resolve(value);
        }
        this._queue.length = 0;
    }

    public reject(err?: TError) {
        asserts(this._state === State.PENDING);
        this._result = err;
        this._state = State.RESOLVED;
        for (const { reject } of this._queue) {
            reject(err);
        }
        this._queue.length = 0;
    }

    public async wait() {
        switch (this._state) {
            case State.RESOLVED:
                return (this._result as TValue);
            case State.REJECTED:
                throw (this._result as TError | undefined);
        }
        return await new Promise<TValue>((resolve, reject) => {
            this._queue.push({
                resolve,
                reject,
            });
        });
    }

    private _state = State.PENDING;

    private _result: TValue | TError | undefined | null = null;

    private _queue: Array<{
        resolve: (value: TValue) => void;
        reject: (err?: any) => void;
    }> = [];
}

enum State {
    PENDING,
    RESOLVED,
    REJECTED,
}
