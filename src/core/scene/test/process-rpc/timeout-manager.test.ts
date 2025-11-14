import { TimeoutManager } from '../../process-rpc/timeout-manager';
import { CallbackManager } from '../../process-rpc/callback-manager';

/**
 * TimeoutManager 单元测试
 * 测试超时管理器的核心功能
 */

describe('TimeoutManager', () => {
    let callbackManager: CallbackManager;
    let timeoutManager: TimeoutManager;

    beforeEach(() => {
        callbackManager = new CallbackManager(100);
        timeoutManager = new TimeoutManager(5000, callbackManager);
    });

    afterEach(() => {
        // 清理所有定时器
        callbackManager.clear('cleanup');
    });

    describe('超时错误生成', () => {
        test('应该生成正确的超时错误消息', () => {
            const error = TimeoutManager.getTimeoutError('testModule', 'testMethod');
            
            expect(error).toContain('RPC request timeout');
            expect(error).toContain('testModule');
            expect(error).toContain('testMethod');
        });

        test('不同模块和方法应生成不同的错误消息', () => {
            const error1 = TimeoutManager.getTimeoutError('module1', 'method1');
            const error2 = TimeoutManager.getTimeoutError('module2', 'method2');
            
            expect(error1).not.toBe(error2);
            expect(error1).toContain('module1.method1');
            expect(error2).toContain('module2.method2');
        });
    });

    describe('超时值标准化', () => {
        test('undefined 应使用默认超时', () => {
            const normalized = timeoutManager.normalizeTimeout(undefined);
            expect(normalized).toBe(5000);
        });

        test('正数应保持不变', () => {
            expect(timeoutManager.normalizeTimeout(1000)).toBe(1000);
            expect(timeoutManager.normalizeTimeout(10000)).toBe(10000);
        });

        test('0 应保持为 0', () => {
            expect(timeoutManager.normalizeTimeout(0)).toBe(0);
        });

        test('负数应转换为 0', () => {
            expect(timeoutManager.normalizeTimeout(-100)).toBe(0);
            expect(timeoutManager.normalizeTimeout(-1)).toBe(0);
        });

        test('不同的默认超时应正确应用', () => {
            const manager1 = new TimeoutManager(3000, callbackManager);
            const manager2 = new TimeoutManager(10000, callbackManager);
            
            expect(manager1.normalizeTimeout(undefined)).toBe(3000);
            expect(manager2.normalizeTimeout(undefined)).toBe(10000);
        });
    });

    describe('创建超时定时器', () => {
        test('应该创建定时器', () => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            const timer = timeoutManager.createTimer(1, 'test', 'method', 1000);
            
            expect(timer).toBeDefined();
            expect(typeof timer).toBe('object');
            
            if (timer) clearTimeout(timer);
        });

        test('超时时间为 0 应返回 undefined', () => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            const timer = timeoutManager.createTimer(1, 'test', 'method', 0);
            
            expect(timer).toBeUndefined();
        });

        test('超时时间为负数应返回 undefined', () => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            const timer = timeoutManager.createTimer(1, 'test', 'method', -100);
            
            expect(timer).toBeUndefined();
        });

        test('超时后应执行回调', (done) => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            timeoutManager.createTimer(1, 'test', 'method', 50);
            
            setTimeout(() => {
                expect(cb).toHaveBeenCalled();
                const response = cb.mock.calls[0][0];
                expect(response.error).toContain('timeout');
                done();
            }, 100);
        });

        test('超时后应从 CallbackManager 删除回调', (done) => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            timeoutManager.createTimer(1, 'test', 'method', 50);
            
            setTimeout(() => {
                expect(callbackManager.has(1)).toBe(false);
                done();
            }, 100);
        });
    });

    describe('设置超时定时器', () => {
        test('应该为已存在的回调设置定时器', () => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            timeoutManager.setupTimer(1, 'test', 'method', 1000);
            
            const entry = callbackManager.get(1);
            expect(entry?.timer).toBeDefined();
            
            if (entry?.timer) clearTimeout(entry.timer);
        });

        test('应该替换已存在的定时器', () => {
            const cb = jest.fn();
            const timer1 = setTimeout(() => {}, 1000);
            callbackManager.register(1, cb, timer1);
            
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            timeoutManager.setupTimer(1, 'test', 'method', 2000);
            
            expect(clearTimeoutSpy).toHaveBeenCalledWith(timer1);
            
            const entry = callbackManager.get(1);
            expect(entry?.timer).not.toBe(timer1);
            
            if (entry?.timer) clearTimeout(entry.timer);
            clearTimeoutSpy.mockRestore();
        });

        test('回调不存在时应该安全', () => {
            expect(() => {
                timeoutManager.setupTimer(999, 'test', 'method', 1000);
            }).not.toThrow();
        });

        test('超时后应执行回调', (done) => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            timeoutManager.setupTimer(1, 'test', 'method', 50);
            
            setTimeout(() => {
                expect(cb).toHaveBeenCalled();
                done();
            }, 100);
        });
    });

    describe('剩余时间计算', () => {
        test('应该正确计算剩余时间', () => {
            const startTime = Date.now() - 300; // 300ms 前
            const duration = 1000;
            
            const remaining = timeoutManager.calculateRemaining(startTime, duration);
            
            // 应该剩余约 700ms（允许一些误差）
            expect(remaining).toBeGreaterThan(650);
            expect(remaining).toBeLessThan(750);
        });

        test('已经超时应返回 0', () => {
            const startTime = Date.now() - 2000; // 2秒前
            const duration = 1000;
            
            const remaining = timeoutManager.calculateRemaining(startTime, duration);
            
            expect(remaining).toBe(0);
        });

        test('刚开始应返回完整时长', () => {
            const startTime = Date.now();
            const duration = 1000;
            
            const remaining = timeoutManager.calculateRemaining(startTime, duration);
            
            // 应该接近 1000ms
            expect(remaining).toBeGreaterThan(950);
            expect(remaining).toBeLessThanOrEqual(1000);
        });

        test('即将超时应返回很小的值', () => {
            const startTime = Date.now() - 990; // 990ms 前
            const duration = 1000;
            
            const remaining = timeoutManager.calculateRemaining(startTime, duration);
            
            expect(remaining).toBeGreaterThanOrEqual(0);
            expect(remaining).toBeLessThan(50);
        });

        test('不同的时长应正确计算', () => {
            const startTime = Date.now() - 500;
            
            const remaining1 = timeoutManager.calculateRemaining(startTime, 1000);
            const remaining2 = timeoutManager.calculateRemaining(startTime, 2000);
            const remaining3 = timeoutManager.calculateRemaining(startTime, 500);
            
            expect(remaining1).toBeGreaterThan(450);
            expect(remaining1).toBeLessThan(550);
            
            expect(remaining2).toBeGreaterThan(1450);
            expect(remaining2).toBeLessThan(1550);
            
            expect(remaining3).toBe(0); // 已超时
        });
    });

    describe('集成场景', () => {
        test('创建定时器后立即清理应该安全', () => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            const timer = timeoutManager.createTimer(1, 'test', 'method', 1000);
            
            if (timer) clearTimeout(timer);
            callbackManager.delete(1);
            
            // 不应该有内存泄漏
            expect(callbackManager.has(1)).toBe(false);
        });

        test('多个并发超时应该独立工作', (done) => {
            const callbacks = [jest.fn(), jest.fn(), jest.fn()];
            
            callbacks.forEach((cb, i) => {
                callbackManager.register(i + 1, cb);
                timeoutManager.createTimer(i + 1, 'test', `method${i}`, 50 + i * 20);
            });
            
            setTimeout(() => {
                // 所有回调都应该被执行
                callbacks.forEach(cb => {
                    expect(cb).toHaveBeenCalled();
                });
                done();
            }, 200);
        });

        test('超时前删除回调应取消超时', (done) => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            timeoutManager.createTimer(1, 'test', 'method', 100);
            
            // 立即删除回调
            callbackManager.delete(1);
            
            setTimeout(() => {
                // 回调不应该被执行
                expect(cb).not.toHaveBeenCalled();
                done();
            }, 150);
        });

        test('setupTimer 应该正确更新超时时间', (done) => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            // 先设置一个长超时
            timeoutManager.setupTimer(1, 'test', 'method', 10000);
            
            // 立即更新为短超时
            timeoutManager.setupTimer(1, 'test', 'method', 50);
            
            setTimeout(() => {
                // 应该在短超时后触发
                expect(cb).toHaveBeenCalled();
                done();
            }, 100);
        });
    });

    describe('边界情况', () => {
        test('极大的超时值应该正常工作', () => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            const timer = timeoutManager.createTimer(1, 'test', 'method', Number.MAX_SAFE_INTEGER);
            
            expect(timer).toBeDefined();
            
            if (timer) clearTimeout(timer);
        });

        test('calculateRemaining 的开始时间在未来应返回完整时长', () => {
            const startTime = Date.now() + 1000; // 未来 1 秒
            const duration = 2000;
            
            const remaining = timeoutManager.calculateRemaining(startTime, duration);
            
            // 应该返回完整时长加上额外的时间
            expect(remaining).toBeGreaterThan(2000);
        });

        test('多次调用 setupTimer 应该正确清理旧定时器', () => {
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            // 多次设置定时器
            timeoutManager.setupTimer(1, 'test', 'method', 1000);
            const callsAfterFirst = clearTimeoutSpy.mock.calls.length;
            
            timeoutManager.setupTimer(1, 'test', 'method', 2000);
            const callsAfterSecond = clearTimeoutSpy.mock.calls.length;
            
            timeoutManager.setupTimer(1, 'test', 'method', 3000);
            const callsAfterThird = clearTimeoutSpy.mock.calls.length;
            
            // 每次 setupTimer 都应该清理旧的定时器
            expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
            expect(callsAfterThird).toBeGreaterThan(callsAfterSecond);
            
            const entry = callbackManager.get(1);
            if (entry?.timer) clearTimeout(entry.timer);
            
            clearTimeoutSpy.mockRestore();
        });

        test('不同的 TimeoutManager 实例应该独立工作', (done) => {
            const manager1 = new TimeoutManager(100, callbackManager);
            const manager2 = new TimeoutManager(200, callbackManager);
            
            const cb1 = jest.fn();
            const cb2 = jest.fn();
            
            callbackManager.register(1, cb1);
            callbackManager.register(2, cb2);
            
            manager1.createTimer(1, 'test', 'method1', 50);
            manager2.createTimer(2, 'test', 'method2', 100);
            
            setTimeout(() => {
                expect(cb1).toHaveBeenCalled();
                expect(cb2).toHaveBeenCalled();
                done();
            }, 150);
        });
    });
});

