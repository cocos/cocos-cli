import { EventEmitter } from 'events';

const getServiceAll = jest.fn();
const eventBus = new EventEmitter();
const serviceEvents = {
    on: jest.fn((event: string, listener: (...args: any[]) => void) => eventBus.on(event, listener)),
    off: jest.fn((event: string, listener: (...args: any[]) => void) => eventBus.off(event, listener)),
    emit: jest.fn((event: string, ...args: any[]) => eventBus.emit(event, ...args)),
    broadcast: jest.fn((event: string, ...args: any[]) => eventBus.emit(event, ...args)),
    clear: jest.fn((event?: string) => {
        if (event) {
            eventBus.removeAllListeners(event);
        } else {
            eventBus.removeAllListeners();
        }
    }),
};

jest.mock('../scene-process/service/core', () => ({
    getServiceAll,
    ServiceEvents: serviceEvents,
}));

jest.mock('../scene-process/service/core/internal-events', () => ({
    InternalServiceEvents: {
        EditorReloadClose: 'editor:reload-close',
        EditorReloadOpen: 'editor:reload-open',
        EditorDisposed: 'editor:disposed',
    },
}));

describe('ServiceManager reload lifecycle', () => {
    it('rejects required initialization failures in strict browser startup', async () => {
        const { ServiceManager } = require('../scene-process/service/service-manager');
        const failure = new Error('Gizmo failed');
        getServiceAll.mockReturnValue([{ constructor: { name: 'GizmoService' }, init: async () => { throw failure; } }]);
        await expect(new ServiceManager().initAllServices({ strict: true })).rejects.toMatchObject({
            message: 'Scene service initialization failed: GizmoService', cause: failure,
        });
    });

    it('detaches event forwarding on dispose and can initialize without duplicate listeners', () => {
        const { ServiceManager } = require('../scene-process/service/service-manager');
        const opened = jest.fn();
        getServiceAll.mockReturnValue([{ constructor: { name: 'Editor' }, onEditorOpened: opened }]);
        const manager = new ServiceManager();
        manager.initialize('http://first');
        manager.dispose();
        serviceEvents.emit('editor:open');
        expect(opened).not.toHaveBeenCalled();
        manager.initialize('http://second');
        serviceEvents.emit('editor:open');
        expect(opened).toHaveBeenCalledTimes(1);
        manager.dispose();
    });
    afterEach(() => {
        eventBus.removeAllListeners();
        jest.clearAllMocks();
    });

    it('forwards public editor lifecycle to all services', () => {
        const { ServiceManager } = require('../scene-process/service/service-manager');
        const firstService = {
            onEditorClosed: jest.fn(),
            onEditorOpened: jest.fn(),
            onEditorDisposed: jest.fn(),
            constructor: { name: 'FirstService' },
        };
        const secondService = {
            onEditorClosed: jest.fn(),
            onEditorOpened: jest.fn(),
            onEditorDisposed: jest.fn(),
            constructor: { name: 'SecondService' },
        };
        getServiceAll.mockReturnValue([firstService, secondService]);

        const serviceManager = new ServiceManager();
        serviceManager.initialize('http://test');

        serviceEvents.emit('editor:close');
        serviceEvents.emit('editor:open');

        expect(firstService.onEditorClosed).toHaveBeenCalledTimes(1);
        expect(firstService.onEditorOpened).toHaveBeenCalledTimes(1);
        expect(secondService.onEditorClosed).toHaveBeenCalledTimes(1);
        expect(secondService.onEditorOpened).toHaveBeenCalledTimes(1);
        expect(firstService.onEditorDisposed).not.toHaveBeenCalled();
        expect(secondService.onEditorDisposed).not.toHaveBeenCalled();
    });

    it('forwards internal editor reload lifecycle to all services', () => {
        const { ServiceManager } = require('../scene-process/service/service-manager');
        const firstService = {
            onEditorClosed: jest.fn(),
            onEditorOpened: jest.fn(),
            onEditorDisposed: jest.fn(),
            constructor: { name: 'FirstService' },
        };
        const secondService = {
            onEditorClosed: jest.fn(),
            onEditorOpened: jest.fn(),
            onEditorDisposed: jest.fn(),
            constructor: { name: 'SecondService' },
        };
        getServiceAll.mockReturnValue([firstService, secondService]);

        const serviceManager = new ServiceManager();
        serviceManager.initialize('http://test');

        serviceEvents.emit('editor:reload-close');
        serviceEvents.emit('editor:reload-open');

        expect(firstService.onEditorClosed).toHaveBeenCalledTimes(1);
        expect(firstService.onEditorOpened).toHaveBeenCalledTimes(1);
        expect(secondService.onEditorClosed).toHaveBeenCalledTimes(1);
        expect(secondService.onEditorOpened).toHaveBeenCalledTimes(1);
        expect(firstService.onEditorDisposed).not.toHaveBeenCalled();
        expect(secondService.onEditorDisposed).not.toHaveBeenCalled();
    });

    it('forwards editor disposed only from the internal disposed event', () => {
        const { ServiceManager } = require('../scene-process/service/service-manager');
        const service = {
            onEditorClosed: jest.fn(),
            onEditorDisposed: jest.fn(),
            constructor: { name: 'SessionStateService' },
        };
        getServiceAll.mockReturnValue([service]);

        const serviceManager = new ServiceManager();
        serviceManager.initialize('http://test');

        serviceEvents.emit('editor:reload-close');
        expect(service.onEditorClosed).toHaveBeenCalledTimes(1);
        expect(service.onEditorDisposed).not.toHaveBeenCalled();

        serviceEvents.emit('editor:disposed');
        expect(service.onEditorDisposed).toHaveBeenCalledTimes(1);
    });
});
