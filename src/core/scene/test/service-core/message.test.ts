import { messageManager } from '../../scene-process/service/message';

describe('MessageManager', () => {
    let processSend: jest.SpyInstance;
    const originalConnected = (process as any).connected;

    beforeEach(() => {
        jest.useFakeTimers();
        messageManager.clear();
        (messageManager as any)._timerUtil.clear();

        // 模拟子进程环境
        Object.defineProperty(process, 'connected', { value: true, writable: true, configurable: true });
        processSend = jest.spyOn(process, 'send').mockImplementation(() => true);
    });

    afterEach(() => {
        (messageManager as any)._timerUtil.clear();
        messageManager.clear();
        jest.useRealTimers();
        processSend.mockRestore();
        Object.defineProperty(process, 'connected', { value: originalConnected, writable: true, configurable: true });
    });

    // ── broadcast 基础功能 ──

    describe('broadcast', () => {
        it('应通过私有 EventEmitter 本地派发事件', () => {
            const listener = jest.fn();
            messageManager.on('test:event', listener);

            messageManager.broadcast('test:event', 'arg1', 'arg2');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith('arg1', 'arg2');
        });

        it('不应通过 process.send 跨进程广播（仅本地派发）', () => {
            messageManager.broadcast('test:event', 'data');

            expect(processSend).not.toHaveBeenCalled();
        });

        it('无参数事件应正常广播', () => {
            const listener = jest.fn();
            messageManager.on('test:no-args', listener);

            messageManager.broadcast('test:no-args');

            expect(listener).toHaveBeenCalledWith();
            expect(processSend).not.toHaveBeenCalled();
        });
    });

    // ── broadcastChangeNodeMsg 节流功能 ──

    describe('broadcastChangeNodeMsg', () => {
        it('首次调用应立即广播 scene:change-node', () => {
            const listener = jest.fn();
            messageManager.on('scene:change-node', listener);

            messageManager.broadcastChangeNodeMsg('uuid-1');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith('uuid-1');
        });

        it('200ms 内同 uuid 重复调用应被节流', () => {
            const listener = jest.fn();
            messageManager.on('scene:change-node', listener);

            messageManager.broadcastChangeNodeMsg('uuid-1');
            messageManager.broadcastChangeNodeMsg('uuid-1');
            messageManager.broadcastChangeNodeMsg('uuid-1');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('200ms 后应执行最后一次挂起的调用', () => {
            const listener = jest.fn();
            messageManager.on('scene:change-node', listener);

            messageManager.broadcastChangeNodeMsg('uuid-1');
            messageManager.broadcastChangeNodeMsg('uuid-1');

            jest.advanceTimersByTime(200);

            expect(listener).toHaveBeenCalledTimes(2);
            expect(listener).toHaveBeenNthCalledWith(1, 'uuid-1');
            expect(listener).toHaveBeenNthCalledWith(2, 'uuid-1');
        });

        it('不同 uuid 的节点应各自独立广播', () => {
            const listener = jest.fn();
            messageManager.on('scene:change-node', listener);

            messageManager.broadcastChangeNodeMsg('uuid-A');
            messageManager.broadcastChangeNodeMsg('uuid-B');

            expect(listener).toHaveBeenCalledTimes(2);
            expect(listener).toHaveBeenNthCalledWith(1, 'uuid-A');
            expect(listener).toHaveBeenNthCalledWith(2, 'uuid-B');
        });

        it('节流期间 process.send 不应被调用', () => {
            messageManager.broadcastChangeNodeMsg('uuid-1');
            messageManager.broadcastChangeNodeMsg('uuid-1');

            expect(processSend).not.toHaveBeenCalled();

            jest.advanceTimersByTime(200);

            expect(processSend).not.toHaveBeenCalled();
        });
    });

    // ── 各调用方事件场景测试 ──

    describe('node 服务事件 (node.ts, node/index.ts)', () => {
        it('node:change — 节点属性修改', () => {
            const listener = jest.fn();
            messageManager.on('node:change', listener);
            const mockNode = { uuid: 'node-uuid-1', name: 'TestNode' };

            messageManager.broadcast('node:change', mockNode);

            expect(listener).toHaveBeenCalledWith(mockNode);
        });

        it('node:added — 添加节点', () => {
            const listener = jest.fn();
            messageManager.on('node:added', listener);
            const mockNode = { uuid: 'new-node' };

            messageManager.broadcast('node:added', mockNode);

            expect(listener).toHaveBeenCalledWith(mockNode);
        });

        it('node:removed — 移除节点', () => {
            const listener = jest.fn();
            messageManager.on('node:removed', listener);
            const mockNode = { uuid: 'del-node' };

            messageManager.broadcast('node:removed', mockNode);

            expect(listener).toHaveBeenCalledWith(mockNode);
        });

        it('scene:change-node — 通过 broadcastChangeNodeMsg 节流广播', () => {
            const listener = jest.fn();
            messageManager.on('scene:change-node', listener);

            messageManager.broadcastChangeNodeMsg('node-uuid-1');
            messageManager.broadcastChangeNodeMsg('node-uuid-1');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith('node-uuid-1');

            jest.advanceTimersByTime(200);
            expect(listener).toHaveBeenCalledTimes(2);
        });
    });

    describe('component 服务事件 (component/index.ts)', () => {
        it('node:added — 添加组件', () => {
            const listener = jest.fn();
            messageManager.on('node:added', listener);
            const mockComponent = { uuid: 'comp-uuid', node: { uuid: 'node-1' } };

            messageManager.broadcast('node:added', mockComponent);

            expect(listener).toHaveBeenCalledWith(mockComponent);
        });

        it('node:removed — 移除组件', () => {
            const listener = jest.fn();
            messageManager.on('node:removed', listener);
            const mockComponent = { uuid: 'comp-uuid', node: { uuid: 'node-1' } };

            messageManager.broadcast('node:removed', mockComponent);

            expect(listener).toHaveBeenCalledWith(mockComponent);
        });
    });

    describe('editor 服务事件 (editor.ts)', () => {
        it('editor:open — 打开编辑器', () => {
            const listener = jest.fn();
            messageManager.on('editor:open', listener);

            messageManager.broadcast('editor:open');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('editor:close — 关闭编辑器', () => {
            const listener = jest.fn();
            messageManager.on('editor:close', listener);

            messageManager.broadcast('editor:close');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('editor:save — 保存场景', () => {
            const listener = jest.fn();
            messageManager.on('editor:save', listener);

            messageManager.broadcast('editor:save');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('editor:reload — 重新加载场景', () => {
            const listener = jest.fn();
            messageManager.on('editor:reload', listener);

            messageManager.broadcast('editor:reload');

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('gizmo 服务事件 (gizmo.ts)', () => {
        it('gizmo:coordinate-changed — 坐标系切换', () => {
            const listener = jest.fn();
            messageManager.on('gizmo:coordinate-changed', listener);

            messageManager.broadcast('gizmo:coordinate-changed');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('gizmo:pivot-changed — 轴心切换', () => {
            const listener = jest.fn();
            messageManager.on('gizmo:pivot-changed', listener);

            messageManager.broadcast('gizmo:pivot-changed');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('gizmo:view-mode-changed — 视图模式切换', () => {
            const listener = jest.fn();
            messageManager.on('gizmo:view-mode-changed', listener);

            messageManager.broadcast('gizmo:view-mode-changed');

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('scene:dimension-changed — 2D/3D 维度切换', () => {
            const listener = jest.fn();
            messageManager.on('scene:dimension-changed', listener);

            messageManager.broadcast('scene:dimension-changed', true);

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(true);
        });
    });

    // ── 骨骼动画高频场景 ──

    describe('高频 change-node 场景（骨骼动画模拟）', () => {
        it('连续 10 次 broadcastChangeNodeMsg 同一节点，只应执行 2 次', () => {
            const listener = jest.fn();
            messageManager.on('scene:change-node', listener);

            for (let i = 0; i < 10; i++) {
                messageManager.broadcastChangeNodeMsg('bone-uuid');
            }

            expect(listener).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(200);

            expect(listener).toHaveBeenCalledTimes(2);
        });

        it('多个骨骼节点并发变更应各自独立节流', () => {
            const listener = jest.fn();
            messageManager.on('scene:change-node', listener);

            messageManager.broadcastChangeNodeMsg('bone-1');
            messageManager.broadcastChangeNodeMsg('bone-2');
            messageManager.broadcastChangeNodeMsg('bone-3');
            messageManager.broadcastChangeNodeMsg('bone-1');
            messageManager.broadcastChangeNodeMsg('bone-2');

            // bone-1, bone-2, bone-3 各首次立即执行 = 3
            expect(listener).toHaveBeenCalledTimes(3);

            jest.advanceTimersByTime(200);

            // bone-1, bone-2 各有挂起调用 = +2 = 5
            expect(listener).toHaveBeenCalledTimes(5);
        });
    });
});
