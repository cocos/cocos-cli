import { restoreTerrainLightmapBindings } from '../scene-process/service/dump/terrain-lightmap-restore';

describe('Terrain lightmap snapshot rendering', () => {
    const dump = { type: 'cc.Terrain', value: { _lightmapInfos: {} } };
    function fixture(infos: unknown[]) {
        const blocks = [{ _updateLightmap: jest.fn() }, { _updateLightmap: jest.fn() }];
        return { component: { _lightmapInfos: infos, getBlocks: () => blocks }, blocks };
    }
    it('rebinds every block to the restored entry without copying or changing the serialized array', () => {
        const infos = [{ texture: 'A' }, { texture: 'B' }];
        const f = fixture(infos);
        restoreTerrainLightmapBindings(f.component, dump);
        expect(f.blocks[0]._updateLightmap).toHaveBeenCalledWith(infos[0]);
        expect(f.blocks[1]._updateLightmap).toHaveBeenCalledWith(infos[1]);
        expect(f.component._lightmapInfos).toBe(infos);
        expect(infos).toEqual([{ texture: 'A' }, { texture: 'B' }]);
    });
    it.each([[[]], [[{ texture: null }]]])('explicitly unbinds missing entries after restoring %p', infos => {
        const f = fixture(infos);
        restoreTerrainLightmapBindings(f.component, dump);
        expect(f.blocks[0]._updateLightmap).toHaveBeenCalledWith(infos[0] ?? null);
        expect(f.blocks[1]._updateLightmap).toHaveBeenCalledWith(null);
    });
    it('handles derived terrain components and not-yet-built terrain', () => {
        const f = fixture([]);
        restoreTerrainLightmapBindings(f.component, { ...dump, type: 'CustomTerrain', extends: ['cc.Terrain'] });
        expect(f.blocks[0]._updateLightmap).toHaveBeenCalledWith(null);
        expect(() => restoreTerrainLightmapBindings({ _lightmapInfos: [], getBlocks: () => [] }, dump)).not.toThrow();
    });
    it.each([{ type: 'cc.MeshRenderer', value: { _lightmapInfos: {} } }, { type: 'cc.Terrain', value: {} }, { type: 'cc.Terrain' }])('does not touch unrelated or partial snapshots (%p)', other => {
        restoreTerrainLightmapBindings({}, other);
    });
});
