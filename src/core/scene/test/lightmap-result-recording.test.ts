const mockGetScene = jest.fn();
const mockMeshRenderer = class MeshRenderer {};
const mockTerrain = class Terrain {};
const mockBake = jest.fn();
const mockCommit = jest.fn();
const mockRollback = jest.fn();
const mockUndo = {
    beginRecording: jest.fn(() => 'recording'),
    endRecording: jest.fn(async () => undefined),
    cancelRecording: jest.fn(),
    createCheckpoint: jest.fn(() => ({ commandId: 'recording', generation: 1 })),
    markSaved: jest.fn(),
    commitLightmapRebake: jest.fn(),
};
const mockSave = jest.fn(async () => undefined);
jest.mock('cc', () => ({ director: { getScene: mockGetScene }, MeshRenderer: mockMeshRenderer, Terrain: mockTerrain }));
jest.mock('../scene-process/service/core', () => ({
    BaseService: class { broadcast() {} }, register: () => () => undefined,
    Service: { Undo: mockUndo, Editor: { save: mockSave }, Engine: { repaintInEditMode: async () => undefined } },
}));
jest.mock('../scene-process/service/baking/lightfx/baker', () => ({ lightFXCoordinator: { bake: mockBake, commit: mockCommit, rollback: mockRollback } }));
jest.mock('../scene-process/service/baking/lightfx/host', () => ({ lightFXBakeHost: {
    reserveSceneOperation: async () => ({ transactionId: 'owner' }), releaseSceneOperation: async () => undefined,
} }));
jest.mock('../scene-process/service/baking/lightfx/settings', () => ({ createDefaultLightFXSettings: () => ({}) }));
jest.mock('../scene-process/service/preview/asset-reload', () => ({ loadPreviewAsset: jest.fn() }));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: jest.fn() } }));
import { LightmapBakeService } from '../scene-process/service/lightmap-bake';

function fixture() {
    const oldTexture = { uuid: 'old-texture' };
    const model = { uuid: 'mesh', node: {}, bakeSettings: { texture: oldTexture, uvParam: { clone: () => ({ x: 1, y: 2, z: 3, w: 4 }) } }, _updateLightmap: jest.fn() };
    const terrain = { uuid: 'terrain', lightMapSize: 64, _lightmapInfos: [
        { texture: oldTexture, UOff: 1, VOff: 2, UScale: 3, VScale: 4 },
        { texture: oldTexture, UOff: 5, VOff: 6, UScale: 7, VScale: 8 },
    ], _resetLightmap: jest.fn(), _updateLightmap: jest.fn() };
    const scene = { uuid: 'scene', name: 'test', globals: { bakedWithHighpLightmap: false, bakedWithStationaryMainLight: false },
        children: [], getComponents: (type: unknown) => type === mockMeshRenderer ? [model] : type === mockTerrain ? [terrain] : [],
    };
    mockGetScene.mockReturnValue(scene);
    const service = new LightmapBakeService();
    jest.spyOn(service as any, 'querySceneUrl').mockResolvedValue('db://assets/test.scene');
    const texture = { uuid: 'new-texture', isValid: true };
    jest.spyOn(service as any, 'loadOutputTextures').mockResolvedValue(new Map([['mesh:0', texture], ['terrain:0', texture]]));
    mockBake.mockResolvedValue({ models: [model], terrains: [terrain], operationId: 'operation', stationaryMainLight: true, textureUrls: [], result: {
        meshes: [{ id: 0, index: 0, offset: [0.1, 0.2], scale: [0.3, 0.4] }],
        terrains: [{ id: 0, index: 0, blockId: 1, offset: [0.5, 0.6], scale: [0.7, 0.8] }],
    } });
    return { service, model, terrain, texture, oldTexture };
}

describe('Lightmap result recording targets', () => {
    beforeEach(() => jest.clearAllMocks());
    it.each([false, true])('retains Mesh and Terrain rebake results without adding Undo (save=%s)', async saveScene => {
        const f = fixture();
        await f.service.bake({ saveScene });
        expect(mockUndo.beginRecording).not.toHaveBeenCalled();
        expect(f.model._updateLightmap).toHaveBeenCalledWith(f.texture, 0.1, 0.2, 0.3, 0.4);
        expect(f.terrain._updateLightmap).toHaveBeenCalledWith(1, f.texture, 0.5, 0.6, 0.7, 0.8);
        expect(mockUndo.endRecording).not.toHaveBeenCalled();
        expect(mockUndo.commitLightmapRebake).toHaveBeenCalledWith(expect.any(Function));
        expect(mockCommit).toHaveBeenCalledWith('operation');
        expect(mockSave).toHaveBeenCalledTimes(saveScene ? 1 : 0);
        expect(mockUndo.markSaved).not.toHaveBeenCalled();
    });
    it.each([false, true])('deduplicates multiple Terrain blocks and records all cleared bindings (save=%s)', async saveScene => {
        const f = fixture();
        await expect(f.service.clearBake({ saveScene })).resolves.toEqual({ clearedCount: 3 });
        expect(mockUndo.beginRecording).toHaveBeenCalledWith(['mesh', 'terrain', 'scene'], { label: 'Clear lightmap' });
        expect(f.model._updateLightmap).toHaveBeenCalledWith(null, 0, 0, 0, 0);
        expect(f.terrain._updateLightmap).toHaveBeenCalledWith(0, null, 0, 0, 0, 0);
        expect(f.terrain._updateLightmap).toHaveBeenCalledWith(1, null, 0, 0, 0, 0);
        expect(mockUndo.endRecording).toHaveBeenCalledWith('recording');
        expect(mockSave).toHaveBeenCalledTimes(saveScene ? 1 : 0);
        expect(mockUndo.markSaved).not.toHaveBeenCalled();
    });
    it('retains cleared bindings and history if saving fails', async () => {
        const f = fixture();
        mockSave.mockRejectedValueOnce(new Error('disk unavailable'));
        await expect(f.service.clearBake()).rejects.toThrow('disk unavailable');
        expect(mockUndo.cancelRecording).not.toHaveBeenCalled();
        expect(mockUndo.endRecording).toHaveBeenCalledWith('recording');
        expect(mockUndo.markSaved).not.toHaveBeenCalled();
        expect(f.model._updateLightmap).toHaveBeenLastCalledWith(null, 0, 0, 0, 0);
        expect(f.terrain._updateLightmap).toHaveBeenLastCalledWith(1, null, 0, 0, 0, 0);
    });

    it('resolves reloaded Terrain blocks by identity, clears obsolete blocks and leaves unrelated objects alone', async () => {
        const f = fixture();
        f.terrain._resetLightmap.mockImplementation(() => { f.terrain._lightmapInfos = []; });
        f.terrain._updateLightmap.mockImplementation((blockId, texture, UOff, VOff, UScale, VScale) => {
            f.terrain._lightmapInfos[blockId] = { texture, UOff, VOff, UScale, VScale };
        });
        await f.service.bake({ saveScene: false, highp: true });
        const oldScene = mockGetScene();
        const replacement = { ...f.terrain, _lightmapInfos: [
            { texture: f.oldTexture, UOff: 1, VOff: 2, UScale: 3, VScale: 4 },
            { texture: f.oldTexture, UOff: 5, VOff: 6, UScale: 7, VScale: 8 },
        ], _updateLightmap: jest.fn() };
        const unrelated = { ...f.model, uuid: 'unrelated', _updateLightmap: jest.fn() };
        const current = { ...oldScene, globals: { bakedWithHighpLightmap: false, bakedWithStationaryMainLight: false },
            getComponents: (type: unknown) => type === mockMeshRenderer ? [unrelated] : type === mockTerrain ? [replacement] : [],
        };
        mockGetScene.mockReturnValue(current);
        await mockUndo.commitLightmapRebake.mock.calls[0][0]();
        expect(replacement._updateLightmap.mock.calls).toEqual([
            [0, null, 0, 0, 0, 0], [1, null, 0, 0, 0, 0], [1, f.texture, 0.5, 0.6, 0.7, 0.8],
        ]);
        expect(unrelated._updateLightmap).not.toHaveBeenCalled();
        expect(current.globals).toEqual({ bakedWithHighpLightmap: true, bakedWithStationaryMainLight: true });
    });
});
