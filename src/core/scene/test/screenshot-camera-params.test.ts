jest.mock('cc', () => {
    class Vec3 {
        constructor(public x = 0, public y = 0, public z = 0) {}

        clone() {
            return new Vec3(this.x, this.y, this.z);
        }
    }
    class Quat {
        constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}

        clone() {
            return new Quat(this.x, this.y, this.z, this.w);
        }
    }
    class Rect {
        constructor(
            public x = 0,
            public y = 0,
            public width = 1,
            public height = 1,
        ) {}

        clone() {
            return new Rect(this.x, this.y, this.width, this.height);
        }
    }
    class Camera {
        static ProjectionType = { ORTHO: 0, PERSPECTIVE: 1 };
        static ClearFlag = { SOLID_COLOR: 1 };
        static FOVAxis = { VERTICAL: 0, HORIZONTAL: 1 };
    }
    class Node {
        public layer = 0;
        public parent: unknown = null;
        public destroyed = false;

        constructor(public name = '') {}

        setParent(parent: unknown) {
            this.parent = parent;
        }

        setWorldPosition() {}

        setWorldRotation() {}

        addComponent() {
            return {};
        }

        destroy() {
            this.destroyed = true;
        }
    }
    return {
        __esModule: true,
        default: {},
        Camera,
        Canvas: class {},
        Color: class {
            constructor(public r = 0, public g = 0, public b = 0, public a = 255) {}

            clone() {
                return new (this.constructor as any)(this.r, this.g, this.b, this.a);
            }
        },
        gfx: { ClearFlagBit: { NONE: 0, DEPTH_STENCIL: 6 } },
        Layers: {
            BitMask: { PROFILER: 1 },
            Enum: { EDITOR: 2, GIZMOS: 4, SCENE_GIZMO: 8, IGNORE_RAYCAST: 16 },
            makeMaskExclude: jest.fn(() => 0),
            makeMaskInclude: jest.fn((layers: number[]) => layers.reduce((mask, layer) => mask | layer, 0)),
        },
        Node,
        Quat,
        Rect,
        UITransform: class {},
        Vec3,
        renderer: { scene: { CameraUsage: { EDITOR: 1 } } },
    };
});

jest.mock('../scene-process/service/core', () => ({
    BaseService: class {},
    register: () => (target: unknown) => target,
    Service: {},
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: jest.fn() },
}));

jest.mock('../scene-process/service/screenshot/screenshot-buffer', () => ({
    ScreenshotBuffer: class {},
}));

jest.mock('../scene-process/service/dump', () => ({
    __esModule: true,
    default: {
        restoreNodeSnapshotProperties: jest.fn(() => Promise.resolve()),
        restoreComponentSnapshotProperties: jest.fn(() => Promise.resolve()),
    },
}));

import { Canvas, Node, UITransform } from 'cc';
import { ScreenshotService } from '../scene-process/service/screenshot';

describe('Screenshot camera parameter normalization', () => {
    it('normalizes only returned metadata without changing render camera values', () => {
        const service = new ScreenshotService();
        const params = (service as any)._paramsFromComponent({
            node: {
                getWorldPosition: () => ({ x: Number.NaN, y: Number.POSITIVE_INFINITY, z: 3 }),
                getWorldRotation: () => ({ x: Number.NaN, y: 0, z: 0, w: Number.NaN }),
            },
            projection: 0,
            fov: Number.NaN,
            orthoHeight: Number.NaN,
            near: Number.POSITIVE_INFINITY,
            far: -1,
            visibility: Number.NaN,
        });
        const info = (service as any)._cameraInfoFromParams(params, 'editor', 'Editor Camera');

        expect(Number.isNaN(params.orthoHeight)).toBe(true);
        expect(info.position).toEqual({ x: 0, y: 0, z: 3 });
        expect(info.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
        expect(info.orthoHeight).toBe(10);
        expect(JSON.parse(JSON.stringify(info)).orthoHeight).toBe(10);
    });

    it('focuses a 2D prefab before copying the editor camera', () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const camera = {
            is2D: false,
            getCamera: jest.fn(() => ({ node: {} })),
            defaultFocus: jest.fn(),
        };
        Service.Editor = {
            getRootNode: jest.fn(() => ({
                uuid: 'prefab-root',
                getComponentInChildren: jest.fn(() => ({})),
                getComponentsInChildren: jest.fn(() => []),
            })),
            getCurrentEditorUuid: jest.fn(() => 'prefab-uuid'),
        };
        Service.Camera = camera;

        (service as any)._focusEditorCameraForCapture({ viewMode: '2d' });

        expect(camera.is2D).toBe(true);
        expect(camera.defaultFocus).toHaveBeenCalledWith('prefab-uuid');
    });

    it('frames a UI prefab from its preview canvas instead of an invalid editor viewport', () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const transform = {
            width: 960,
            height: 640,
            getBoundingBoxToWorld: jest.fn(() => ({ x: -480, y: -320, width: 960, height: 640 })),
        };
        const canvasNode: any = {
            parent: null,
            getComponent: jest.fn((type: unknown) => type === Canvas ? canvas : type === UITransform ? transform : null),
            getWorldPosition: jest.fn(() => ({ x: 0, y: 0, z: 0 })),
        };
        const canvas = { node: canvasNode };
        const prefabRoot = {
            parent: canvasNode,
            getComponentInChildren: jest.fn(() => null),
            getComponent: jest.fn(() => null),
        };
        Service.Editor = {
            getCurrentEditorType: jest.fn(() => 'prefab'),
            getRootNode: jest.fn(() => prefabRoot),
        };

        const framing = (service as any)._resolvePrefab2DFraming({ viewMode: '2d' });

        expect(framing).not.toBeNull();
        expect(framing.params.position).toMatchObject({ x: 0, y: 0, z: 1000 });
        expect(framing.params.orthoHeight).toBe(320);
        expect(framing.info).toMatchObject({
            source: 'editor',
            projection: 'ortho',
            orthoHeight: 320,
        });
    });

    it('reframes a screen-aligned Canvas camera for the design-resolution target', () => {
        const service = new ScreenshotService();
        const previousCc = (globalThis as any).cc;
        const camera = {};
        const canvas = {
            alignCanvasWithScreen: true,
            cameraComponent: camera,
            node: {
                getWorldPosition: jest.fn(() => ({ x: 640, y: 360, z: 0 })),
            },
        };
        const params = {
            position: { x: 480, y: 320, z: 1000 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            projection: 0,
            priority: 0,
            fov: 45,
            fovAxis: 0,
            orthoHeight: 426.67,
            near: 0.01,
            far: 10000,
            clearFlags: 1,
            clearDepth: 1,
            clearStencil: 0,
            visibility: 0xffffffff,
            rect: { x: 0, y: 0, width: 1, height: 1 },
        };
        const framing: any = {
            info: (service as any)._cameraInfoFromParams(params, 'scene', 'Canvas Camera'),
            source: 'scene',
            params,
            sourceCamera: camera,
            canvas,
        };

        try {
            (globalThis as any).cc = {
                view: {
                    getDesignResolutionSize: () => ({ width: 1280, height: 720 }),
                },
            };

            (service as any)._fitAlignedCanvasFraming(framing, 1280, 720);

            expect(framing.params.orthoHeight).toBe(360);
            expect(framing.params.position).toMatchObject({ x: 640, y: 360, z: 1000 });
            expect(framing.info).toMatchObject({
                source: 'scene',
                projection: 'ortho',
                orthoHeight: 360,
            });
            expect(framing.renderNote).toContain('工程设计分辨率');
        } finally {
            (globalThis as any).cc = previousCc;
        }
    });

    it('selects all screen cameras in ascending priority and excludes non-rendering cameras', () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const makeCamera = (name: string, priority: number, overrides: Record<string, unknown> = {}) => ({
            node: { name, layer: 1 },
            priority,
            enabledInHierarchy: true,
            targetTexture: null,
            ...overrides,
        });
        const ui = makeCamera('UI Camera', 100);
        const main = makeCamera('Main Camera', 0);
        const disabled = makeCamera('Disabled Camera', 10, { enabledInHierarchy: false });
        const editorLayer = makeCamera('Editor Camera', 20, { node: { name: 'Editor Camera', layer: 2 } });
        const renderTexture = makeCamera('Render Texture Camera', 30, { targetTexture: {} });
        Service.Editor = {
            getRootNode: jest.fn(() => ({
                getComponentsInChildren: jest.fn(() => [ui, disabled, editorLayer, renderTexture, main]),
            })),
        };
        Service.Camera = { getCamera: jest.fn(() => null) };

        expect((service as any)._findSceneCameras()).toEqual([main, ui]);
    });

    it('preserves camera composition parameters in render metadata', () => {
        const service = new ScreenshotService();
        const params = (service as any)._paramsFromComponent({
            node: {
                getWorldPosition: () => ({ x: 1, y: 2, z: 3 }),
                getWorldRotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
            },
            projection: 1,
            priority: 50,
            fov: 60,
            fovAxis: 1,
            orthoHeight: 10,
            near: 0.1,
            far: 2000,
            clearFlags: 2,
            clearDepth: 0.5,
            clearStencil: 3,
            visibility: 0x1234,
            rect: { x: 0.1, y: 0.2, width: 0.7, height: 0.8 },
        });
        const info = (service as any)._cameraInfoFromParams(params, 'scene', 'UI Camera');

        expect(params).toMatchObject({
            priority: 50,
            fovAxis: 1,
            clearFlags: 2,
            clearDepth: 0.5,
            clearStencil: 3,
            visibility: 0x1234,
            rect: { x: 0.1, y: 0.2, width: 0.7, height: 0.8 },
        });
        expect(info).toMatchObject({
            nodeName: 'UI Camera',
            priority: 50,
            clearFlags: 2,
            visibility: 0x1234,
            viewport: { x: 0.1, y: 0.2, width: 0.7, height: 0.8 },
        });
    });

    it('uses only the requested camera when camera is explicitly specified', () => {
        const service = new ScreenshotService();
        const requestedCamera = {
            node: {
                name: 'Requested Camera',
                getWorldPosition: () => ({ x: 0, y: 0, z: 10 }),
                getWorldRotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
            },
            projection: 1,
            priority: 25,
            fov: 45,
            near: 0.1,
            far: 1000,
            clearFlags: 1,
            visibility: 0xffffffff,
            rect: { x: 0, y: 0, width: 1, height: 1 },
        };
        jest.spyOn(service as any, '_findCameraByRef').mockReturnValue(requestedCamera);
        const findSceneCameras = jest.spyOn(service as any, '_findSceneCameras');

        const framings = (service as any)._resolveFramings({ camera: 'requested-camera' });

        expect(framings).toHaveLength(1);
        expect(framings[0]).toMatchObject({
            source: 'scene',
            sourceCamera: requestedCamera,
            info: { nodeName: 'Requested Camera', priority: 25 },
        });
        expect(findSceneCameras).not.toHaveBeenCalled();
    });

    it('preserves the normal scene-camera stack and appends gizmo overlays', () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const makeNode = (name: string, position = new (jest.requireMock('cc').Vec3)(0, 0, 10)) => ({
            name,
            getWorldPosition: jest.fn(() => position),
            getWorldRotation: jest.fn(() => new (jest.requireMock('cc').Quat)()),
        });
        const mainCamera = {
            node: makeNode('Main Camera', new (jest.requireMock('cc').Vec3)(1, 2, 30)),
            enabledInHierarchy: true,
            targetTexture: null,
            projection: 1,
            priority: 0,
            fov: 55,
            near: 0.1,
            far: 10000,
            clearFlags: 1,
            visibility: 0xffff,
            rect: new (jest.requireMock('cc').Rect)(0, 0, 1, 1),
        };
        const uiCamera = {
            node: makeNode('UI Camera', new (jest.requireMock('cc').Vec3)(640, 360, 1000)),
            enabledInHierarchy: true,
            targetTexture: null,
            projection: 0,
            priority: 100,
            orthoHeight: 360,
            near: 0.1,
            far: 10000,
            clearFlags: 1,
            visibility: 0xffffffff,
            rect: new (jest.requireMock('cc').Rect)(0, 0, 1, 1),
        };
        const sceneGizmoCamera = {
            node: makeNode('Live Scene Gizmo Camera', new (jest.requireMock('cc').Vec3)(0, 0, 40)),
            enabledInHierarchy: true,
            projection: 1,
            priority: 1000,
            fov: 45,
            near: 0.1,
            far: 1000,
            clearFlags: 6,
            visibility: 8,
            rect: new (jest.requireMock('cc').Rect)(0.7, 0.8, 0.2, 0.2),
        };
        jest.spyOn(service as any, '_findSceneCameras').mockReturnValue([mainCamera, uiCamera]);
        Service.Gizmo = { sceneGizmoCamera };

        const contentFramings = (service as any)._resolveFramings({ includeGizmos: true }, 1200, 600);
        const reference = (service as any)._topmostFraming(contentFramings);
        const overlays = (service as any)._resolveGizmoOverlayFramings(
            reference,
            { includeGizmos: true },
            1200,
            600,
        );

        expect(contentFramings.map((framing: any) => framing.info.nodeName)).toEqual([
            'Main Camera',
            'UI Camera',
        ]);
        expect(reference.info.nodeName).toBe('UI Camera');
        expect(overlays).toHaveLength(2);
        expect(overlays.map((framing: any) => framing.info.nodeName)).toEqual([
            'Editor UIGizmoCamera',
            'Scene Gizmo Camera',
        ]);
        expect(overlays.map((framing: any) => framing.runtimeCameraName)).toEqual([
            'Editor UIGizmoCamera',
            'Scene Gizmo Camera',
        ]);
        expect(overlays[0].params).toMatchObject({
            position: { x: 640, y: 360, z: 1000 },
            projection: 0,
            orthoHeight: 360,
            priority: 102,
            clearFlags: 0,
            visibility: 20,
            rect: { x: 0, y: 0, width: 1, height: 1 },
            usePostProcess: false,
        });
        expect(overlays[1].params).toMatchObject({
            clearFlags: 6,
            visibility: 8,
            rect: { width: 1 / 6, height: 1 / 6 },
        });
    });

    it('rejects an explicit game camera combined with editor gizmos', () => {
        const service = new ScreenshotService();

        expect(() => (service as any)._resolveFramings({
            camera: 'Main Camera',
            includeGizmos: true,
        })).toThrow('不能与 camera 同时指定');
    });

    it('omits the 3D scene-axis camera in the current 2D editor view', () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const { Quat, Rect, Vec3 } = jest.requireMock('cc');
        const node = {
            name: 'Editor Camera',
            getWorldPosition: () => new Vec3(0, 0, 10),
            getWorldRotation: () => new Quat(),
        };
        Service.Gizmo = {
            is2D: true,
            sceneGizmoCamera: { node: {}, enabledInHierarchy: true },
        };
        const params = (service as any)._paramsFromComponent({
            node,
            projection: 0,
            priority: 0,
            rect: new Rect(0, 0, 1, 1),
        });
        const reference = {
            info: (service as any)._cameraInfoFromParams(params, 'scene', 'Canvas Camera'),
            source: 'scene',
            params,
        };

        const framings = (service as any)._resolveGizmoOverlayFramings(
            reference,
            { includeGizmos: true },
            800,
            600,
        );

        expect(framings).toHaveLength(1);
        expect(framings[0].info.nodeName).toBe('Editor UIGizmoCamera');
    });

    it('temporarily aligns the editor camera to the content framing and restores it', () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const { Quat, Rect, Vec3 } = jest.requireMock('cc');
        const previousState = {
            is2D: false,
            position: { x: 0, y: 0, z: 20 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            projection: 1,
            fov: 45,
            fovAxis: 0,
            orthoHeight: 10,
            near: 0.1,
            far: 1000,
        };
        const applyScreenshotState = jest.fn();
        Service.Camera = {
            getScreenshotState: jest.fn(() => previousState),
            applyScreenshotState,
        };
        const reference = {
            info: { nodeName: 'Canvas Camera' },
            source: 'scene',
            params: {
                position: new Vec3(640, 360, 1000),
                rotation: new Quat(),
                projection: 0,
                priority: 100,
                fov: 60,
                fovAxis: 1,
                orthoHeight: 360,
                near: 0.01,
                far: 10000,
                clearFlags: 1,
                clearDepth: 1,
                clearStencil: 0,
                visibility: 0xffff,
                rect: new Rect(0, 0, 1, 1),
            },
        };

        const restore = (service as any)._alignEditorCameraForGizmoCapture(reference);

        expect(applyScreenshotState).toHaveBeenCalledWith(expect.objectContaining({
            is2D: true,
            position: { x: 640, y: 360, z: 1000 },
            projection: 0,
            fovAxis: 1,
            orthoHeight: 360,
        }));
        restore();
        expect(applyScreenshotState).toHaveBeenLastCalledWith(previousState);
    });

    it('rebinds and refreshes selected gizmos before capture', () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const selectedNode = {};
        Service.Selection = { query: jest.fn(() => ['/Canvas/Button']) };
        Service.Gizmo = {
            onSelectionSelect: jest.fn(),
            querySelectNodes: jest.fn(() => [selectedNode]),
            showAllGizmoOfNode: jest.fn(),
            refreshSelectedGizmos: jest.fn(),
            onUpdate: jest.fn(),
        };

        (service as any)._refreshEditorGizmosForCapture();

        expect(Service.Gizmo.onSelectionSelect).toHaveBeenCalledWith('/Canvas/Button');
        expect(Service.Gizmo.showAllGizmoOfNode).toHaveBeenCalledWith(selectedNode);
        expect(Service.Gizmo.refreshSelectedGizmos).toHaveBeenCalledTimes(1);
        expect(Service.Gizmo.onUpdate).toHaveBeenCalledWith(0);
    });

    it('automatically includes editor gizmos when a node is selected', () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        Service.Selection = { query: jest.fn(() => ['/Canvas/Button']) };

        expect((service as any)._shouldIncludeEditorGizmos({})).toBe(true);
        expect((service as any)._shouldIncludeEditorGizmos({ includeGizmos: false })).toBe(false);
        expect((service as any)._shouldIncludeEditorGizmos({ camera: 'Main Camera' })).toBe(false);
    });

    it('restores the browser editor selection in the headless worker before capture', async () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const clear = jest.fn();
        const select = jest.fn();
        const applyScreenshotState = jest.fn();
        Service.Editor = { getCurrentEditorUuid: jest.fn(() => 'scene-uuid') };
        Service.Camera = { applyScreenshotState };
        Service.Selection = { query: jest.fn(() => []), clear, select };

        const camera = { is2D: true, orthoHeight: 360 };
        await (service as any)._applyBrowserEditorStateForCapture({
            uuid: 'scene-uuid',
            selection: ['Canvas/GreenBtn'],
            camera,
        });

        expect(applyScreenshotState).toHaveBeenCalledWith(camera);
        expect(clear).toHaveBeenCalledTimes(1);
        expect(select).toHaveBeenCalledWith('Canvas/GreenBtn');
    });

    it('applies unsaved browser node transforms before capture', async () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const previousEditorExtends = (globalThis as any).EditorExtends;
        const setPosition = jest.fn();
        const setRotation = jest.fn();
        const setScale = jest.fn();
        const updateWorldTransform = jest.fn();
        const button: any = {
            uuid: 'button-uuid',
            name: 'Button',
            layer: 0,
            children: [],
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
            setPosition,
            setRotation,
            setScale,
            updateWorldTransform,
        };
        const root: any = {
            uuid: 'scene-uuid',
            name: 'Scene',
            layer: 0,
            children: [button],
            parent: null,
        };
        button.parent = root;
        (globalThis as any).EditorExtends = {
            Node: { getNode: jest.fn(() => button) },
        };
        Service.Editor = {
            getCurrentEditorUuid: jest.fn(() => 'scene-uuid'),
            getCurrentEditorType: jest.fn(() => 'scene'),
            getRootNode: jest.fn(() => root),
        };
        Service.Camera = {};
        Service.Selection = { query: jest.fn(() => []) };

        try {
            await (service as any)._applyBrowserEditorStateForCapture({
                uuid: 'scene-uuid',
                nodeTransforms: [{
                    uuid: 'button-uuid',
                    path: 'Canvas/Button',
                    revision: 1,
                    position: { x: -360, y: 140, z: 0 },
                    rotation: { x: 0, y: 0, z: 0, w: 1 },
                    scale: { x: 1.5, y: 1.5, z: 1 },
                }],
            });

            expect(setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: -360, y: 140, z: 0 }));
            expect(setRotation).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 0, z: 0, w: 1 }));
            expect(setScale).toHaveBeenCalledWith(expect.objectContaining({ x: 1.5, y: 1.5, z: 1 }));
            expect(updateWorldTransform).toHaveBeenCalledTimes(1);
        } finally {
            (globalThis as any).EditorExtends = previousEditorExtends;
        }
    });

    it('restores unsaved node and component inspector dumps before capture', async () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const dumpUtil = jest.requireMock('../scene-process/service/dump').default;
        const previousEditorExtends = (globalThis as any).EditorExtends;
        const component = { uuid: 'sprite-uuid' };
        const node: any = {
            uuid: 'button-uuid',
            name: 'Button',
            layer: 0,
            children: [],
            components: [component],
            updateWorldTransform: jest.fn(),
        };
        (globalThis as any).EditorExtends = {
            Node: { getNode: jest.fn(() => node) },
        };
        Service.Editor = { getCurrentEditorUuid: jest.fn(() => 'scene-uuid') };
        Service.Camera = {};
        Service.Selection = { query: jest.fn(() => []) };
        const componentDump = {
            type: 'cc.Sprite',
            value: { uuid: { value: 'sprite-uuid' }, color: { value: '#ff0000' } },
        };
        const nodeDump = {
            active: { value: true },
            __comps__: [componentDump],
        };

        try {
            await (service as any)._applyBrowserEditorStateForCapture({
                uuid: 'scene-uuid',
                nodeSnapshots: [{
                    uuid: 'button-uuid',
                    path: 'Canvas/Button',
                    revision: 2,
                    dump: nodeDump,
                }],
            });

            expect(dumpUtil.restoreNodeSnapshotProperties).toHaveBeenCalledWith(node, nodeDump);
            expect(dumpUtil.restoreComponentSnapshotProperties).toHaveBeenCalledWith(component, componentDump);
            expect(node.updateWorldTransform).toHaveBeenCalledTimes(1);
        } finally {
            (globalThis as any).EditorExtends = previousEditorExtends;
        }
    });

    it('does not apply a browser selection to a different screenshot scene', async () => {
        const service = new ScreenshotService();
        const { Service } = jest.requireMock('../scene-process/service/core');
        const clear = jest.fn();
        const select = jest.fn();
        Service.Editor = { getCurrentEditorUuid: jest.fn(() => 'target-scene-uuid') };
        Service.Selection = { query: jest.fn(() => []), clear, select };

        await (service as any)._applyBrowserEditorStateForCapture({
            uuid: 'browser-scene-uuid',
            selection: ['Canvas/GreenBtn'],
        });

        expect(clear).not.toHaveBeenCalled();
        expect(select).not.toHaveBeenCalled();
    });

    it('tears down a temporary camera when parameter assignment fails', () => {
        const service = new ScreenshotService();
        const tempCamera: any = { enabled: true };
        Object.defineProperty(tempCamera, 'postProcess', {
            set() {
                throw new Error('post-process assignment failed');
            },
        });
        jest.spyOn(Node.prototype as any, 'addComponent').mockReturnValue(tempCamera);
        const teardown = jest.spyOn(service as any, '_teardownCamera');
        const framing: any = {
            info: { nodeName: 'Main Camera' },
            params: {
                position: { x: 0, y: 0, z: 10 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                projection: 1,
                priority: 0,
                fov: 45,
                fovAxis: 0,
                orthoHeight: 10,
                near: 0.1,
                far: 1000,
                clearFlags: 1,
                clearDepth: 1,
                clearStencil: 0,
                visibility: 0xffffffff,
                rect: { x: 0, y: 0, width: 1, height: 1 },
                postProcess: {},
            },
        };

        expect(() => (service as any)._createTemporaryCamera({}, framing, 0))
            .toThrow('post-process assignment failed');
        expect(teardown).toHaveBeenCalledTimes(1);
        const [node, component] = teardown.mock.calls[0];
        expect(component).toBe(tempCamera);
        expect((node as any).parent).toBeNull();
        expect((node as any).destroyed).toBe(true);
    });

    it('still detaches and destroys a temporary node when render-scene cleanup fails', () => {
        const service = new ScreenshotService();
        const node = new Node('Temporary Camera') as any;
        node.setParent({});
        const component = {
            enabled: true,
            camera: {
                enabled: true,
                scene: {
                    removeCamera() {
                        throw new Error('remove camera failed');
                    },
                },
            },
        };
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        try {
            (service as any)._teardownCamera(node, component);

            expect(component.enabled).toBe(false);
            expect(node.parent).toBeNull();
            expect(node.destroyed).toBe(true);
            expect(warn).toHaveBeenCalledWith(
                '[Screenshot] detach temp camera from render scene failed:',
                expect.any(Error),
            );
        } finally {
            warn.mockRestore();
        }
    });
});
