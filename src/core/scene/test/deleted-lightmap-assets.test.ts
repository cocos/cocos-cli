import { DeletedLightmapAssets } from '../scene-process/service/baking/lightfx/deleted-lightmap-assets';
import { SceneUndoManager } from '../scene-process/service/undo/scene-undo-manager';

const uv = { x: 1, y: 2, z: 3, w: 4 };
const mesh = (uuid: string) => ({ type: 'cc.ModelBakeSettings', value: {
    texture: { type: 'cc.Texture2D', value: { uuid } }, uvParam: { type: 'cc.Vec4', value: { ...uv } }, bakeable: { value: true },
} });
const terrain = (uuid: string) => ({ type: 'cc.TerrainBlockLightmapInfo', value: {
    texture: { type: 'cc.Texture2D', value: { uuid } },
    UOff: { value: 1 }, VOff: { value: 2 }, UScale: { value: 3 }, VScale: { value: 4 },
} });

describe('Deleted Lightmap snapshot references', () => {
    it('invalidates successive rebakes while preserving current Redo, ordinary edits and SH', async () => {
        const scene = {}, deleted = new DeletedLightmapAssets();
        let state = { position: 0, mesh: mesh('A'), terrain: [terrain('A')], sh: [1, 2, 3] };
        const manager = new SceneUndoManager({ snapshotAdapter: {
            capture: () => new Map([['state', deleted.capture(scene, structuredClone(state))]]),
            equals: (a, b) => JSON.stringify([...a]) === JSON.stringify([...b]),
            apply: snapshots => { state = deleted.filter(scene, snapshots.get('state'), 'dump'); return { success: true }; },
        } });
        const move = manager.beginRecording(['node']);
        state.position = 10;
        await manager.endRecording(move);
        for (const texture of ['B', 'C']) {
            const bake = manager.beginRecording(['mesh']);
            const replacement = deleted.beginReplacement(scene);
            state.mesh = mesh(texture); state.terrain = [terrain(texture)];
            await manager.endRecording(bake);
            manager.markSaved();
            replacement.commit();
            replacement.commit(); // Completion is idempotent.
        }
        await manager.undo();
        expect([state.mesh.value.texture.value.uuid, state.terrain[0].value.UScale.value, state.position, state.sh])
            .toEqual(['', 0, 10, [1, 2, 3]]);
        await manager.undo(); await manager.undo();
        expect(state.position).toBe(0);
        await manager.redo(); await manager.redo();
        expect([state.position, state.mesh.value.texture.value.uuid]).toEqual([10, '']);
        await manager.redo();
        expect([state.mesh, state.terrain, state.sh, manager.isDirty()]).toEqual([mesh('C'), [terrain('C')], [1, 2, 3], false]);
        deleted.clearResults(scene);
        await manager.undo(); await manager.redo();
        expect(state.mesh.value.texture.value.uuid).toBe('');
    });

    it('does not invalidate results on failed recording/save and releases replacement capture state', () => {
        const scene = {}, deleted = new DeletedLightmapAssets();
        const before = deleted.capture(scene, mesh('A'));
        const failed = deleted.beginReplacement(scene);
        expect(() => deleted.beginReplacement(scene)).toThrow('already being recorded');
        const retained = deleted.capture(scene, mesh('B'));
        failed.cancel(); failed.commit();
        expect(deleted.filter(scene, before, 'dump')).toBe(before);
        expect(deleted.filter(scene, retained, 'dump')).toBe(retained);
        const retry = deleted.beginReplacement(scene);
        const after = deleted.capture(scene, mesh('C'));
        retry.commit();
        expect(deleted.filter(scene, retained, 'dump').value.texture.value.uuid).toBe('');
        expect(deleted.filter(scene, after, 'dump')).toBe(after);
    });
    it('keeps ordinary edits but invalidates both Bake A and B at Clear, while allowing later Bake C history', async () => {
        const scene = {}, deleted = new DeletedLightmapAssets();
        let state = { position: 0, mesh: mesh('A'), terrain: [terrain('A'), terrain('A')], sh: [1, 2, 3] };
        const manager = new SceneUndoManager({ snapshotAdapter: {
            capture: () => new Map([['state', deleted.capture(scene, structuredClone(state))]]),
            equals: (a, b) => JSON.stringify([...a]) === JSON.stringify([...b]),
            apply: snapshots => { state = deleted.filter(scene, snapshots.get('state'), 'dump'); return { success: true }; },
        } });
        const bake = manager.beginRecording(['mesh']);
        state.mesh = mesh('B@6c48a'); state.terrain = [terrain('B@6c48a'), terrain('B@6c48a')];
        await manager.endRecording(bake);
        const move = manager.beginRecording(['node']);
        state.position = 10;
        await manager.endRecording(move);
        const clear = manager.beginRecording(['mesh']);
        state.mesh = mesh(''); state.terrain = [terrain(''), terrain('')];
        manager.markSaved(); manager.cancelRecording(clear);
        deleted.clearResults(scene);
        deleted.begin(scene, ['B'])(['B']);

        expect((await manager.undo()).success).toBe(true);
        expect({ x: state.position, texture: state.mesh.value.texture.value.uuid, uv: state.mesh.value.uvParam.value,
            terrain: state.terrain.map(block => [block.value.texture.value.uuid, block.value.UScale.value]), sh: state.sh })
            .toEqual({ x: 0, texture: '', uv: { x: 0, y: 0, z: 0, w: 0 }, terrain: [['', 0], ['', 0]], sh: [1, 2, 3] });
        await manager.undo();
        expect(state.mesh.value.texture.value.uuid).toBe('');
        await manager.redo(); await manager.redo();
        expect({ x: state.position, texture: state.mesh.value.texture.value.uuid, sh: state.sh })
            .toEqual({ x: 10, texture: '', sh: [1, 2, 3] });
        expect(manager.canRedo()).toBe(false);
        const nextBake = manager.beginRecording(['mesh']);
        state.mesh = mesh('C');
        await manager.endRecording(nextBake);
        await manager.undo();
        expect(state.mesh.value.texture.value.uuid).toBe('');
        await manager.redo();
        expect(state.mesh).toEqual(mesh('C'));
    });

    it('filters serialized node reconstruction without mutating the historical JSON', () => {
        const scene = {}, deleted = new DeletedLightmapAssets();
        const json = [
            { __type__: 'cc.Node', _lpos: { x: 10 } },
            { __type__: 'cc.ModelBakeSettings', texture: { __uuid__: 'B@6c48a' }, uvParam: { ...uv } },
            { __type__: 'cc.TerrainBlockLightmapInfo', texture: { __uuid__: 'B' }, UOff: 1, VOff: 2, UScale: 3, VScale: 4 },
            { __type__: 'Custom', texture: { __uuid__: 'B' }, other: { __uuid__: 'A' } },
        ];
        const original = structuredClone(json);
        deleted.begin(scene, ['B'])(['B']);
        expect(deleted.filter(scene, json, 'serialized')).toEqual([
            json[0],
            { __type__: 'cc.ModelBakeSettings', texture: null, uvParam: { x: 0, y: 0, z: 0, w: 0 } },
            { __type__: 'cc.TerrainBlockLightmapInfo', texture: null, UOff: 0, VOff: 0, UScale: 0, VScale: 0 },
            { __type__: 'Custom', texture: null, other: { __uuid__: 'A' } },
        ]);
        expect(json).toEqual(original);
    });

    it('normalizes compressed/subasset UUIDs, isolates Scene instances and releases retained assets', () => {
        const deleted = new DeletedLightmapAssets(uuid => uuid.split('@')[0].replace('short', 'long'));
        const scene = {}, snapshot = mesh('short@6c48a');
        const finish = deleted.begin(scene, ['long']);
        expect(deleted.filter(scene, snapshot, 'dump').value.texture.value.uuid).toBe('');
        expect(deleted.filter({}, snapshot, 'dump')).toBe(snapshot);
        finish([]);
        expect(deleted.filter(scene, snapshot, 'dump')).toBe(snapshot);
    });

    it('does not release a previously deleted asset when another deletion is retained', () => {
        const deleted = new DeletedLightmapAssets(), scene = {};
        deleted.begin(scene, ['B'])(['B']);
        deleted.begin(scene, ['B', 'C'])([]);
        expect(deleted.filter(scene, mesh('B'), 'dump').value.texture.value.uuid).toBe('');
        expect(deleted.filter(scene, mesh('C'), 'dump')).toEqual(mesh('C'));
    });

    it('transfers in-flight protection across a Scene replacement without affecting another scene', () => {
        const deleted = new DeletedLightmapAssets(), scene = {}, replacement = {};
        const finish = deleted.begin(scene, ['B', 'C']);
        deleted.transfer(scene, replacement);
        expect(deleted.filter(replacement, mesh('B'), 'dump').value.texture.value.uuid).toBe('');
        finish(['B']);
        expect(deleted.filter(replacement, mesh('B'), 'dump').value.texture.value.uuid).toBe('');
        expect(deleted.filter(replacement, mesh('C'), 'dump')).toEqual(mesh('C'));
        expect(deleted.filter({}, mesh('B'), 'dump')).toEqual(mesh('B'));
    });

    it('clears only pre-Clear baked fields, preserving external references and SH across soft reload', () => {
        const deleted = new DeletedLightmapAssets(), scene = {}, replacement = {};
        const before = deleted.capture(scene, [
            { __type__: 'cc.ModelBakeSettings', texture: { __uuid__: 'retained-A' }, uvParam: { ...uv } },
            { __type__: 'cc.SceneGlobals', bakedWithHighpLightmap: true, bakedWithStationaryMainLight: true, sh: [1, 2] },
            { __type__: 'Custom', texture: { __uuid__: 'retained-A' } },
        ]);
        deleted.clearResults(scene);
        deleted.transfer(scene, replacement);
        expect(deleted.filter(replacement, before, 'serialized')).toEqual([
            { __type__: 'cc.ModelBakeSettings', texture: null, uvParam: { x: 0, y: 0, z: 0, w: 0 } },
            { __type__: 'cc.SceneGlobals', bakedWithHighpLightmap: false, bakedWithStationaryMainLight: false, sh: [1, 2] },
            before[2],
        ]);
        const after = deleted.capture(replacement, mesh('C'));
        expect(deleted.filter(replacement, after, 'dump')).toBe(after);
        deleted.clearResults(replacement);
        expect(deleted.filter(replacement, after, 'dump').value.texture.value.uuid).toBe('');
        expect(before[0].texture).toEqual({ __uuid__: 'retained-A' });
    });
});
