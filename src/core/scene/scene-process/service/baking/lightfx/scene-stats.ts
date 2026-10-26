import type { ILightFXSceneStats } from '../../../../common/lightfx-host';
import type { LightFXWorld } from './types';

/** Count only geometry actually exported to LightFX, including two triangles per terrain tile. */
export function lightmapSceneStats(world: LightFXWorld, terrainBlockTiles: number): ILightFXSceneStats {
    return {
        objects: world.meshes.length + world.terrains.length,
        lights: world.lights.length,
        triangles: world.meshes.reduce((sum, mesh) => sum + mesh.triangles.length, 0)
            + world.terrains.reduce((sum, terrain) => sum + terrain.blockCount[0] * terrain.blockCount[1] * terrainBlockTiles ** 2 * 2, 0),
    };
}
