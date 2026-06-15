const sceneViewData = {
    isSceneLightOn: true,
    on: jest.fn(),
    initFromConfig: jest.fn(),
    saveConfig: jest.fn(),
};

const lightManager = {
    onEditorOpened: jest.fn(),
    onComponentAdded: jest.fn(),
    onComponentRemoved: jest.fn(),
    enableSceneLights: jest.fn(),
    disableSceneLights: jest.fn(),
};

jest.mock('cc', () => {
    class MockLightComponent { }
    class MockDirectionalLight extends MockLightComponent {
        enabled = true;
    }
    class MockNode {
        parent: any = null;
        layer = 0;
        _objFlags = 0;

        constructor(public name = '') { }

        addComponent() {
            return new MockDirectionalLight();
        }
    }

    return {
        __esModule: true,
        CCObject: {
            Flags: {
                DontSave: 1 << 0,
            },
        },
        Component: class MockComponent { },
        DirectionalLight: MockDirectionalLight,
        Layers: {
            Enum: {
                EDITOR: 1 << 1,
            },
        },
        LightComponent: MockLightComponent,
        Node: MockNode,
        director: {
            getScene: jest.fn(() => null),
        },
    };
});

jest.mock('../scene-process/service/core/decorator', () => ({
    register: () => () => undefined,
    Service: {
        Engine: {
            repaintInEditMode: jest.fn(),
        },
    },
}));

jest.mock('../scene-process/service/scene-view/light-manager', () => ({
    lightManager,
}));

jest.mock('../scene-process/service/scene-view/scene-view-data', () => ({
    sceneViewData,
}));

describe('SceneView editor lifecycle', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('scans the current scene from editor open lifecycle', () => {
        const cc = require('cc');
        const scene = { name: 'Scene' };
        cc.director.getScene.mockReturnValue(scene);
        (globalThis as any).cc = cc;

        const { SceneViewService } = require('../scene-process/service/scene-view');
        const service = new SceneViewService() as any;

        service.onEditorOpened();

        expect(lightManager.onEditorOpened).toHaveBeenCalledWith(scene, true);
    });
});
