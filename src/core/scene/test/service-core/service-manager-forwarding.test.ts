/**
 * ServiceEvents → MessageManager 事件名一致性测试
 *
 * 确保 ServiceManager 转发事件时，ServiceEvents 上的事件名
 * 与 MessageManager 广播的事件名完全一致，不发生名称翻译。
 */

jest.mock('cc', () => ({}));

jest.mock('../../scene-process/service/core', () => {
    const actual = jest.requireActual('../../scene-process/service/core/global-events');
    return {
        getServiceAll: () => [],
        ServiceEvents: actual.ServiceEvents,
    };
});

jest.mock('../../scene-process/service/core/internal-events', () => ({
    InternalServiceEvents: {
        EditorReloadClose: 'editor:reload-close',
        EditorReloadOpen: 'editor:reload-open',
        EditorDisposed: 'editor:disposed',
    },
}));

import { globalEventEmitter } from '../../scene-process/service/core/global-events';
import { messageManager } from '../../scene-process/service/message';
import { serviceManager } from '../../scene-process/service/service-manager';

// ── ServiceManager 转发的所有事件 ──

const SERVICE_MAP_EVENTS = [
    'editor:open', 'editor:close', 'editor:reload', 'editor:save',
    'node:add', 'node:remove', 'node:before-remove', 'node:before-add',
    'node:before-change', 'node:change', 'node:added', 'node:removed',
    'asset:change', 'asset:deleted',
    'component:add', 'component:remove', 'component:added', 'component:removed',
    'component:set-property', 'component:before-add-component', 'component:before-remove-component',
    'script:execution-finished',
    'selection:select', 'selection:unselect', 'selection:clear',
];

const MESSAGE_ONLY_EVENTS = [
    'dirty:changed',
    'gizmo:coordinate-changed', 'gizmo:pivot-changed', 'gizmo:view-mode-changed', 'gizmo:tool-changed',
    'scene:dimension-changed',
    'camera:mode-change', 'camera:projection-changed', 'camera:fov-changed',
    'scene-view:visibility-changed', 'scene-view:light-changed',
];

const ALL_FORWARDED_EVENTS = [...SERVICE_MAP_EVENTS, ...MESSAGE_ONLY_EVENTS];

// ── 测试 ──

describe('ServiceEvents → MessageManager 事件名一致性', () => {
    beforeAll(() => {
        serviceManager.initialize('http://test');
    });

    beforeEach(() => {
        jest.useFakeTimers();
        messageManager.clear();
        (messageManager as any)._timerUtil.clear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it.each(ALL_FORWARDED_EVENTS)(
        '"%s": ServiceEvents 与 MessageManager 广播名一致',
        (eventName) => {
            const listener = jest.fn();
            messageManager.on(eventName, listener);

            globalEventEmitter.emit(eventName, 'test-arg');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith('test-arg');
        }
    );

    it('内部事件不应转发到 MessageManager', () => {
        const listener = jest.fn();
        messageManager.on('editor:reload-close', listener);
        messageManager.on('editor:reload-open', listener);
        messageManager.on('editor:disposed', listener);

        globalEventEmitter.emit('editor:reload-close');
        globalEventEmitter.emit('editor:reload-open');
        globalEventEmitter.emit('editor:disposed');

        expect(listener).not.toHaveBeenCalled();
    });
});
