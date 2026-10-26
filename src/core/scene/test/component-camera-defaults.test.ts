import type { Camera, Node } from 'cc';

const mockLookup = jest.fn();
const mockBackendView = { is2D: false };

jest.mock('../scene-process/service/core/decorator', () => ({
    queryRegisteredService: (name: string) => mockLookup(name),
}));
jest.mock('../scene-process/service/core/backend-view', () => ({ backendView: mockBackendView }));
jest.mock('cc', () => ({
    Camera: {
        ProjectionType: { ORTHO: 0, PERSPECTIVE: 1 },
        ClearFlag: { DEPTH_ONLY: 6, SKYBOX: 14 },
    },
    Layers: {
        Enum: { DEFAULT: 1, UI_2D: 2, UI_3D: 4 },
        makeMaskInclude: (layers: number[]) => layers.reduce((mask, layer) => mask | layer, 0),
    },
}));

import { Camera as EngineCamera, Layers } from 'cc';
import componentUtils from '../scene-process/service/component/utils';

function createCamera() {
    const camera = { near: 0.1 } as Camera;
    componentUtils.addComponentMap.Camera(camera, {} as Node);
    return camera;
}

function expectCameraMode(camera: Camera, is2D: boolean) {
    expect(camera).toMatchObject(is2D ? {
        visibility: Layers.makeMaskInclude([Layers.Enum.UI_3D, Layers.Enum.UI_2D]),
        projection: EngineCamera.ProjectionType.ORTHO,
        near: 0,
        clearFlags: EngineCamera.ClearFlag.DEPTH_ONLY,
    } : {
        visibility: Layers.Enum.DEFAULT,
        projection: EngineCamera.ProjectionType.PERSPECTIVE,
        near: 0.1,
        clearFlags: EngineCamera.ClearFlag.SKYBOX,
    });
}

describe('new Camera defaults', () => {
    beforeEach(() => {
        mockLookup.mockReset();
        mockBackendView.is2D = false;
    });

    it.each([false, true])('uses the live view mode after switching from is2D=%s', initialMode => {
        const interactiveCamera = { is2D: initialMode };
        mockBackendView.is2D = initialMode;
        mockLookup.mockReturnValue(interactiveCamera);

        expectCameraMode(createCamera(), initialMode);
        interactiveCamera.is2D = !initialMode;
        expectCameraMode(createCamera(), !initialMode);
        expect(mockBackendView.is2D).toBe(initialMode);
    });

    it.each([false, true])('uses the backend is2D=%s without an interactive Camera service', is2D => {
        mockLookup.mockReturnValue(null);
        mockBackendView.is2D = is2D;

        expectCameraMode(createCamera(), is2D);
    });
});
