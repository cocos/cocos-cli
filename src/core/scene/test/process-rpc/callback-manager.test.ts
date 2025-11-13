import { CallbackManager } from '../../process-rpc/callback-manager';
import { RpcResponse } from '../../process-rpc/types';

/**
 * CallbackManager 单元测试
 * 测试回调管理器的核心功能
 */

describe('CallbackManager', () => {
    let manager: CallbackManager;

    beforeEach(() => {
        manager = new CallbackManager(100);
    });

    describe('基本功能', () => {
        test('应该能注册回调', () => {
            const cb = jest.fn();
            manager.register(1, cb);
            
            expect(manager.has(1)).toBe(true);
            expect(manager.size).toBe(1);
        });

        test('应该能获取已注册的回调', () => {
            const cb = jest.fn();
            const timer = setTimeout(() => {}, 1000);
            
            manager.register(1, cb, timer);
            
            const entry = manager.get(1);
            expect(entry).toBeDefined();
            expect(entry?.cb).toBe(cb);
            expect(entry?.timer).toBe(timer);
            
            clearTimeout(timer);
        });

        test('应该能删除回调', () => {
            const cb = jest.fn();
            manager.register(1, cb);
            
            const deleted = manager.delete(1);
            
            expect(deleted).toBe(true);
            expect(manager.has(1)).toBe(false);
            expect(manager.size).toBe(0);
        });

        test('删除不存在的回调应返回 false', () => {
            const deleted = manager.delete(999);
            expect(deleted).toBe(false);
        });

        test('should check if ID exists', () => {
            const cb = jest.fn();
            manager.register(1, cb);
            
            expect(manager.has(1)).toBe(true);
            expect(manager.has(2)).toBe(false);
        });
    });

    describe('回调执行', () => {
        test('应该能执行并删除回调', () => {
            const cb = jest.fn();
            manager.register(1, cb);
            
            const response: RpcResponse = {
                id: 1,
                type: 'response',
                result: 'test-result'
            };
            
            const executed = manager.executeAndDelete(1, response);
            
            expect(executed).toBe(true);
            expect(cb).toHaveBeenCalledWith(response);
            expect(cb).toHaveBeenCalledTimes(1);
            expect(manager.has(1)).toBe(false);
        });

        test('执行不存在的回调应返回 false', () => {
            const response: RpcResponse = {
                id: 999,
                type: 'response',
                result: 'test'
            };
            
            const executed = manager.executeAndDelete(999, response);
            expect(executed).toBe(false);
        });

        test('执行回调时应清理定时器', () => {
            const cb = jest.fn();
            const timer = setTimeout(() => {}, 10000);
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            manager.register(1, cb, timer);
            
            manager.executeAndDelete(1, {
                id: 1,
                type: 'response',
                result: 'test'
            });
            
            expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
            clearTimeoutSpy.mockRestore();
        });

        test('回调抛出错误不应影响执行流程', () => {
            const cb = jest.fn().mockImplementation(() => {
                throw new Error('Callback error');
            });
            
            manager.register(1, cb);
            
            // 不应该抛出错误
            expect(() => {
                manager.executeAndDelete(1, {
                    id: 1,
                    type: 'response',
                    result: 'test'
                });
            }).not.toThrow();
            
            expect(cb).toHaveBeenCalled();
            expect(manager.has(1)).toBe(false);
        });
    });

    describe('定时器管理', () => {
        test('应该能更新回调的定时器', () => {
            const cb = jest.fn();
            const timer1 = setTimeout(() => {}, 1000);
            const timer2 = setTimeout(() => {}, 2000);
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            manager.register(1, cb, timer1);
            manager.updateTimer(1, timer2);
            
            const entry = manager.get(1);
            expect(entry?.timer).toBe(timer2);
            expect(clearTimeoutSpy).toHaveBeenCalledWith(timer1);
            
            clearTimeout(timer2);
            clearTimeoutSpy.mockRestore();
        });

        test('更新不存在的回调的定时器应该安全', () => {
            expect(() => {
                manager.updateTimer(999, setTimeout(() => {}, 1000));
            }).not.toThrow();
        });

        test('更新定时器为 undefined 应清理旧定时器', () => {
            const cb = jest.fn();
            const timer = setTimeout(() => {}, 1000);
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            manager.register(1, cb, timer);
            manager.updateTimer(1, undefined);
            
            expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
            
            const entry = manager.get(1);
            expect(entry?.timer).toBeUndefined();
            
            clearTimeoutSpy.mockRestore();
        });
    });

    describe('批量清理', () => {
        test('应该能清理所有回调', () => {
            const callbacks = [jest.fn(), jest.fn(), jest.fn()];
            
            callbacks.forEach((cb, i) => {
                manager.register(i + 1, cb);
            });
            
            expect(manager.size).toBe(3);
            
            manager.clear('Test cleanup');
            
            expect(manager.size).toBe(0);
            callbacks.forEach(cb => {
                expect(cb).toHaveBeenCalledWith({
                    id: expect.any(Number),
                    type: 'response',
                    error: 'Test cleanup'
                });
            });
        });

        test('清理时应清理所有定时器', () => {
            const timers = [
                setTimeout(() => {}, 1000),
                setTimeout(() => {}, 2000),
                setTimeout(() => {}, 3000)
            ];
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            timers.forEach((timer, i) => {
                manager.register(i + 1, jest.fn(), timer);
            });
            
            manager.clear('Cleanup');
            
            timers.forEach(timer => {
                expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
            });
            
            clearTimeoutSpy.mockRestore();
        });

        test('清理空管理器应该安全', () => {
            expect(() => {
                manager.clear('Empty cleanup');
            }).not.toThrow();
            
            expect(manager.size).toBe(0);
        });

        test('清理时回调抛出错误不应影响其他回调', () => {
            const cb1 = jest.fn().mockImplementation(() => {
                throw new Error('Error 1');
            });
            const cb2 = jest.fn();
            const cb3 = jest.fn().mockImplementation(() => {
                throw new Error('Error 3');
            });
            
            manager.register(1, cb1);
            manager.register(2, cb2);
            manager.register(3, cb3);
            
            expect(() => {
                manager.clear('Cleanup with errors');
            }).not.toThrow();
            
            expect(cb1).toHaveBeenCalled();
            expect(cb2).toHaveBeenCalled();
            expect(cb3).toHaveBeenCalled();
            expect(manager.size).toBe(0);
        });

        test('大量回调应同步清理', () => {
            const manager = new CallbackManager(200);
            const callbacks: jest.Mock[] = [];
            
            // 创建 150 个回调
            for (let i = 0; i < 150; i++) {
                const cb = jest.fn();
                callbacks.push(cb);
                manager.register(i + 1, cb);
            }
            
            manager.clear('Sync cleanup');
            
            // 所有回调应该立即被调用
            callbacks.forEach(cb => {
                expect(cb).toHaveBeenCalled();
            });
            expect(manager.size).toBe(0);
        });
    });

    describe('并发限制', () => {
        test('超过最大回调数应抛出错误', () => {
            const smallManager = new CallbackManager(3);
            
            smallManager.register(1, jest.fn());
            smallManager.register(2, jest.fn());
            smallManager.register(3, jest.fn());
            
            expect(() => {
                smallManager.register(4, jest.fn());
            }).toThrow(/maximum concurrent requests/i);
        });

        test('删除回调后应该能注册新回调', () => {
            const smallManager = new CallbackManager(2);
            
            smallManager.register(1, jest.fn());
            smallManager.register(2, jest.fn());
            
            smallManager.delete(1);
            
            // 现在应该能注册新回调
            expect(() => {
                smallManager.register(3, jest.fn());
            }).not.toThrow();
        });

        test('清理后应该能注册新回调', () => {
            const smallManager = new CallbackManager(2);
            
            smallManager.register(1, jest.fn());
            smallManager.register(2, jest.fn());
            
            smallManager.clear('Reset');
            
            // 现在应该能注册新回调
            expect(() => {
                smallManager.register(3, jest.fn());
                smallManager.register(4, jest.fn());
            }).not.toThrow();
        });
    });

    describe('边界情况', () => {
        test('注册相同 ID 应覆盖旧回调', () => {
            const cb1 = jest.fn();
            const cb2 = jest.fn();
            
            manager.register(1, cb1);
            manager.register(1, cb2);
            
            manager.executeAndDelete(1, {
                id: 1,
                type: 'response',
                result: 'test'
            });
            
            expect(cb1).not.toHaveBeenCalled();
            expect(cb2).toHaveBeenCalled();
        });

        test('size 应该正确反映回调数量', () => {
            expect(manager.size).toBe(0);
            
            manager.register(1, jest.fn());
            expect(manager.size).toBe(1);
            
            manager.register(2, jest.fn());
            expect(manager.size).toBe(2);
            
            manager.delete(1);
            expect(manager.size).toBe(1);
            
            manager.clear('Clear all');
            expect(manager.size).toBe(0);
        });

        test('执行后再次执行相同 ID 应返回 false', () => {
            const cb = jest.fn();
            manager.register(1, cb);
            
            const first = manager.executeAndDelete(1, {
                id: 1,
                type: 'response',
                result: 'test'
            });
            
            const second = manager.executeAndDelete(1, {
                id: 1,
                type: 'response',
                result: 'test'
            });
            
            expect(first).toBe(true);
            expect(second).toBe(false);
            expect(cb).toHaveBeenCalledTimes(1);
        });
    });
});

