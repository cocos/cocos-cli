import { ServiceEvents } from '../../scene-process/service/core';

// 定义测试用的事件接口
interface TestEvents {
    'test:void-event': [];
    'test:string-event': [string];
    'test:object-event': [{ id: number; name: string }];
    'test:number-event': [number];
}

describe('ServiceEvents', () => {
    beforeEach(() => {
        // 清理之前的监听器
        ServiceEvents.clear();
    });

    afterEach(() => {
        ServiceEvents.clear();
    });

    describe('emit and on', () => {
        it('should handle void events correctly', () => {
            const mockListener = jest.fn();
            ServiceEvents.on('test:void-event', mockListener);
            ServiceEvents.emit('test:void-event');
            expect(mockListener).toHaveBeenCalledTimes(1);
            expect(mockListener).toHaveBeenCalledWith();
        });

        it('should handle string events correctly', () => {
            const mockListener = jest.fn();
            ServiceEvents.on('test:string-event', mockListener);
            ServiceEvents.emit('test:string-event', 'hello');
            expect(mockListener).toHaveBeenCalledTimes(1);
            expect(mockListener).toHaveBeenCalledWith('hello');
        });



        it('should handle object events correctly', () => {
            const mockListener = jest.fn();
            const testData = { id: 1, name: 'test' };
            ServiceEvents.on('test:object-event', mockListener);
            ServiceEvents.emit('test:object-event', testData);
            expect(mockListener).toHaveBeenCalledTimes(1);
            expect(mockListener).toHaveBeenCalledWith(testData);
        });

        it('should support multiple listeners for the same event', () => {
            const mockListener1 = jest.fn();
            const mockListener2 = jest.fn();
            ServiceEvents.on('test:string-event', mockListener1);
            ServiceEvents.on('test:string-event', mockListener2);
            ServiceEvents.emit('test:string-event', 'test');
            expect(mockListener1).toHaveBeenCalledWith('test');
            expect(mockListener2).toHaveBeenCalledWith('test');
        });

        it('should not call listeners for different events', () => {
            const mockListener1 = jest.fn();
            const mockListener2 = jest.fn();
            ServiceEvents.on('test:string-event', mockListener1);
            ServiceEvents.on('test:number-event', mockListener2);
            ServiceEvents.emit('test:string-event', 'test');
            expect(mockListener1).toHaveBeenCalledWith('test');
            expect(mockListener2).not.toHaveBeenCalled();
        });
    });

    describe('once', () => {
        it('should only call listener once for payload events', () => {
            const mockListener = jest.fn();
            ServiceEvents.once('test:string-event', mockListener);
            ServiceEvents.emit('test:string-event', 'test1');
            ServiceEvents.emit('test:string-event', 'test2');
            expect(mockListener).toHaveBeenCalledTimes(1);
            expect(mockListener).toHaveBeenCalledWith('test1');
        });
    });

    describe('off', () => {
        it('should remove specific listener', () => {
            const mockListener = jest.fn();
            ServiceEvents.on('test:string-event', mockListener);
            ServiceEvents.emit('test:string-event', 'test1');
            ServiceEvents.off('test:string-event', mockListener);
            ServiceEvents.emit('test:string-event', 'test2');
            expect(mockListener).toHaveBeenCalledTimes(1);
            expect(mockListener).toHaveBeenCalledWith('test1');
        });

        it('should not affect other events when removing listener', () => {
            const mockListener1 = jest.fn();
            const mockListener2 = jest.fn();
            ServiceEvents.on('test:string-event', mockListener1);
            ServiceEvents.on('test:number-event', mockListener2);
            ServiceEvents.off('test:string-event', mockListener1);
            ServiceEvents.emit('test:number-event', 42);
            expect(mockListener1).not.toHaveBeenCalled();
            expect(mockListener2).toHaveBeenCalledWith(42);
        });
    });

    describe('clear', () => {
        it('should clear all listeners for specific event', () => {
            const mockListener1 = jest.fn();
            const mockListener2 = jest.fn();
            ServiceEvents.on('test:string-event', mockListener1);
            ServiceEvents.on('test:string-event', mockListener2);
            ServiceEvents.clear('test:string-event');
            ServiceEvents.emit('test:string-event', 'test');
            expect(mockListener1).not.toHaveBeenCalled();
            expect(mockListener2).not.toHaveBeenCalled();
        });

        it('should clear all listeners when no event specified', () => {
            const mockListener1 = jest.fn();
            const mockListener2 = jest.fn();
            ServiceEvents.on('test:string-event', mockListener1);
            ServiceEvents.on('test:number-event', mockListener2);
            ServiceEvents.clear();
            ServiceEvents.emit('test:string-event', 'test');
            ServiceEvents.emit('test:number-event', 42);
            expect(mockListener1).not.toHaveBeenCalled();
            expect(mockListener2).not.toHaveBeenCalled();
        });
    });

    describe('type-safe overloads', () => {
        it('should support type-safe event interface for on/emit', () => {
            const mockListener = jest.fn();

            // 类型安全的调用方式
            ServiceEvents.on<TestEvents>('test:object-event', mockListener);
            ServiceEvents.emit<TestEvents>('test:object-event', { id: 1, name: 'test' });

            expect(mockListener).toHaveBeenCalledTimes(1);
            expect(mockListener).toHaveBeenCalledWith({ id: 1, name: 'test' });
        });

        it('should support type-safe event interface for once', () => {
            const mockListener = jest.fn();

            ServiceEvents.once<TestEvents>('test:string-event', mockListener);
            ServiceEvents.emit<TestEvents>('test:string-event', 'hello');
            ServiceEvents.emit<TestEvents>('test:string-event', 'world');

            expect(mockListener).toHaveBeenCalledTimes(1);
            expect(mockListener).toHaveBeenCalledWith('hello');
        });

        it('should support type-safe event interface for off', () => {
            const mockListener = jest.fn();

            ServiceEvents.on<TestEvents>('test:number-event', mockListener);
            ServiceEvents.emit<TestEvents>('test:number-event', 42);
            ServiceEvents.off<TestEvents>('test:number-event', mockListener);
            ServiceEvents.emit<TestEvents>('test:number-event', 100);

            expect(mockListener).toHaveBeenCalledTimes(1);
            expect(mockListener).toHaveBeenCalledWith(42);
        });

        it('should support mixed usage of type-safe and generic calls', () => {
            const mockListener1 = jest.fn();
            const mockListener2 = jest.fn();

            // 类型安全调用
            ServiceEvents.on<TestEvents>('test:string-event', mockListener1);
            // 通用调用
            ServiceEvents.on('test:string-event', mockListener2);

            // 类型安全发射
            ServiceEvents.emit<TestEvents>('test:string-event', 'typed');

            expect(mockListener1).toHaveBeenCalledWith('typed');
            expect(mockListener2).toHaveBeenCalledWith('typed');
        });
    });

    describe('backward compatibility', () => {
        it('should maintain compatibility with existing string-based calls', () => {
            const mockListener = jest.fn();

            // 原有的调用方式应该继续工作
            ServiceEvents.on('custom:event', mockListener);
            ServiceEvents.emit('custom:event', 'data', 123, { extra: true });

            expect(mockListener).toHaveBeenCalledTimes(1);
            expect(mockListener).toHaveBeenCalledWith('data', 123, { extra: true });
        });

        it('should handle events with multiple arguments', () => {
            const mockListener = jest.fn();

            ServiceEvents.on('multi:args', mockListener);
            ServiceEvents.emit('multi:args', 'arg1', 'arg2', 'arg3');

            expect(mockListener).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
        });

        it('should handle events with no arguments', () => {
            const mockListener = jest.fn();

            ServiceEvents.on('no:args', mockListener);
            ServiceEvents.emit('no:args');

            expect(mockListener).toHaveBeenCalledWith();
        });
    });

    describe('edge cases', () => {
        it('should handle emitting events with no listeners', () => {
            expect(() => {
                ServiceEvents.emit('test:non-existent-event', 'data');
            }).not.toThrow();
        });

        it('should handle removing non-existent listener', () => {
            const mockListener = jest.fn();
            expect(() => {
                ServiceEvents.off('test:non-existent-event', mockListener);
            }).not.toThrow();
        });

        it('should handle clearing non-existent event', () => {
            expect(() => {
                ServiceEvents.clear('test:non-existent-event');
            }).not.toThrow();
        });
    });
});