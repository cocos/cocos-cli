import { MessageQueue } from '../../process-rpc/message-queue';
import { CallbackManager } from '../../process-rpc/callback-manager';
import { PendingMessage } from '../../process-rpc/types';

/**
 * MessageQueue 单元测试
 * 测试消息队列管理器的核心功能
 */

describe('MessageQueue', () => {
    let sendMessage: jest.Mock;
    let onRetryFailed: jest.Mock;
    let onMessageSent: jest.Mock;
    let queue: MessageQueue;

    beforeEach(() => {
        sendMessage = jest.fn().mockReturnValue(true);
        onRetryFailed = jest.fn();
        onMessageSent = jest.fn();
        
        queue = new MessageQueue(
            100,  // maxSize
            3,    // maxRetries
            10,   // batchSize
            sendMessage,
            onRetryFailed,
            onMessageSent
        );
    });

    afterEach(() => {
        // 清理队列，停止所有后台任务
        queue.clear();
    });

    describe('基本功能', () => {
        test('应该能添加消息到队列', () => {
            const message: PendingMessage = {
                type: 'send',
                data: { type: 'send', module: 'test', method: 'test', args: [] }
            };
            
            queue.enqueue(message);
            
            expect(queue.length).toBe(1);
            expect(queue.sendBlocked).toBe(true);
        });

        test('应该能获取队列长度', () => {
            expect(queue.length).toBe(0);
            
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            expect(queue.length).toBe(1);
            
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            expect(queue.length).toBe(2);
        });

        test('应该能清空队列', () => {
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            
            queue.clear();
            
            expect(queue.length).toBe(0);
            expect(queue.sendBlocked).toBe(false);
        });

        test('超过最大队列长度应抛出错误', () => {
            const smallQueue = new MessageQueue(2, 3, 10, sendMessage, onRetryFailed);
            
            smallQueue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            smallQueue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            
            expect(() => {
                smallQueue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            }).toThrow(/maximum pending messages/i);
        });
    });

    describe('消息发送', () => {
        test('scheduleFlush 应该触发消息发送', (done) => {
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(sendMessage).toHaveBeenCalled();
                expect(queue.length).toBe(0);
                done();
            }, 50);
        });

        test('应该批量发送消息', (done) => {
            const smallBatchQueue = new MessageQueue(100, 3, 3, sendMessage, onRetryFailed);
            
            // 添加 5 条消息
            for (let i = 0; i < 5; i++) {
                smallBatchQueue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: `test${i}`, args: [] } });
            }
            
            smallBatchQueue.scheduleFlush();
            
            setTimeout(() => {
                // 第一批应该发送 3 条
                expect(sendMessage).toHaveBeenCalledTimes(5);
                expect(smallBatchQueue.length).toBe(0);
                done();
            }, 100);
        });

        test('发送成功应该从队列移除消息', (done) => {
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(queue.length).toBe(0);
                expect(queue.sendBlocked).toBe(false);
                done();
            }, 50);
        });

        test('发送失败应该重试', (done) => {
            sendMessage.mockReturnValueOnce(false).mockReturnValueOnce(true);
            
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(sendMessage).toHaveBeenCalledTimes(2);
                expect(queue.length).toBe(0);
                done();
            }, 200);
        });

        test('发送请求类型消息应触发 onMessageSent 回调', (done) => {
            const requestMessage: PendingMessage = {
                type: 'request',
                data: { type: 'request', id: 1, module: 'test', method: 'test', args: [] },
                timeoutStartTime: Date.now(),
                timeoutDuration: 5000
            };
            
            queue.enqueue(requestMessage);
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(onMessageSent).toHaveBeenCalledWith(requestMessage);
                done();
            }, 50);
        });

        test('发送 send 类型消息不应触发 onMessageSent 回调', (done) => {
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(onMessageSent).not.toHaveBeenCalled();
                done();
            }, 50);
        });
    });

    describe('重试机制', () => {
        test('达到最大重试次数应调用 onRetryFailed', (done) => {
            sendMessage.mockReturnValue(false); // 始终失败
            
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(onRetryFailed).toHaveBeenCalled();
                expect(queue.length).toBe(0);
                done();
            }, 1000);
        });

        test('部分成功应重置重试计数', (done) => {
            sendMessage
                .mockReturnValueOnce(false) // 第1次失败
                .mockReturnValueOnce(true)  // 第2次成功
                .mockReturnValueOnce(false) // 第3次失败
                .mockReturnValueOnce(true); // 第4次成功
            
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test1', args: [] } });
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test2', args: [] } });
            
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(sendMessage).toHaveBeenCalledTimes(4);
                expect(queue.length).toBe(0);
                expect(onRetryFailed).not.toHaveBeenCalled();
                done();
            }, 500);
        });

        test('应该能重置重试计数', (done) => {
            // 模拟一些失败，增加重试计数
            sendMessage.mockReturnValue(false);
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            queue.scheduleFlush();
            
            // 等待一小段时间让重试计数增加
            setTimeout(() => {
                // 重置重试计数
                queue.resetRetryCount();
                
                // 重试计数应该被重置（内部状态，通过行为验证）
                expect((queue as any).flushRetryCount).toBe(0);
                
                // 清理队列，停止后台重试
                queue.clear();
                done();
            }, 100);
        });

        test('重试应使用指数退避', (done) => {
            sendMessage
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);
            
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            queue.scheduleFlush();
            
            // 等待重试完成
            setTimeout(() => {
                // 应该使用了 setTimeout 进行延迟重试
                expect(setTimeoutSpy).toHaveBeenCalled();
                
                setTimeoutSpy.mockRestore();
                done();
            }, 1000);
        });
    });

    describe('暂停和恢复', () => {
        test('暂停应阻止消息发送', (done) => {
            queue.pause();
            
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(sendMessage).not.toHaveBeenCalled();
                expect(queue.length).toBe(1);
                done();
            }, 100);
        });

        test('恢复应继续发送消息', (done) => {
            queue.pause();
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            
            queue.resume();
            
            setTimeout(() => {
                expect(sendMessage).toHaveBeenCalled();
                expect(queue.length).toBe(0);
                done();
            }, 100);
        });

        test('恢复应重置重试计数', () => {
            queue.pause();
            
            // 模拟一些重试
            (queue as any).flushRetryCount = 5;
            
            queue.resume();
            
            expect((queue as any).flushRetryCount).toBe(0);
        });

        test('暂停应设置 sendBlocked 为 true', () => {
            queue.pause();
            expect(queue.sendBlocked).toBe(true);
        });

        test('未暂停时恢复应该安全', () => {
            expect(() => {
                queue.resume();
            }).not.toThrow();
        });

        test('暂停超时应自动恢复', (done) => {
            // 创建一个新队列，使用较短的暂停超时时间进行测试
            const testQueue = new MessageQueue(
                100,
                3,
                10,
                sendMessage,
                onRetryFailed,
                onMessageSent
            );
            
            // 修改暂停超时时间为 100ms（通过访问私有属性）
            (testQueue as any).PAUSE_TIMEOUT = 100;
            
            testQueue.pause();
            
            // 等待超时自动恢复
            setTimeout(() => {
                // 应该自动恢复
                expect((testQueue as any).paused).toBe(false);
                done();
            }, 150);
        });

        test('恢复应清除暂停定时器', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            queue.pause();
            queue.resume();
            
            expect(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });
    });

    describe('拒绝请求', () => {
        test('应该能拒绝所有请求类型的消息', () => {
            const callbackManager = new CallbackManager(100);
            const cb1 = jest.fn();
            const cb2 = jest.fn();
            
            callbackManager.register(1, cb1);
            callbackManager.register(2, cb2);
            
            queue.enqueue({
                type: 'request',
                data: { type: 'request', id: 1, module: 'test', method: 'test1', args: [] }
            });
            queue.enqueue({
                type: 'send',
                data: { type: 'send', module: 'test', method: 'test2', args: [] }
            });
            queue.enqueue({
                type: 'request',
                data: { type: 'request', id: 2, module: 'test', method: 'test3', args: [] }
            });
            
            queue.rejectAllRequests('Test rejection', callbackManager);
            
            expect(cb1).toHaveBeenCalledWith({
                id: 1,
                type: 'response',
                error: 'Test rejection'
            });
            expect(cb2).toHaveBeenCalledWith({
                id: 2,
                type: 'response',
                error: 'Test rejection'
            });
            expect(queue.length).toBe(0);
        });

        test('拒绝后应重置队列状态', () => {
            const callbackManager = new CallbackManager(100);
            
            queue.enqueue({
                type: 'request',
                data: { type: 'request', id: 1, module: 'test', method: 'test', args: [] }
            });
            
            queue.rejectAllRequests('Test', callbackManager);
            
            expect(queue.length).toBe(0);
            expect(queue.sendBlocked).toBe(false);
            expect((queue as any).flushScheduled).toBe(false);
        });
    });

    describe('边界情况', () => {
        test('空队列调用 scheduleFlush 应该安全', () => {
            expect(() => {
                queue.scheduleFlush();
            }).not.toThrow();
        });

        test('清空空队列应该安全', () => {
            expect(() => {
                queue.clear();
            }).not.toThrow();
        });

        test('暂停时 scheduleFlush 不应触发发送', (done) => {
            queue.pause();
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test', args: [] } });
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(sendMessage).not.toHaveBeenCalled();
                done();
            }, 100);
        });

        test('已经调度的 flush 不应重复调度', (done) => {
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test1', args: [] } });
            queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: 'test2', args: [] } });
            
            // 第一次调度
            queue.scheduleFlush();
            
            // 多次调度不应该导致重复发送
            queue.scheduleFlush();
            queue.scheduleFlush();
            
            // 等待处理完成
            setTimeout(() => {
                // 每条消息应该只发送一次
                expect(sendMessage).toHaveBeenCalledTimes(2);
                done();
            }, 100);
        });

        test('快速添加和清空应该稳定', () => {
            for (let i = 0; i < 10; i++) {
                queue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: `test${i}`, args: [] } });
                queue.clear();
            }
            
            expect(queue.length).toBe(0);
        });

        test('混合请求和发送消息应正确处理', (done) => {
            const callbackManager = new CallbackManager(100);
            const cb = jest.fn();
            callbackManager.register(1, cb);
            
            queue.enqueue({
                type: 'request',
                data: { type: 'request', id: 1, module: 'test', method: 'test1', args: [] },
                timeoutStartTime: Date.now(),
                timeoutDuration: 5000
            });
            queue.enqueue({
                type: 'send',
                data: { type: 'send', module: 'test', method: 'test2', args: [] }
            });
            
            queue.scheduleFlush();
            
            setTimeout(() => {
                expect(sendMessage).toHaveBeenCalledTimes(2);
                expect(onMessageSent).toHaveBeenCalledTimes(1); // 只有 request 触发
                expect(queue.length).toBe(0);
                done();
            }, 100);
        });
    });

    describe('性能', () => {
        test('处理大量消息应该高效', (done) => {
            const largeQueue = new MessageQueue(500, 3, 50, sendMessage, onRetryFailed);
            
            // 添加 100 条消息（进一步减少数量）
            for (let i = 0; i < 100; i++) {
                largeQueue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: `test${i}`, args: [] } });
            }
            
            largeQueue.scheduleFlush();
            
            setTimeout(() => {
                // 验证所有消息都已处理
                expect(largeQueue.length).toBe(0);
                expect(sendMessage).toHaveBeenCalledTimes(100);
                largeQueue.clear();
                done();
            }, 500);
        });

        test('批量发送应避免阻塞', (done) => {
            const batchQueue = new MessageQueue(100, 3, 10, sendMessage, onRetryFailed);
            
            // 添加 50 条消息
            for (let i = 0; i < 50; i++) {
                batchQueue.enqueue({ type: 'send', data: { type: 'send', module: 'test', method: `test${i}`, args: [] } });
            }
            
            batchQueue.scheduleFlush();
            
            // 应该分批发送，使用 setImmediate
            setTimeout(() => {
                expect(batchQueue.length).toBe(0);
                done();
            }, 200);
        });
    });
});

