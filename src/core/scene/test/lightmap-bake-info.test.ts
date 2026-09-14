const mockGetScene = jest.fn();
const mockQueryLightmapTextureInfo = jest.fn();
const mockRequest = jest.fn();
const mockQueryCurrent = jest.fn();
let mockSession = { uuid: 'scene-asset-uuid' as string | null, generation: 0 };
let mockEditorType = 'scene';
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
    Rpc: { getInstance: () => ({ request: mockRequest }) },
}));
jest.mock('../scene-process/service/core', () => ({
    BaseService: class {},
    register: () => () => undefined,
    Service: { Editor: {
        queryCurrent: mockQueryCurrent,
        getCurrentEditorType: () => mockEditorType,
        getEditorSession: () => ({ ...mockSession }),
        isCurrentEditorSession: (session: typeof mockSession) => session.uuid === mockSession.uuid
            && session.generation === mockSession.generation && mockSession.uuid !== null,
    } },
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
        jest.resetAllMocks();
        mockSession = { uuid: 'scene-asset-uuid', generation: 0 };
        mockEditorType = 'scene';
        mockQueryCurrent.mockImplementation(() => { throw new Error('Result queries must not encode the scene'); });
        mockRequest.mockResolvedValue({ uuid: mockSession.uuid, url: 'db://assets/Lightmap.scene' });
        mockQueryLightmapTextureInfo.mockResolvedValue({ textures: [], missingTextureUuids: [] });
        mockGetScene.mockReturnValue({ ...node(), globals: {
            get lightProbeInfo() { throw new Error('Result queries must not traverse probe data'); },
        } });
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
                get lightProbeInfo() { throw new Error('Result queries must not traverse probe data'); },
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
        expect(mockRequest).toHaveBeenCalledWith('assetManager', 'queryAssetInfo', ['scene-asset-uuid']);
        expect(mockQueryCurrent).not.toHaveBeenCalled();
    });

    it('uses current asset metadata on repeated queries without encoding probe data', async () => {
        const service = new LightmapBakeService();
        await expect(service.queryBakeInfo()).resolves.toMatchObject({ sceneUrl: 'db://assets/Lightmap.scene', baked: false });
        mockRequest.mockResolvedValue({ uuid: mockSession.uuid, url: 'db://assets/Renamed.scene' });
        await expect(service.queryBakeInfo()).resolves.toMatchObject({ sceneUrl: 'db://assets/Renamed.scene', baked: false });
        expect(mockRequest).toHaveBeenCalledTimes(2);
        expect(mockQueryCurrent).not.toHaveBeenCalled();
    });

    it('rejects a closed scene before querying assets', async () => {
        mockGetScene.mockReturnValue(null);
        await expect(new LightmapBakeService().queryBakeInfo()).rejects.toThrow('No scene is currently open.');
        expect(mockRequest).not.toHaveBeenCalled();
        expect(mockQueryLightmapTextureInfo).not.toHaveBeenCalled();
    });

    it.each(['prefab', 'unknown'])('does not treat a %s editor as a saved scene', async type => {
        mockEditorType = type;
        await expect(new LightmapBakeService().queryBakeInfo()).rejects.toThrow('saved scene asset');
        expect(mockRequest).not.toHaveBeenCalled();
        expect(mockQueryLightmapTextureInfo).not.toHaveBeenCalled();
    });

    it.each([null, { url: 'db://assets/Model.prefab' }])('rejects missing or non-scene asset metadata: %p', async info => {
        mockRequest.mockResolvedValue(info);
        await expect(new LightmapBakeService().queryBakeInfo()).rejects.toThrow('saved scene asset');
        expect(mockQueryLightmapTextureInfo).not.toHaveBeenCalled();
    });

    it('rejects a same-UUID reload during the asset metadata lookup', async () => {
        mockRequest.mockImplementation(async () => {
            mockSession.generation++;
            return { url: 'db://assets/Lightmap.scene' };
        });
        await expect(new LightmapBakeService().queryBakeInfo()).rejects.toThrow('source scene changed');
        expect(mockQueryLightmapTextureInfo).not.toHaveBeenCalled();
    });

    it('rejects a replaced Scene instance even if its session identifiers are unchanged', async () => {
        mockRequest.mockImplementation(async () => {
            mockGetScene.mockReturnValue({ ...node(), globals: {} });
            return { uuid: mockSession.uuid, url: 'db://assets/Lightmap.scene' };
        });
        await expect(new LightmapBakeService().queryBakeInfo()).rejects.toThrow('source scene changed');
        expect(mockQueryLightmapTextureInfo).not.toHaveBeenCalled();
    });

    it('rejects a scene without an open editor session before querying assets', async () => {
        mockSession.uuid = null;
        await expect(new LightmapBakeService().queryBakeInfo()).rejects.toThrow('source scene changed');
        expect(mockRequest).not.toHaveBeenCalled();
        expect(mockQueryLightmapTextureInfo).not.toHaveBeenCalled();
    });

    it('propagates asset lookup failures without falling back to a scene dump', async () => {
        mockRequest.mockRejectedValue(new Error('Asset metadata unavailable'));
        await expect(new LightmapBakeService().queryBakeInfo()).rejects.toThrow('Asset metadata unavailable');
        expect(mockQueryCurrent).not.toHaveBeenCalled();
        expect(mockQueryLightmapTextureInfo).not.toHaveBeenCalled();
    });

    it('does not combine old bindings with a new scene after texture metadata arrives', async () => {
        mockQueryLightmapTextureInfo.mockImplementation(async () => {
            mockSession = { uuid: 'other-scene-uuid', generation: 1 };
            mockGetScene.mockReturnValue({ ...node(), globals: {} });
            return { textures: [], missingTextureUuids: [] };
        });
        await expect(new LightmapBakeService().queryBakeInfo()).rejects.toThrow('source scene changed');
        expect(mockQueryCurrent).not.toHaveBeenCalled();
    });
});
