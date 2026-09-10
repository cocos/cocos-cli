const mockGetScene = jest.fn();
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
const mockUndo = { beginRecording: jest.fn(), endRecording: jest.fn(), cancelRecording: jest.fn(), createCheckpoint: jest.fn(), commitLightProbeClear: jest.fn() };
jest.mock('cc', () => ({ director: { getScene: mockGetScene }, MeshRenderer: mockMeshRenderer, Terrain: mockTerrain,
    Vec3: MockVec3, SH: { getBasisCount: () => 9 } }));
jest.mock('../scene-process/service/core', () => ({
    BaseService: class { broadcast() {} }, register: () => () => undefined,
    Service: { Undo: mockUndo, Editor: { save: mockSave }, Engine: { repaintInEditMode: mockRepaint } },
}));
jest.mock('../scene-process/service/baking/lightfx/baker', () => ({ lightFXCoordinator: {
    bake: mockBake, commit: mockCommit, rollback: mockRollback,
} }));
jest.mock('../scene-process/service/baking/lightfx/host', () => ({ lightFXBakeHost: {
    reserveSceneOperation: async () => ({ transactionId: 'owner' }), releaseSceneOperation: async () => undefined,
} }));
jest.mock('../scene-process/service/baking/lightfx/settings', () => ({ createDefaultLightFXSettings: () => ({}) }));
jest.mock('../scene-process/service/preview/asset-reload', () => ({ loadPreviewAsset: jest.fn() }));
jest.mock('../scene-process/rpc', () => ({ Rpc: { getInstance: jest.fn() } }));

import { LightmapBakeService } from '../scene-process/service/lightmap-bake';
import { LightProbeBakeService } from '../scene-process/service/light-probe-bake';
import { SceneUndoManager } from '../scene-process/service/undo/scene-undo-manager';
import { LightProbeClearCommand } from '../scene-process/service/undo/commands/light-probe-clear-command';

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
    const scene = { uuid: 'scene', name: 'test', isValid: true, globals: { lightProbeInfo: info, bakedWithHighpLightmap: false, bakedWithStationaryMainLight: false },
        children: [], getComponents: (type: unknown) => type === mockMeshRenderer ? [model] : [],
    };
    const read = () => ({ texture: model.bakeSettings.texture?.uuid ?? null, uv: model.bakeSettings.uvParam.clone(),
        highp: scene.globals.bakedWithHighpLightmap, stationary: scene.globals.bakedWithStationaryMainLight,
        giScale: info.giScale, probes: probes.map(p => ({ normal: p.normal.clone(), coefficients: p.coefficients.map(c => c.clone()) })) });
    let disk = read();
    const manager = new SceneUndoManager({ snapshotAdapter: {
        capture: () => new Map([['scene', read()]]),
        equals: (a, b) => JSON.stringify(a.get('scene')) === JSON.stringify(b.get('scene')),
        apply: data => {
            const state = data.get('scene') as ReturnType<typeof read>;
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
    mockUndo.commitLightProbeClear.mockImplementation(() => manager.commitNonUndoableChange(command =>
        new LightProbeClearCommand(command, scene.uuid, () => scene as unknown as import('cc').Scene)));
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
    return { service, manager, read, disk: () => disk, assets: () => assets, events, save,
        commit: async () => { committed = true; }, bake: () => service.bake({ giScale: 2, highp: true }), old: read() };
}

describe.each(['probe', 'lightmap'] as const)('%s result failure consistency', target => {
    beforeEach(() => { jest.resetAllMocks(); });
    it('confirms asset retention before recording or saving', async () => {
        const f = fixture(target);
        await f.bake();
        expect({ events: f.events, disk: f.disk(), dirty: f.manager.isDirty() }).toEqual({ events: ['commit', 'record', 'save'], disk: f.read(), dirty: false });
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

    it.each(['bake', 'clear'] as const)('retains %s after pre-write save failure with its operation-specific Undo contract', async action => {
        const f = fixture(target);
        mockSave.mockRejectedValueOnce(new Error('disk unavailable'));
        await expect(action === 'bake' ? f.bake() : f.service.clearBake()).rejects.toThrow('result retained');
        const result = f.read();
        expect(result).not.toEqual(f.old);
        expect({ disk: f.disk(), assets: f.assets(), dirty: f.manager.isDirty() }).toEqual({ disk: f.old, assets: ['old', 'new'], dirty: true });
        expect(mockUndo.cancelRecording).not.toHaveBeenCalled();
        expect(mockRollback).not.toHaveBeenCalled();
        await f.manager.undo();
        expect(f.read()).toEqual(target === 'probe' && action === 'clear' ? result : f.old);
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
        const nonUndoable = target === 'probe' && action === 'clear';
        expect(f.read()).toEqual(nonUndoable ? result : f.old);
        expect(f.manager.isDirty()).toBe(!nonUndoable);
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

    it('restores Clear when application fails before committing the result', async () => {
        const f = fixture(target);
        mockRepaint.mockRejectedValueOnce(new Error('clear repaint failed'));
        await expect(f.service.clearBake({ saveScene: false })).rejects.toThrow('clear repaint failed');
        expect({ memory: f.read(), dirty: f.manager.isDirty(), undo: f.manager.canUndo() }).toEqual({ memory: f.old, dirty: false, undo: false });
        expect(mockSave).not.toHaveBeenCalled();
    });
});
