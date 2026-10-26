const mockAsset = { name: 'Dragged asset', _uuid: 'asset-uuid' };

class MockMeshRenderer {
    mesh: object | null = null;
}

class MockArmatureDisplay {
    dragonAsset: object | null = null;
    dragonAtlasAsset: object | null = null;
}

class MockSkeleton {
    skeletonData: object | null = null;
}

class MockNode {
    layer = 0;
    private readonly components: object[] = [];

    constructor(public name: string) {}

    addComponent<T extends object>(component: new () => T): T {
        if (!component) {
            throw new TypeError('getComponent: Type must be non-nil');
        }
        const instance = new component();
        this.components.push(instance);
        return instance;
    }

    getComponent<T extends object>(component: new () => T): T | null {
        return this.components.find((instance): instance is T => instance instanceof component) ?? null;
    }
}

jest.mock('cc', () => ({
    Node: MockNode,
    MeshRenderer: MockMeshRenderer,
    dragonBones: { ArmatureDisplay: MockArmatureDisplay },
    sp: { Skeleton: MockSkeleton },
    instantiate: (asset: { name: string }) => new MockNode(asset.name),
    Layers: { Enum: { UI_2D: 1 << 25 } },
    assetManager: {
        assets: { remove: jest.fn() },
        loadAny: (_uuid: string, callback: (error: Error | null, asset: object) => void) =>
            callback(null, mockAsset),
    },
}));
jest.mock('../scene-process/service/core/decorator', () => ({ Service: {} }));
jest.mock('../scene-process/rpc', () => ({ Rpc: {} }));

import { Layers, MeshRenderer, Node, dragonBones, instantiate, sp } from 'cc';
import { createNodeByAsset, queryCanvasRequiredByAsset } from '../scene-process/service/node/node-create';

describe('asset node creation with the engine module exports', () => {
    const previousCC = Object.getOwnPropertyDescriptor(globalThis, 'cc');

    beforeAll(() => {
        // The legacy global exposes only a subset of the loaded engine module.
        Object.defineProperty(globalThis, 'cc', {
            configurable: true,
            writable: true,
            value: { Animation: class Animation {}, instantiate },
        });
    });

    afterAll(() => {
        if (previousCC) {
            Object.defineProperty(globalThis, 'cc', previousCC);
        } else {
            Reflect.deleteProperty(globalThis, 'cc');
        }
    });

    it('creates a MeshRenderer and binds the dragged mesh', async () => {
        const result = await createNodeByAsset({ uuid: mockAsset._uuid, type: 'cc.Mesh' });

        expect({
            mesh: result.node.getComponent(MeshRenderer)?.mesh,
            canvasRequired: result.canvasRequired,
        }).toEqual({ mesh: mockAsset, canvasRequired: false });
    });

    it.each([
        {
            type: 'dragonBones.DragonBonesAsset',
            boundAsset: (node: Node) => node.getComponent(dragonBones.ArmatureDisplay)?.dragonAsset,
        },
        {
            type: 'dragonBones.DragonBonesAtlasAsset',
            boundAsset: (node: Node) => node.getComponent(dragonBones.ArmatureDisplay)?.dragonAtlasAsset,
        },
        {
            type: 'sp.SkeletonData',
            boundAsset: (node: Node) => node.getComponent(sp.Skeleton)?.skeletonData,
        },
    ])('creates $type with the Canvas requirement reported by preflight', async ({ type, boundAsset }) => {
        const info = { uuid: mockAsset._uuid, type };
        const preflightCanvasRequired = await queryCanvasRequiredByAsset(info);
        const result = await createNodeByAsset(info);

        expect({
            asset: boundAsset(result.node),
            layer: result.node.layer,
            preflightCanvasRequired,
            canvasRequired: result.canvasRequired,
        }).toEqual({
            asset: mockAsset,
            layer: Layers.Enum.UI_2D,
            preflightCanvasRequired: true,
            canvasRequired: true,
        });
    });
});
