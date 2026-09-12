import { lightmapSceneStats } from '../scene-process/service/baking/lightfx/scene-stats';
import type { LightFXWorld } from '../scene-process/service/baking/lightfx/types';

describe('Lightmap exported scene statistics', () => {
    it('counts mesh triangles plus full terrain tiles, not packed images or terrain tasks', () => {
        const world = { meshes: [{ triangles: Array(12) }], terrains: [{ blockCount: [2, 1] }], lights: [{}] } as LightFXWorld;
        expect(lightmapSceneStats(world, 32)).toEqual({ objects: 2, lights: 1, triangles: 4108 });
    });
    it('counts mesh-only and empty exported worlds without inventing objects', () => {
        const world = { meshes: [{ triangles: Array(12) }, { triangles: Array(200) }, { triangles: Array(12) }], terrains: [], lights: [{}] } as unknown as LightFXWorld;
        expect(lightmapSceneStats(world, 32)).toEqual({ objects: 3, lights: 1, triangles: 224 });
        expect(lightmapSceneStats({ meshes: [], terrains: [], lights: [] } as unknown as LightFXWorld, 32))
            .toEqual({ objects: 0, lights: 0, triangles: 0 });
    });
});
