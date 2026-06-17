import { TimerUtil } from '../../scene-process/service/utils/timer-util';

describe('TimerUtil.callFunctionLimit', () => {
    let timer: TimerUtil;

    beforeEach(() => {
        jest.useFakeTimers();
        timer = new TimerUtil();
    });

    afterEach(() => {
        timer.clear();
        jest.useRealTimers();
    });

    it('首次调用应立即执行', () => {
        const fn = jest.fn();
        timer.callFunctionLimit('key-1', fn, 'a');

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('a');
    });

    it('200ms 内同 key 的第二次调用不应立即执行', () => {
        const fn = jest.fn();
        timer.callFunctionLimit('key-1', fn, 'a');
        timer.callFunctionLimit('key-1', fn, 'b');

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('a');
    });

    it('200ms 后应执行最后一次挂起的调用', () => {
        const fn = jest.fn();
        timer.callFunctionLimit('key-1', fn, 'a');
        timer.callFunctionLimit('key-1', fn, 'b');
        timer.callFunctionLimit('key-1', fn, 'c');

        jest.advanceTimersByTime(200);

        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenNthCalledWith(1, 'a');
        expect(fn).toHaveBeenNthCalledWith(2, 'c');
    });

    it('不同 key 的调用应各自独立执行', () => {
        const fn = jest.fn();
        timer.callFunctionLimit('key-1', fn, 'a');
        timer.callFunctionLimit('key-2', fn, 'b');

        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenNthCalledWith(1, 'a');
        expect(fn).toHaveBeenNthCalledWith(2, 'b');
    });

    it('模拟 node:change 重复场景：同节点 200ms 内 2 次调用，只执行首次 + 末次', () => {
        const handler = jest.fn();
        const nodeUuid = 'node-uuid-123';

        timer.callFunctionLimit(nodeUuid, handler, 'transform-changed');
        timer.callFunctionLimit(nodeUuid, handler, 'set-property');

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('transform-changed');

        jest.advanceTimersByTime(200);

        expect(handler).toHaveBeenCalledTimes(2);
        expect(handler).toHaveBeenNthCalledWith(2, 'set-property');
    });

    it('冷却结束后再次调用应立即执行', () => {
        const fn = jest.fn();
        timer.callFunctionLimit('key-1', fn, 'a');

        jest.advanceTimersByTime(200);

        timer.callFunctionLimit('key-1', fn, 'b');

        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenNthCalledWith(2, 'b');
    });

    it('clear 应取消所有挂起的延迟调用', () => {
        const fn = jest.fn();
        timer.callFunctionLimit('key-1', fn, 'a');
        timer.callFunctionLimit('key-1', fn, 'b');

        timer.clear();
        jest.advanceTimersByTime(200);

        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('自定义 timeInterval 应生效', () => {
        const customTimer = new TimerUtil(500);
        const fn = jest.fn();

        customTimer.callFunctionLimit('key-1', fn, 'a');
        customTimer.callFunctionLimit('key-1', fn, 'b');

        jest.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(300);
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenNthCalledWith(2, 'b');

        customTimer.clear();
    });

    it('多个 key 混合调用场景', () => {
        const fn1 = jest.fn();
        const fn2 = jest.fn();

        timer.callFunctionLimit('node-A', fn1, 'A-first');
        timer.callFunctionLimit('node-B', fn2, 'B-first');
        timer.callFunctionLimit('node-A', fn1, 'A-second');
        timer.callFunctionLimit('node-B', fn2, 'B-second');

        expect(fn1).toHaveBeenCalledTimes(1);
        expect(fn2).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(200);

        expect(fn1).toHaveBeenCalledTimes(2);
        expect(fn2).toHaveBeenCalledTimes(2);
        expect(fn1).toHaveBeenNthCalledWith(2, 'A-second');
        expect(fn2).toHaveBeenNthCalledWith(2, 'B-second');
    });

    it('无重复调用时不应有延迟触发', () => {
        const fn = jest.fn();
        timer.callFunctionLimit('key-1', fn, 'only');

        jest.advanceTimersByTime(200);

        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('连续快速调用 3 轮，每轮间隔 200ms', () => {
        const fn = jest.fn();

        // Round 1: r1-a 立即执行，r1-b 挂起
        timer.callFunctionLimit('key-1', fn, 'r1-a');
        timer.callFunctionLimit('key-1', fn, 'r1-b');
        // timer fires → r1-b 执行（递归 callFunctionLimit，启动新 timer）
        jest.advanceTimersByTime(200);

        // Round 2: 此时新 timer 仍在运行，r2-a 和 r2-b 都被挂起（r2-b 覆盖 r2-a）
        timer.callFunctionLimit('key-1', fn, 'r2-a');
        timer.callFunctionLimit('key-1', fn, 'r2-b');
        // timer fires → r2-b 执行（递归 callFunctionLimit，启动新 timer）
        jest.advanceTimersByTime(200);

        // Round 3: 同理
        timer.callFunctionLimit('key-1', fn, 'r3-a');
        timer.callFunctionLimit('key-1', fn, 'r3-b');
        jest.advanceTimersByTime(200);

        // r1-a(立即) + r1-b(延迟) + r2-b(延迟) + r3-b(延迟) = 4 次
        expect(fn).toHaveBeenCalledTimes(4);
        expect(fn.mock.calls.map((c: any[]) => c[0])).toEqual([
            'r1-a', 'r1-b', 'r2-b', 'r3-b',
        ]);
    });
});
