import { ProcessAdapter } from '../../process-rpc/process-adapter';
import { createMockProcess } from './test-helpers';

/**
 * ProcessAdapter 单元测试
 * 测试进程适配器的核心功能
 */

describe('ProcessAdapter', () => {
    let adapter: ProcessAdapter;

    beforeEach(() => {
        adapter = new ProcessAdapter();
    });

    describe('进程挂载和分离', () => {
        test('应该能挂载进程', () => {
            const mockProcess = createMockProcess();
            
            adapter.attach(mockProcess);
            
            expect(adapter.getProcess()).toBe(mockProcess);
        });

        test('应该能分离进程', () => {
            const mockProcess = createMockProcess();
            
            adapter.attach(mockProcess);
            adapter.detach();
            
            expect(adapter.getProcess()).toBeUndefined();
        });

        test('重复挂载相同进程应该安全', () => {
            const mockProcess = createMockProcess();
            
            adapter.attach(mockProcess);
            adapter.attach(mockProcess);
            
            expect(adapter.getProcess()).toBe(mockProcess);
        });

        test('挂载新进程应该先分离旧进程', () => {
            const mockProcess1 = createMockProcess();
            const mockProcess2 = createMockProcess();
            
            adapter.attach(mockProcess1);
            adapter.attach(mockProcess2);
            
            expect(adapter.getProcess()).toBe(mockProcess2);
        });

        test('分离未挂载的适配器应该安全', () => {
            expect(() => {
                adapter.detach();
            }).not.toThrow();
        });

        test('多次分离应该安全', () => {
            const mockProcess = createMockProcess();
            
            adapter.attach(mockProcess);
            adapter.detach();
            adapter.detach();
            adapter.detach();
            
            expect(adapter.getProcess()).toBeUndefined();
        });
    });

    describe('连接状态检查', () => {
        test('未挂载进程时应返回 false', () => {
            expect(adapter.isConnected()).toBe(false);
        });

        test('挂载的 ChildProcess 已连接时应返回 true', () => {
            const mockProcess = createMockProcess({ connected: true });
            
            adapter.attach(mockProcess);
            
            expect(adapter.isConnected()).toBe(true);
        });

        test('挂载的 ChildProcess 未连接时应返回 false', () => {
            const mockProcess = createMockProcess({ connected: false });
            
            adapter.attach(mockProcess);
            
            expect(adapter.isConnected()).toBe(false);
        });

        test('挂载的 NodeJS.Process 应返回 true', () => {
            const mockProcess = {
                send: jest.fn(),
                on: jest.fn(),
                off: jest.fn()
                // 没有 connected 属性，模拟 NodeJS.Process
            };
            
            adapter.attach(mockProcess as any);
            
            expect(adapter.isConnected()).toBe(true);
        });

        test('分离后应返回 false', () => {
            const mockProcess = createMockProcess({ connected: true });
            
            adapter.attach(mockProcess);
            adapter.detach();
            
            expect(adapter.isConnected()).toBe(false);
        });
    });

    describe('消息发送', () => {
        test('应该能发送消息', () => {
            const mockProcess = createMockProcess({ sendReturnValue: true });
            
            adapter.attach(mockProcess);
            
            const message = {
                type: 'request' as const,
                id: 1,
                module: 'test',
                method: 'test',
                args: []
            };
            
            const result = adapter.send(message);
            
            expect(result).toBe(true);
            expect(mockProcess.send).toHaveBeenCalledWith(message);
        });

        test('send() 返回 true 应视为成功', () => {
            const mockProcess = createMockProcess({ sendReturnValue: true });
            adapter.attach(mockProcess);
            
            const result = adapter.send({ type: 'send', module: 'test', method: 'test', args: [] });
            expect(result).toBe(true);
        });

        test('send() 返回 false 应视为失败', () => {
            const mockProcess = createMockProcess({ sendReturnValue: false });
            adapter.attach(mockProcess);
            
            const result = adapter.send({ type: 'send', module: 'test', method: 'test', args: [] });
            expect(result).toBe(false);
        });

        test('send() 返回 undefined 应视为失败', () => {
            const mockProcess = createMockProcess({
                sendImplementation: () => undefined
            });
            adapter.attach(mockProcess);
            
            const result = adapter.send({ type: 'send', module: 'test', method: 'test', args: [] });
            expect(result).toBe(false);
        });

        test('send() 抛出异常应返回 false', () => {
            const mockProcess = createMockProcess({
                sendImplementation: () => {
                    throw new Error('Send failed');
                }
            });
            adapter.attach(mockProcess);
            
            const result = adapter.send({ type: 'send', module: 'test', method: 'test', args: [] });
            expect(result).toBe(false);
        });

        test('未挂载进程时发送应返回 false', () => {
            const result = adapter.send({ type: 'send', module: 'test', method: 'test', args: [] });
            expect(result).toBe(false);
        });

        test('进程没有 send 方法时应返回 false', () => {
            const mockProcess = {
                on: jest.fn(),
                off: jest.fn()
                // 没有 send 方法
            };
            
            adapter.attach(mockProcess as any);
            
            const result = adapter.send({ type: 'send', module: 'test', method: 'test', args: [] });
            expect(result).toBe(false);
        });
    });

    describe('事件监听', () => {
        test('应该能监听消息事件', () => {
            const mockProcess = createMockProcess();
            const handler = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.on('message', handler);
            
            expect(mockProcess.on).toHaveBeenCalledWith('message', handler);
        });

        test('应该能移除消息监听', () => {
            const mockProcess = createMockProcess();
            const handler = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.on('message', handler);
            adapter.off('message', handler);
            
            expect(mockProcess.off).toHaveBeenCalledWith('message', handler);
        });

        test('未挂载进程时监听应该安全', () => {
            const handler = jest.fn();
            
            expect(() => {
                adapter.on('message', handler);
            }).not.toThrow();
        });

        test('未挂载进程时移除监听应该安全', () => {
            const handler = jest.fn();
            
            expect(() => {
                adapter.off('message', handler);
            }).not.toThrow();
        });

        test('分离进程时应清理所有监听器', () => {
            const mockProcess = createMockProcess();
            const handler1 = jest.fn();
            const handler2 = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.on('message', handler1);
            adapter.on('data', handler2);
            
            adapter.detach();
            
            expect(mockProcess.off).toHaveBeenCalledWith('message', handler1);
            expect(mockProcess.off).toHaveBeenCalledWith('data', handler2);
        });

        test('移除监听时进程抛出错误应该安全', () => {
            const mockProcess = createMockProcess();
            mockProcess.off = jest.fn().mockImplementation(() => {
                throw new Error('off failed');
            });
            
            const handler = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.on('message', handler);
            
            expect(() => {
                adapter.off('message', handler);
            }).not.toThrow();
        });
    });

    describe('连接监听器', () => {
        test('进程已连接时应立即调用 onConnect', () => {
            const mockProcess = createMockProcess({ connected: true });
            const onConnect = jest.fn();
            const onDisconnect = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.setupConnectionListeners(onConnect, onDisconnect);
            
            expect(onConnect).toHaveBeenCalled();
        });

        test('进程未连接时应等待 connect 事件', () => {
            const mockProcess = createMockProcess({ connected: false });
            const onConnect = jest.fn();
            const onDisconnect = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.setupConnectionListeners(onConnect, onDisconnect);
            
            expect(onConnect).not.toHaveBeenCalled();
            expect(mockProcess.once).toHaveBeenCalledWith('connect', expect.any(Function));
        });

        test('应该监听 disconnect 事件', () => {
            const mockProcess = createMockProcess({ connected: true });
            const onConnect = jest.fn();
            const onDisconnect = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.setupConnectionListeners(onConnect, onDisconnect);
            
            expect(mockProcess.once).toHaveBeenCalledWith('disconnect', expect.any(Function));
        });

        test('应该监听 exit 事件', () => {
            const mockProcess = createMockProcess({ connected: true });
            const onConnect = jest.fn();
            const onDisconnect = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.setupConnectionListeners(onConnect, onDisconnect);
            
            expect(mockProcess.once).toHaveBeenCalledWith('exit', expect.any(Function));
        });

        test('NodeJS.Process 不应设置连接监听器', () => {
            const mockProcess = {
                send: jest.fn(),
                on: jest.fn(),
                off: jest.fn(),
                once: jest.fn()
                // 没有 connected 属性
            };
            
            const onConnect = jest.fn();
            const onDisconnect = jest.fn();
            
            adapter.attach(mockProcess as any);
            adapter.setupConnectionListeners(onConnect, onDisconnect);
            
            // NodeJS.Process 不应该设置这些监听器
            expect(mockProcess.once).not.toHaveBeenCalled();
        });

        test('未挂载进程时设置监听器应该安全', () => {
            const onConnect = jest.fn();
            const onDisconnect = jest.fn();
            
            expect(() => {
                adapter.setupConnectionListeners(onConnect, onDisconnect);
            }).not.toThrow();
        });
    });

    describe('资源清理', () => {
        test('分离时应清理连接监听器', () => {
            const mockProcess = createMockProcess({ connected: true });
            const onConnect = jest.fn();
            const onDisconnect = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.setupConnectionListeners(onConnect, onDisconnect);
            
            adapter.detach();
            
            // 应该尝试移除监听器
            expect(mockProcess.off).toHaveBeenCalled();
        });

        test('清理监听器时出错应该安全', () => {
            const mockProcess = createMockProcess({ connected: true });
            mockProcess.off = jest.fn().mockImplementation(() => {
                throw new Error('off failed');
            });
            
            const onConnect = jest.fn();
            const onDisconnect = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.setupConnectionListeners(onConnect, onDisconnect);
            
            expect(() => {
                adapter.detach();
            }).not.toThrow();
        });

        test('挂载新进程时应清理旧进程的监听器', () => {
            const mockProcess1 = createMockProcess();
            const mockProcess2 = createMockProcess();
            const handler = jest.fn();
            
            adapter.attach(mockProcess1);
            adapter.on('message', handler);
            
            adapter.attach(mockProcess2);
            
            expect(mockProcess1.off).toHaveBeenCalledWith('message', handler);
        });
    });

    describe('边界情况', () => {
        test('同一个监听器多次注册应该被记录', () => {
            const mockProcess = createMockProcess();
            const handler = jest.fn();
            
            adapter.attach(mockProcess);
            adapter.on('message', handler);
            adapter.on('message', handler);
            
            expect(mockProcess.on).toHaveBeenCalledTimes(2);
        });

        test('移除未注册的监听器应该安全', () => {
            const mockProcess = createMockProcess();
            const handler = jest.fn();
            
            adapter.attach(mockProcess);
            
            expect(() => {
                adapter.off('message', handler);
            }).not.toThrow();
        });

        test('getProcess 应该返回当前进程', () => {
            expect(adapter.getProcess()).toBeUndefined();
            
            const mockProcess = createMockProcess();
            adapter.attach(mockProcess);
            
            expect(adapter.getProcess()).toBe(mockProcess);
            
            adapter.detach();
            
            expect(adapter.getProcess()).toBeUndefined();
        });

        test('快速多次 attach/detach 应该稳定', () => {
            for (let i = 0; i < 10; i++) {
                const mockProcess = createMockProcess();
                adapter.attach(mockProcess);
                adapter.detach();
            }
            
            expect(adapter.getProcess()).toBeUndefined();
        });
    });
});

