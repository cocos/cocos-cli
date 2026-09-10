const mockGetScene = jest.fn();
const mockQueryLightmapTextureInfo = jest.fn();
const mockMeshRenderer = class MeshRenderer {};
const mockTerrain = class Terrain {};

jest.mock('cc', () => ({
    director: { getScene: mockGetScene },
    MeshRenderer: mockMeshRenderer,
    Scene: class Scene {},
    Terrain: mockTerrain,
    Texture2D: class Texture2D {},
}));
jest.mock('../scene-process/service/baking/lightfx/baker', () => ({
    lightFXCoordinator: {},
}));
jest.mock('../scene-process/service/baking/lightfx/host', () => ({
    lightFXBakeHost: {
        queryLightmapTextureInfo: (...args: unknown[]) => mockQueryLightmapTextureInfo(...args),
    },
}));
jest.mock('../scene-process/service/baking/lightfx/settings', () => ({
    createDefaultLightFXSettings: jest.fn(),
}));
jest.mock('../scene-process/service/preview/asset-reload', () => ({
    loadPreviewAsset: jest.fn(),
}));
jest.mock('../scene-process/rpc', () => ({
    Rpc: { getInstance: jest.fn() },
}));

import { LightmapBakeService } from '../scene-process/service/lightmap-bake';

function node(models: unknown[] = [], terrains: unknown[] = [], children: unknown[] = []) {
    return {
        children,
        getComponents: jest.fn((type) => type === mockMeshRenderer ? models : type === mockTerrain ? terrains : []),
    };
}

describe('LightmapBakeService bake information', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('queries unique texture metadata from the current scene bindings', async () => {
        const meshTexture = { uuid: '11111111-1111-4111-8111-111111111111@6c48a' };
        const terrainTexture = { uuid: '22222222-2222-4222-8222-222222222222@6c48a' };
        const scene = {
            ...node([], [], [
                node([
                    { bakeSettings: { texture: meshTexture }, get mesh() { throw new Error('Result queries must not scan bake inputs'); } },
                    { bakeSettings: { texture: meshTexture } },
                ]),
                node([], [{
                    _lightmapInfos: [
                        { texture: meshTexture },
                        { texture: terrainTexture },
                    ],
                }]),
            ]),
            globals: {
                bakedWithHighpLightmap: true,
                bakedWithStationaryMainLight: false,
            },
        };
        mockGetScene.mockReturnValue(scene);
        const textureInfo = {
            textures: [{
                uuid: '11111111-1111-4111-8111-111111111111',
                url: 'db://assets/Lightmap/lightmap/LFX_Mesh_0000.png',
                filename: 'LFX_Mesh_0000.png',
                size: 128,
                createdAt: 1,
                modifiedAt: 2,
            }],
            missingTextureUuids: ['22222222-2222-4222-8222-222222222222'],
        };
        mockQueryLightmapTextureInfo.mockResolvedValue(textureInfo);
        const service = new LightmapBakeService();
        jest.spyOn(service as any, 'querySceneUrl').mockResolvedValue('db://assets/Lightmap.scene');

        await expect(service.queryBakeInfo()).resolves.toEqual({
            sceneUrl: 'db://assets/Lightmap.scene',
            baked: true,
            meshCount: 2,
            terrainCount: 1,
            highp: true,
            stationaryMainLight: false,
            ...textureInfo,
        });
        expect(mockQueryLightmapTextureInfo).toHaveBeenCalledWith({
            uuids: [meshTexture.uuid, terrainTexture.uuid],
        });
    });
});
