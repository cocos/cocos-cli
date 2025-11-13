import { BaseService, ServiceEvents } from '../../scene-process/service/core';

// 定义测试用的事件接口
interface TestServiceEvents {
    'service:void-event': [];
    'service:string-event': [string];
    'service:number-event': [number];
    'service:object-event': [{ id: number; name: string }];
}

// 测试用的服务类，继承 BaseService 并暴露 protected 方法
class TestService extends BaseService<TestServiceEvents> {
    // 简单暴露 protected 方法用于测试
    public emit = super.emit.bind(this);
    public on = super.on.bind(this);
    public once = super.once.bind(this);
    public off = super.off.bind(this);
    public clear = super.clear.bind(this);
}

describe('BaseService', () => {
    let service: TestService;

    beforeEach(() => {
        service = new TestService();
        // 清理全局事件监听器
        ServiceEvents.clear();
    });

    afterEach(() => {
        ServiceEvents.clear();
    });

    describe('emit', () => {
        it('should emit void events correctly', () => {
            const listener = jest.fn();

            service.on('service:void-event', listener);
            service.emit('service:void-event');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith();
        });

        it('should emit string events correctly', () => {
            const listener = jest.fn();
            const testData = 'test message';

            service.on('service:string-event', listener);
            service.emit('service:string-event', testData);

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(testData);
        });



        it('should emit object events correctly', () => {
            const listener = jest.fn();
            const testData = { id: 1, name: 'test object' };

            service.on('service:object-event', listener);
            service.emit('service:object-event', testData);

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(testData);
        });
    });

    describe('on', () => {
        it('should support multiple listeners for the same event', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            const testData = 'shared data';

            service.on('service:string-event', listener1);
            service.on('service:string-event', listener2);
            service.emit('service:string-event', testData);

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener1).toHaveBeenCalledWith(testData);
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledWith(testData);
        });
    });

    describe('once', () => {
        it('should only call listener once for payload events', () => {
            const listener = jest.fn();
            const testData = 'once data';

            service.once('service:string-event', listener);
            service.emit('service:string-event', testData);
            service.emit('service:string-event', testData);

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(testData);
        });
    });

    describe('off', () => {
        it('should remove specific listener', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            const testData = 'test data';

            service.on('service:string-event', listener1);
            service.on('service:string-event', listener2);
            service.off('service:string-event', listener1);
            service.emit('service:string-event', testData);

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledWith(testData);
        });

        it('should not affect other events when removing listener', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();

            service.on('service:string-event', listener1);
            service.on('service:number-event', listener2);
            service.off('service:string-event', listener1);

            service.emit('service:string-event', 'test');
            service.emit('service:number-event', 42);

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledWith(42);
        });
    });

    describe('clear', () => {
        it('should clear all listeners for specific event', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            const listener3 = jest.fn();

            service.on('service:string-event', listener1);
            service.on('service:string-event', listener2);
            service.on('service:number-event', listener3);

            service.clear('service:string-event');

            service.emit('service:string-event', 'test');
            service.emit('service:number-event', 42);

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).not.toHaveBeenCalled();
            expect(listener3).toHaveBeenCalledTimes(1);
            expect(listener3).toHaveBeenCalledWith(42);
        });

        it('should clear all listeners when no event specified', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();

            service.on('service:string-event', listener1);
            service.on('service:number-event', listener2);

            service.clear();

            service.emit('service:string-event', 'test');
            service.emit('service:number-event', 42);

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).not.toHaveBeenCalled();
        });
    });

    describe('integration with ServiceEvents', () => {
        it('should use ServiceEvents internally', () => {
            const listener = jest.fn();

            // 直接在 ServiceEvents 上监听
            ServiceEvents.on('service:string-event', listener);

            // 通过 service 触发事件
            service.emit('service:string-event', 'integration test');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith('integration test');
        });

        it('should work with multiple service instances', () => {
            const service2 = new TestService();
            const listener1 = jest.fn();
            const listener2 = jest.fn();

            service.on('service:string-event', listener1);
            service2.on('service:string-event', listener2);

            // 任一服务触发事件，所有监听器都会收到
            service.emit('service:string-event', 'shared event');

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener1).toHaveBeenCalledWith('shared event');
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledWith('shared event');
        });
    });

    describe('edge cases', () => {
        it('should handle emitting events with no listeners', () => {
            expect(() => {
                service.emit('service:void-event');
                service.emit('service:string-event', 'no listeners');
            }).not.toThrow();
        });

        it('should handle removing non-existent listener', () => {
            const listener = jest.fn();

            expect(() => {
                service.off('service:string-event', listener);
            }).not.toThrow();
        });

        it('should handle clearing non-existent event', () => {
            expect(() => {
                service.clear('service:string-event');
            }).not.toThrow();
        });
    });
});