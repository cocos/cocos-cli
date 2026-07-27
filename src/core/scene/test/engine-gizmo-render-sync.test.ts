const syncSceneGizmoCamera = jest.fn();
const directorTick = jest.fn();

jest.mock('cc', () => ({
    Component: class Component {},
    Node: class Node {},
    GeometryRenderer: class GeometryRenderer {},
    director: {
        getTotalFrames: jest.fn(() => 0),
        tick: directorTick,
    },
}));

jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => () => undefined,
    Service: {
        Gizmo: { syncSceneGizmoCamera },
    },
    queryRegisteredService: jest.fn(() => null),
    getServiceAll: jest.fn(() => []),
}));

jest.mock('../scene-process/service/engine/geometry_renderer', () => ({
    GeometryRenderer: class GeometryRenderer {},
    methods: [],
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: jest.fn() },
}));

import { EngineService } from '../scene-process/service/engine';

describe('Engine continuous tick Gizmo render synchronization', () => {
    beforeEach(() => {
        syncSceneGizmoCamera.mockClear();
        directorTick.mockClear();
    });

    it('synchronizes the Scene Gizmo camera before director.tick submits a frame', () => {
        const callOrder: string[] = [];
        syncSceneGizmoCamera.mockImplementation(() => callOrder.push('gizmo'));
        directorTick.mockImplementation(() => callOrder.push('tick'));

        const service = new EngineService();
        service.tickInEditMode(1 / 60);

        expect(syncSceneGizmoCamera).toHaveBeenCalledTimes(1);
        expect(directorTick).toHaveBeenCalledWith(1 / 60);
        expect(callOrder).toEqual(['gizmo', 'tick']);
    });
});
