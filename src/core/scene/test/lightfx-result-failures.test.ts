const mockGetScene = jest.fn();
let mockSessionGeneration = 0;
const mockReserveSceneOperation = jest.fn(), mockReleaseSceneOperation = jest.fn();
const mockMeshRenderer = class MeshRenderer {};
const mockTerrain = class Terrain {};
class MockVec3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
    clone() { return new MockVec3(this.x, this.y, this.z); }
    set(x: number | MockVec3, y?: number, z?: number) {
        Object.assign(this, typeof x === 'number' ? { x, y, z } : x);
    }
}
const mockBake = jest.fn(), mockCommit = jest.fn(), mockRollback = jest.fn();
const mockSave = jest.fn(), mockRepaint = jest.fn();
const mockRemoveLightmapAssets = jest.fn(), mockQuerySceneSerializedData = jest.fn();
const mockUndo = { beginRecording: jest.fn(), endRecording: jest.fn(), cancelRecording: jest.fn(), createCheckpoint: jest.fn() };
jest.mock('cc', () => ({ director: { getScene: mockGetScene }, MeshRenderer: mockMeshRenderer, Terrain: mockTerrain,
    Vec3: MockVec3, SH: { getBasisCount: () => 9 } }));
jest.mock('../scene-process/service/core', () => ({
    BaseService: class { broadcast() {} }, register: () => () => undefined,
    Service: { Undo: mockUndo, Editor: {
        save: mockSave, querySceneSerializedData: mockQuerySceneSerializedData,
        getEditorSession: () => ({ uuid: mockGetScene()?.uuid, generation: mockSessionGeneration }),
        isCurrentEditorSession: (session: any) => session.uuid === mockGetScene()?.uuid && session.generation === mockSessionGeneration,
        runForSession: async (_session: any, action: any) => action(mockSave),
    }, Engine: { repaintInEditMode: mockRepaint } },
}));
jest.mock('../scene-process/service/baking/lightfx/baker', () => ({ lightFXCoordinator: {
    bake: mockBake, commit: mockCommit, rollback: mockRollback, removeLightmapAssets: mockRemoveLightmapAssets,
    publishLightmapAssets: async () => ({ textureUrls: ['db://assets/LightFX/output/LFX_Mesh_0000.png'] }),
} }));
jest.mock('../scene-process/service/baking/lightfx/host', () => ({ lightFXBakeHost: {
    reserveSceneOperation: mockReserveSceneOperation, releaseSceneOperation: mockReleaseSceneOperation,
    queryCapabilities: async () => ({ lightmapAssetCleanupVersion: 1, lightmapRebakeCleanupVersion: 1, lightmapPublicationVersion: 1, lightmapAuxiliaryAssetsVersion: 1 }),
    queryLightmapTextureInfo: async () => ({ textures: [], missingTextureUuids: [], ownedTextureUuids: [] }),
} }));
jest.mock('../scene-process/service/baking/lightfx/settings', () => ({ createDefaultLightFXSettings: () => ({}) }));
jest.mock('../scene-process/service/preview/asset-reload', () => ({ loadPreviewAsset: jest.fn() }));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: jest.fn() } }));

import { LightmapBakeService } from '../scene-process/service/lightmap-bake';
import { LightProbeBakeService } from '../scene-process/service/light-probe-bake';
import { SceneUndoManager } from '../scene-process/service/undo/scene-undo-manager';
import { deletedLightmapAssets } from '../scene-process/service/baking/lightfx/deleted-lightmap-assets';

function fixture(target: 'probe' | 'lightmap') {
    const events: string[] = [];
    const oldTexture = { uuid: 'old' }, texture = { uuid: 'new' };
    let assets = ['old', 'new'];
    let committed = false;
    const model = { uuid: 'mesh', node: {}, bakeSettings: { texture: oldTexture as { uuid: string } | null,
        uvParam: { x: 1, y: 2, z: 3, w: 4, clone() { return { x: this.x, y: this.y, z: this.z, w: this.w }; } } },
    _updateLightmap(value: { uuid: string } | null, x: number, y: number, z: number, w: number) {
        this.bakeSettings.texture = value;
        Object.assign(this.bakeSettings.uvParam, { x, y, z, w });
    } };
    const probes = Array.from({ length: 4 }, (_, x) => ({ position: new MockVec3(x), normal: new MockVec3(), coefficients: [new MockVec3(1)] }));
    const info = { data: { probes }, giScale: 1, onProbeBakeFinished() {}, onProbeBakeCleared() { probes.forEach(p => { p.coefficients = []; }); } };
    const scene = { uuid: 'scene', name: 'test', globals: { lightProbeInfo: info, bakedWithHighpLightmap: false, bakedWithStationaryMainLight: false },
        children: [], getComponents: (type: unknown) => type === mockMeshRenderer ? [model] : [],
    };
    const read = () => ({ texture: model.bakeSettings.texture?.uuid ?? null, uv: model.bakeSettings.uvParam.clone(),
        highp: scene.globals.bakedWithHighpLightmap, stationary: scene.globals.bakedWithStationaryMainLight,
        giScale: info.giScale, probes: probes.map(p => ({ normal: p.normal.clone(), coefficients: p.coefficients.map(c => c.clone()) })) });
    let disk = read();
    const capture = () => ({ state: read(), baked: {
        __type__: 'cc.ModelBakeSettings', texture: model.bakeSettings.texture ? { __uuid__: model.bakeSettings.texture.uuid } : null,
        uvParam: model.bakeSettings.uvParam.clone(),
    }, globals: { __type__: 'cc.SceneGlobals', bakedWithHighpLightmap: scene.globals.bakedWithHighpLightmap,
        bakedWithStationaryMainLight: scene.globals.bakedWithStationaryMainLight } });
    mockQuerySceneSerializedData.mockImplementation(async () => JSON.stringify(capture()));
    mockRemoveLightmapAssets.mockImplementation(async (_scene: string, uuids: string[]) => {
        assets = assets.filter(uuid => !uuids.includes(uuid));
        return { deletedTextureUuids: uuids, retainedTextureUuids: [], failures: [] };
    });
    const manager = new SceneUndoManager({ snapshotAdapter: {
        capture: () => new Map([['scene', deletedLightmapAssets.capture(scene, capture())]]),
        equals: (a, b) => JSON.stringify(a.get('scene')) === JSON.stringify(b.get('scene')),
        apply: data => {
            const filtered = deletedLightmapAssets.filter(scene, data.get('scene') as ReturnType<typeof capture>, 'serialized');
            const state = { ...filtered.state, texture: filtered.baked.texture?.__uuid__ ?? null, uv: filtered.baked.uvParam,
                highp: filtered.globals.bakedWithHighpLightmap, stationary: filtered.globals.bakedWithStationaryMainLight };
            model._updateLightmap(state.texture ? { uuid: state.texture } : null, state.uv.x, state.uv.y, state.uv.z, state.uv.w);
            scene.globals.bakedWithHighpLightmap = state.highp;
            scene.globals.bakedWithStationaryMainLight = state.stationary;
            info.giScale = state.giScale;
            state.probes.forEach((p, i) => { probes[i].normal.set(p.normal); probes[i].coefficients = p.coefficients.map(c => c.clone()); });
            return { success: true };
        },
    } });
    mockUndo.beginRecording.mockImplementation(uuids => manager.beginRecording(uuids));
    mockUndo.endRecording.mockImplementation(async id => { events.push('record'); await manager.endRecording(id); });
    mockUndo.cancelRecording.mockImplementation(id => manager.cancelRecording(id));
    mockUndo.createCheckpoint.mockImplementation(() => manager.createCheckpoint());
    const save = async () => { events.push('save'); disk = read(); manager.markSaved(); };
    mockSave.mockImplementation(save);
    mockCommit.mockImplementation(async () => { events.push('commit'); committed = true; });
    mockRollback.mockImplementation(async () => { if (committed) throw new Error('already committed'); assets = ['old']; });
    mockBake.mockResolvedValue({ models: [model], terrains: [], operationId: 'operation', stationaryMainLight: true, textureUrls: [], result: {
        meshes: [{ id: 0, index: 0, offset: [0.1, 0.2], scale: [0.3, 0.4] }], terrains: [],
        probes: probes.map(p => ({ position: [p.position.x, 0, 0], normal: [0, 1, 0], coefficients: new Array(27).fill(2) })),
    } });
    mockGetScene.mockReturnValue(scene);
    const service = target === 'probe' ? new LightProbeBakeService() : new LightmapBakeService();
    jest.spyOn(service as any, 'querySceneUrl').mockResolvedValue('db://assets/test.scene');
    if (service instanceof LightmapBakeService) jest.spyOn(service as any, 'loadOutputTextures').mockResolvedValue(new Map([['mesh:0', texture]]));
    return { scene, service, manager, read, disk: () => disk, assets: () => assets, events, save,
        commit: async () => { committed = true; }, bake: () => service.bake({ giScale: 2, highp: true }), old: read() };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockSessionGeneration = 0;
    mockReserveSceneOperation.mockResolvedValue({ transactionId: 'owner' });
    mockReleaseSceneOperation.mockResolvedValue(undefined);
});

describe.each(['probe', 'lightmap'] as const)('%s result failure consistency', target => {
    for (const action of ['bake', 'clear', ...(target === 'lightmap' ? ['clear-delete'] : [])]) {
        it.each(['switch', 'reload', 'session-generation'])(`${action} rejects %s during reservation and releases ownership for retry`, async change => {
            const source = fixture(target);
            const replacement = change === 'session-generation' ? source : fixture(target);
            if (change === 'switch') replacement.scene.uuid = 'other-scene';
            mockGetScene.mockReturnValue(source.scene);
            let reserve!: (token: { transactionId: string }) => void;
            mockReserveSceneOperation.mockReturnValueOnce(new Promise(resolve => { reserve = resolve; }));
            const invoke = () => action === 'bake' ? source.bake()
                : source.service.clearBake({ saveScene: true, ...(action === 'clear-delete' ? { deleteAssets: true } : {}) });
            const pending = invoke();
            const rejected = expect(pending).rejects.toThrow('source scene changed');
            expect(mockReserveSceneOperation).toHaveBeenCalledTimes(1);
            expect(mockBake).not.toHaveBeenCalled();
            expect(mockUndo.beginRecording).not.toHaveBeenCalled();
            mockGetScene.mockReturnValue(replacement.scene);
            if (change === 'session-generation') mockSessionGeneration++;
            reserve({ transactionId: 'obsolete-owner' });
            await rejected;
            expect(mockReleaseSceneOperation).toHaveBeenCalledTimes(1);
            expect(mockReleaseSceneOperation).toHaveBeenCalledWith({ transactionId: 'obsolete-owner' });
            expect(mockBake).not.toHaveBeenCalled();
            expect(mockCommit).not.toHaveBeenCalled();
            expect(mockRollback).not.toHaveBeenCalled();
            expect(mockUndo.beginRecording).not.toHaveBeenCalled();
            expect(mockSave).not.toHaveBeenCalled();
            expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
            for (const f of [source, replacement]) {
                expect(f.read()).toEqual(f.old);
                expect(f.disk()).toEqual(f.old);
                expect(f.assets()).toEqual(['old', 'new']);
            }
            // The rejected request must not poison the local reservation for the next request.
            await invoke();
            expect(mockReserveSceneOperation).toHaveBeenCalledTimes(2);
            expect(mockReleaseSceneOperation).toHaveBeenCalledTimes(2);
            expect(mockReleaseSceneOperation).toHaveBeenLastCalledWith({ transactionId: 'owner' });
            expect(mockSave).toHaveBeenCalledTimes(1);
        });
    }
    it('confirms asset retention before recording or saving', async () => {
        const f = fixture(target);
        await f.bake();
        expect({ events: f.events, disk: f.disk(), dirty: f.manager.isDirty() }).toEqual({ events: ['commit', 'record', 'save'], disk: f.read(), dirty: false });
    });
    it.each([false, true])('rejects a replaced scene before committing, saving or deleting (same UUID=%s)', sameUuid => {
        const f = fixture(target);
        const source = mockGetScene();
        const original = mockBake.getMockImplementation()!;
        mockBake.mockImplementationOnce(async (...args) => {
            const output = await original(...args);
            mockGetScene.mockReturnValue({ ...source, uuid: sameUuid ? source.uuid : 'other-scene' });
            return output;
        });
        return expect(f.bake()).rejects.toThrow('source scene changed').then(() => {
            expect(mockSave).not.toHaveBeenCalled();
            expect(mockCommit).not.toHaveBeenCalled();
            expect(mockRemoveLightmapAssets).not.toHaveBeenCalled();
            expect(mockUndo.beginRecording).not.toHaveBeenCalled();
            expect(f.read()).toEqual(f.old);
        });
    });

    it.each([false, true])('keeps ordinary edits and only current Lightmap results in edit → rebake → clear history (save=%s)', async saveScene => {
        const f = fixture(target);
        const scene = mockGetScene();
        const edit = f.manager.beginRecording(['scene']);
        scene.globals.lightProbeInfo.giScale = 1.5;
        await f.manager.endRecording(edit);
        const edited = f.read();
        const previous = (value: ReturnType<typeof f.read>) => target === 'lightmap'
            ? { ...value, texture: null, uv: { x: 0, y: 0, z: 0, w: 0 }, highp: false, stationary: false } : value;

        await f.service.bake({ giScale: 2, highp: true, saveScene });
        const baked = f.read();
        await f.service.clearBake({ saveScene });
        const cleared = f.read();
        expect(cleared).not.toEqual(baked);
        expect(f.manager.isDirty()).toBe(!saveScene);

        await f.manager.undo();
        expect(f.read()).toEqual(baked);
        await f.manager.undo();
        expect(f.read()).toEqual(previous(edited));
        await f.manager.undo();
        expect(f.read()).toEqual(previous(f.old));
        expect(f.manager.canUndo()).toBe(false);

        await f.manager.redo();
        expect(f.read()).toEqual(previous(edited));
        await f.manager.redo();
        expect(f.read()).toEqual(baked);
        await f.manager.redo();
        expect(f.read()).toEqual(cleared);
        expect(f.manager.canRedo()).toBe(false);
        expect(f.manager.isDirty()).toBe(!saveScene);
        expect(f.assets()).toEqual(target === 'lightmap' && saveScene ? ['new'] : ['old', 'new']);
    });

    it.each([false, true])('does not mutate scene, disk or history on commit failure (host committed=%s)', async committed => {
        const f = fixture(target);
        mockCommit.mockImplementationOnce(async () => { if (committed) await f.commit(); throw new Error('commit response failed'); });
        await expect(f.bake()).rejects.toThrow('commit response failed');
        expect({ memory: f.read(), disk: f.disk(), assets: f.assets(), undo: f.manager.canUndo() }).toEqual({
            memory: f.old, disk: f.old, assets: committed ? ['old', 'new'] : ['old'], undo: false,
        });
        expect(mockSave).not.toHaveBeenCalled();
        expect(mockUndo.beginRecording).not.toHaveBeenCalled();
    });

    it.each(['bake', 'clear'] as const)('retains %s after pre-write save failure, supports Undo/Redo and retry', async action => {
        const f = fixture(target);
        mockSave.mockRejectedValueOnce(new Error('disk unavailable'));
        await expect(action === 'bake' ? f.bake() : f.service.clearBake()).rejects.toThrow('result retained');
        const result = f.read();
        expect(result).not.toEqual(f.old);
        expect({ disk: f.disk(), assets: f.assets(), dirty: f.manager.isDirty() }).toEqual({ disk: f.old, assets: ['old', 'new'], dirty: true });
        expect(mockUndo.cancelRecording).not.toHaveBeenCalled();
        expect(mockRollback).not.toHaveBeenCalled();
        await f.manager.undo();
        expect(f.read()).toEqual(f.old);
        await f.manager.redo();
        expect(f.read()).toEqual(result);
        await f.save();
        expect({ disk: f.disk(), dirty: f.manager.isDirty() }).toEqual({ disk: result, dirty: false });
    });

    it.each(['bake', 'clear'] as const)('retains %s when disk was written but its response failed', async action => {
        const f = fixture(target);
        mockSave.mockImplementationOnce(async () => { await f.save(); throw new Error('save response lost'); });
        await expect(action === 'bake' ? f.bake() : f.service.clearBake()).rejects.toThrow('save response lost');
        const result = f.read();
        expect(f.disk()).toEqual(result);
        expect(mockUndo.cancelRecording).not.toHaveBeenCalled();
        expect(mockRollback).not.toHaveBeenCalled();
        await f.manager.undo();
        expect(f.read()).toEqual(f.old);
        expect(f.manager.isDirty()).toBe(true);
        await f.manager.redo();
        expect({ memory: f.read(), disk: f.disk(), assets: f.assets(), dirty: f.manager.isDirty() }).toEqual({
            memory: result, disk: result, assets: ['old', 'new'], dirty: false,
        });
    });

    it('restores an application failure without deleting committed assets or creating history', async () => {
        const f = fixture(target);
        mockRepaint.mockRejectedValueOnce(new Error('application repaint failed'));
        await expect(f.bake()).rejects.toThrow('application repaint failed');
        expect({ memory: f.read(), disk: f.disk(), assets: f.assets(), undo: f.manager.canUndo() }).toEqual({
            memory: f.old, disk: f.old, assets: ['old', 'new'], undo: false,
        });
        expect(mockSave).not.toHaveBeenCalled();
        expect(mockRollback).not.toHaveBeenCalled();
    });

    it('restores Clear when application fails before recording the result', async () => {
        const f = fixture(target);
        mockRepaint.mockRejectedValueOnce(new Error('clear repaint failed'));
        await expect(f.service.clearBake({ saveScene: false })).rejects.toThrow('clear repaint failed');
        expect({ memory: f.read(), dirty: f.manager.isDirty(), undo: f.manager.canUndo() }).toEqual({ memory: f.old, dirty: false, undo: false });
        expect(mockSave).not.toHaveBeenCalled();
    });
});

describe('Lightmap first bake history', () => {
    it('restores an empty binding on Undo and preserves later rebake and Clear records', async () => {
        const f = fixture('lightmap');
        mockGetScene().getComponents(mockMeshRenderer)[0].bakeSettings.texture = null;
        await f.service.bake({ saveScene: false });
        expect(mockUndo.beginRecording).toHaveBeenCalled();
        await f.manager.undo();
        expect(f.read().texture).toBeNull();
        await f.manager.redo();
        await f.service.bake({ saveScene: false });
        const latest = f.read();
        await f.service.clearBake({ saveScene: false });
        expect(f.read().texture).toBeNull();
        await f.manager.undo();
        expect(f.read()).toEqual(latest);
    });
});
