const mockGetScene = jest.fn();
const mockMeshRenderer = class MeshRenderer {};
const mockTerrain = class Terrain {};
const mockBake = jest.fn();
const mockCommit = jest.fn();
const mockRollback = jest.fn();
const mockRemoveLightmapAssets = jest.fn();
const mockQueryCapabilities = jest.fn(async (): Promise<{ lightmapAssetCleanupVersion?: 1 }> => ({ lightmapAssetCleanupVersion: 1 }));
const mockUndo = {
    beginRecording: jest.fn(() => 'recording'),
    endRecording: jest.fn(async () => undefined),
    cancelRecording: jest.fn(),
    clearHistory: jest.fn(),
    createCheckpoint: jest.fn(() => ({ commandId: 'recording', generation: 1 })),
    markSaved: jest.fn(),
};
const mockSave = jest.fn(async () => undefined);
const mockQuerySceneSerializedData = jest.fn(async () => '[]');
jest.mock('cc', () => ({ director: { getScene: mockGetScene }, MeshRenderer: mockMeshRenderer, Terrain: mockTerrain }));
jest.mock('../scene-process/service/core', () => ({
    BaseService: class { broadcast() {} }, register: () => () => undefined,
    Service: { Undo: mockUndo, Editor: { save: mockSave, querySceneSerializedData: mockQuerySceneSerializedData }, Engine: { repaintInEditMode: async () => undefined } },
}));
jest.mock('../scene-process/service/baking/lightfx/baker', () => ({ lightFXCoordinator: { bake: mockBake, commit: mockCommit, rollback: mockRollback, removeLightmapAssets: mockRemoveLightmapAssets } }));
jest.mock('../scene-process/service/baking/lightfx/host', () => ({ lightFXBakeHost: {
    queryCapabilities: mockQueryCapabilities,
    reserveSceneOperation: async () => ({ transactionId: 'owner' }), releaseSceneOperation: async () => undefined,
} }));
jest.mock('../scene-process/service/baking/lightfx/settings', () => ({ createDefaultLightFXSettings: () => ({}) }));
jest.mock('../scene-process/service/preview/asset-reload', () => ({ loadPreviewAsset: jest.fn() }));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: jest.fn() } }));
import { LightmapBakeService } from '../scene-process/service/lightmap-bake';
import { deletedLightmapAssets } from '../scene-process/service/baking/lightfx/deleted-lightmap-assets';

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
    const texture = { uuid: 'new-texture' };
    jest.spyOn(service as any, 'loadOutputTextures').mockResolvedValue(new Map([['mesh:0', texture], ['terrain:0', texture]]));
    mockBake.mockResolvedValue({ models: [model], terrains: [terrain], operationId: 'operation', stationaryMainLight: true, textureUrls: [], result: {
        meshes: [{ id: 0, index: 0, offset: [0.1, 0.2], scale: [0.3, 0.4] }],
        terrains: [{ id: 0, index: 0, blockId: 1, offset: [0.5, 0.6], scale: [0.7, 0.8] }],
    } });
    return { service, scene, model, terrain, texture, oldTexture };
}

describe('Lightmap result recording targets', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockQueryCapabilities.mockResolvedValue({ lightmapAssetCleanupVersion: 1 });
        mockQuerySceneSerializedData.mockResolvedValue('[]');
        mockRemoveLightmapAssets.mockResolvedValue({ deletedTextureUuids: [], retainedTextureUuids: [], failures: [] });
    });
    it.each([false, true])('records Mesh and Terrain components before scene flags for Bake (save=%s)', async saveScene => {
        const f = fixture();
        await f.service.bake({ saveScene });
        expect(mockUndo.beginRecording).toHaveBeenCalledWith(['mesh', 'terrain', 'scene'], { label: 'Bake lightmap' });
        expect(f.model._updateLightmap).toHaveBeenCalledWith(f.texture, 0.1, 0.2, 0.3, 0.4);
        expect(f.terrain._updateLightmap).toHaveBeenCalledWith(1, f.texture, 0.5, 0.6, 0.7, 0.8);
        expect(mockUndo.endRecording).toHaveBeenCalledWith('recording');
        expect(mockCommit).toHaveBeenCalledWith('operation');
        expect(mockSave).toHaveBeenCalledTimes(saveScene ? 1 : 0);
        expect(mockUndo.markSaved).not.toHaveBeenCalled();
    });
    it.each([false, true])('deduplicates multiple Terrain blocks and records all cleared bindings (save=%s)', async saveScene => {
        const f = fixture();
        await expect(f.service.clearBake({ saveScene })).resolves.toEqual({
            clearedCount: 3, deletedAssetCount: 0, retainedAssetCount: 0, failedAssetCount: 0,
        });
        expect(mockUndo.beginRecording).toHaveBeenCalledWith(['mesh', 'terrain', 'scene'], { label: 'Clear lightmap' });
        expect(f.model._updateLightmap).toHaveBeenCalledWith(null, 0, 0, 0, 0);
        expect(f.terrain._updateLightmap).toHaveBeenCalledWith(0, null, 0, 0, 0, 0);
        expect(f.terrain._updateLightmap).toHaveBeenCalledWith(1, null, 0, 0, 0, 0);
        expect(mockUndo.endRecording).toHaveBeenCalledWith('recording');
        expect(mockSave).toHaveBeenCalledTimes(saveScene ? 1 : 0);
        expect(mockUndo.markSaved).not.toHaveBeenCalled();
    });
    it('saves before exact deletion and cancels only the Clear recording', async () => {
        const f = fixture();
        mockRemoveLightmapAssets.mockResolvedValueOnce({
            deletedTextureUuids: ['old-texture'], retainedTextureUuids: ['shared'], failures: [{ uuid: 'failed', reason: 'busy' }],
        });
        await expect(f.service.clearBake({ deleteAssets: true })).resolves.toEqual({
            clearedCount: 3, deletedAssetCount: 1, retainedAssetCount: 1, failedAssetCount: 1,
        });
        expect(mockSave).toHaveBeenCalledTimes(1);
        expect(mockUndo.clearHistory).not.toHaveBeenCalled();
        expect(mockUndo.cancelRecording).toHaveBeenCalledWith('recording');
        expect(mockUndo.endRecording).not.toHaveBeenCalled();
        expect(mockRemoveLightmapAssets).toHaveBeenCalledWith('scene', ['old-texture']);
        expect(mockSave.mock.invocationCallOrder[0]).toBeLessThan(mockRemoveLightmapAssets.mock.invocationCallOrder[0]);
        expect(mockUndo.cancelRecording.mock.invocationCallOrder[0]).toBeLessThan(mockRemoveLightmapAssets.mock.invocationCallOrder[0]);
    });
    it('retains a generated texture still referenced elsewhere in the cleared scene', async () => {
        const f = fixture();
        mockQuerySceneSerializedData.mockResolvedValueOnce(JSON.stringify([
            { __type__: 'cc.Component', unrelatedTexture: { __uuid__: 'old-texture@f9941' } },
        ]));
        await expect(f.service.clearBake({ deleteAssets: true })).resolves.toEqual({
            clearedCount: 3, deletedAssetCount: 0, retainedAssetCount: 1, failedAssetCount: 0,
        });
        expect(mockSave).toHaveBeenCalledTimes(1);
        expect(mockUndo.clearHistory).not.toHaveBeenCalled();
        expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
    });
    it('restores bindings without saving when the live scene reference check fails', async () => {
        const f = fixture();
        mockQuerySceneSerializedData.mockRejectedValueOnce(new Error('serialization failed'));
        await expect(f.service.clearBake({ deleteAssets: true })).rejects.toThrow('serialization failed');
        expect(mockSave).not.toHaveBeenCalled();
        expect(mockUndo.cancelRecording).toHaveBeenCalledWith('recording');
        expect(mockUndo.clearHistory).not.toHaveBeenCalled();
        expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
        expect(f.model._updateLightmap).toHaveBeenLastCalledWith(f.oldTexture, 1, 2, 3, 4);
        expect(f.terrain._updateLightmap).toHaveBeenLastCalledWith(1, f.oldTexture, 5, 6, 7, 8);
    });
    it('does not restore only memory or delete assets when recording cancellation fails after saving', async () => {
        const f = fixture();
        mockUndo.cancelRecording.mockImplementationOnce(() => { throw new Error('notification failed'); });
        await expect(f.service.clearBake({ deleteAssets: true })).rejects.toThrow('notification failed');
        expect(mockSave).toHaveBeenCalledTimes(1);
        expect(mockUndo.cancelRecording).toHaveBeenCalledTimes(1);
        expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
        expect(f.model._updateLightmap).toHaveBeenLastCalledWith(null, 0, 0, 0, 0);
        expect(f.terrain._updateLightmap).toHaveBeenLastCalledWith(1, null, 0, 0, 0, 0);
    });
    it.each(['deleted', 'retained', 'failed', 'unknown'])('protects in-flight deletes and settles %s results without clearing history', async outcome => {
        const f = fixture();
        const snapshot = { type: 'cc.Texture2D', value: { uuid: 'old-texture@6c48a' } };
        mockRemoveLightmapAssets.mockImplementationOnce(async () => {
            expect(deletedLightmapAssets.filter(f.scene, snapshot, 'dump').value.uuid).toBe('');
            if (outcome === 'unknown') throw new Error('response lost');
            return {
                deletedTextureUuids: outcome === 'deleted' ? ['old-texture'] : [],
                retainedTextureUuids: outcome === 'retained' ? ['old-texture'] : [],
                failures: outcome === 'failed' ? [{ uuid: 'old-texture', reason: 'busy' }] : [],
            };
        });
        if (outcome === 'unknown') await expect(f.service.clearBake({ deleteAssets: true })).rejects.toThrow('response lost');
        else await f.service.clearBake({ deleteAssets: true });
        expect(deletedLightmapAssets.filter(f.scene, snapshot, 'dump').value.uuid)
            .toBe(outcome === 'deleted' || outcome === 'unknown' ? '' : snapshot.value.uuid);
        expect(mockUndo.clearHistory).not.toHaveBeenCalled();
    });
    it('keeps history when there are no texture candidates', async () => {
        const f = fixture();
        f.model.bakeSettings.texture = null as any;
        f.terrain._lightmapInfos = [];
        await f.service.clearBake({ deleteAssets: true });
        expect(mockUndo.clearHistory).not.toHaveBeenCalled();
        expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
    });
    it('replaces excluded objects old bindings, recording them for normal rebake Undo', async () => {
        const f = fixture();
        mockBake.mockResolvedValueOnce({ models: [f.model], terrains: [], operationId: 'operation', stationaryMainLight: false,
            textureUrls: [], result: { meshes: [{ id: 0, index: 0, offset: [0, 0], scale: [1, 1] }], terrains: [] } });
        await f.service.bake({ saveScene: false });
        expect(mockUndo.beginRecording).toHaveBeenCalledWith(['mesh', 'terrain', 'scene'], { label: 'Bake lightmap' });
        expect(f.terrain._updateLightmap.mock.calls).toEqual([[0, null, 0, 0, 0, 0], [1, null, 0, 0, 0, 0]]);
        expect(f.model._updateLightmap).toHaveBeenLastCalledWith(f.texture, 0, 0, 1, 1);
    });
    it('establishes a Clear history barrier even when current results were already unbound', async () => {
        const f = fixture();
        const old = deletedLightmapAssets.capture(f.scene, { type: 'cc.ModelBakeSettings', value: {
            texture: { type: 'cc.Texture2D', value: { uuid: 'old-A' } },
        } });
        f.model.bakeSettings.texture = null as any;
        f.terrain._lightmapInfos = [];
        await f.service.clearBake({ deleteAssets: true });
        expect(deletedLightmapAssets.filter(f.scene, old, 'dump').value.texture.value.uuid).toBe('');
    });
    it('does not invalidate history if Clear cannot save the scene', async () => {
        const f = fixture();
        const old = deletedLightmapAssets.capture(f.scene, { type: 'cc.ModelBakeSettings', value: {
            texture: { type: 'cc.Texture2D', value: { uuid: 'old-A' } },
        } });
        mockSave.mockRejectedValueOnce(new Error('save failed'));
        await expect(f.service.clearBake({ deleteAssets: true })).rejects.toThrow();
        expect(deletedLightmapAssets.filter(f.scene, old, 'dump')).toBe(old);
        expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
    });
    it('restores excluded objects old bindings if applying the new Bake fails', async () => {
        const f = fixture();
        mockBake.mockResolvedValueOnce({ models: [f.model], terrains: [], operationId: 'operation', stationaryMainLight: false,
            textureUrls: [], result: { meshes: [{ id: 0, index: 0, offset: [0, 0], scale: [1, 1] }], terrains: [] } });
        f.model._updateLightmap.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('apply failed'); });
        await expect(f.service.bake({ saveScene: false })).rejects.toThrow('apply failed');
        expect(f.terrain._updateLightmap.mock.calls.slice(-2)).toEqual([
            [0, f.oldTexture, 1, 2, 3, 4], [1, f.oldTexture, 5, 6, 7, 8],
        ]);
        expect(mockUndo.cancelRecording).toHaveBeenCalledWith('recording');
    });
    it('rejects deletion without saving before changing the scene', async () => {
        const f = fixture();
        await expect(f.service.clearBake({ saveScene: false, deleteAssets: true })).rejects.toThrow('deleteAssets requires saveScene');
        expect(f.model._updateLightmap).not.toHaveBeenCalled();
        expect(mockUndo.beginRecording).not.toHaveBeenCalled();
        expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
    });
    it('rejects a legacy cleanup host before changing the scene', async () => {
        const f = fixture();
        mockQueryCapabilities.mockResolvedValueOnce({});
        await expect(f.service.clearBake({ deleteAssets: true })).rejects.toThrow('does not support exact Lightmap asset cleanup');
        expect(f.model._updateLightmap).not.toHaveBeenCalled();
        expect(mockUndo.beginRecording).not.toHaveBeenCalled();
        expect(mockSave).not.toHaveBeenCalled();
        expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
    });
    it('does not delete assets when the required save is unconfirmed', async () => {
        const f = fixture();
        mockSave.mockRejectedValueOnce(new Error('save response lost'));
        await expect(f.service.clearBake({ deleteAssets: true })).rejects.toThrow('result retained');
        expect(mockUndo.endRecording).toHaveBeenCalledWith('recording');
        expect(mockUndo.cancelRecording).not.toHaveBeenCalled();
        expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
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
});
