import { Terrain, Texture2D, TERRAIN_MAX_LAYER_COUNT } from 'cc';
import type { ITerrainEditorState, ITerrainBlockData, ITerrainSculptSessionPatch, ITerrainPaintSessionPatch, TerrainEditorMode } from '../../../common/terrain';

/** Optional in-process authoring view; never transported over MCP. */
export interface TerrainSession {
    target: Terrain | null;
    readTerrainState(): ITerrainEditorState;
    setTerrainMode(mode: TerrainEditorMode): void;
    setTerrainCurrentLayer(index: number): void;
    updateTerrainSculptSession(patch: ITerrainSculptSessionPatch): void;
    updateTerrainPaintSession(patch: ITerrainPaintSessionPatch): void;
    setSculptBrushTexture(texture: Texture2D | null): void;
    setPaintBrushTexture(texture: Texture2D | null): void;
    readTerrainBlock(): ITerrainBlockData | null;
}

let resolver: ((terrain: Terrain) => TerrainSession | null) | undefined;
export function registerTerrainSessionResolver(resolve: (terrain: Terrain) => TerrainSession | null): () => void {
    if (resolver) throw new Error('A terrain view session resolver is already registered');
    resolver = resolve;
    return () => { if (resolver === resolve) resolver = undefined; };
}

/** A registered view must resolve the exact target; failure must not switch owners. */
export function resolveTerrainSession(terrain: Terrain, data: () => TerrainSession): TerrainSession | null {
    const result = resolver ? resolver(terrain) : data();
    return result?.target === terrain ? result : null;
}

/** Worker authoring state: asset data comes directly from Terrain, without a gizmo. */
export class TerrainDataSession implements TerrainSession {
    private mode: TerrainEditorMode = 'manage';
    private currentLayer = -1;
    private sculpt: ITerrainEditorState['sculpt'] = { tool: 'bulge', brush: { kind: 'circle', imageUuid: null, radius: 1, strength: 1, rotation: 0, setHeight: 0 } };
    private paint: ITerrainEditorState['paint'] = { brush: { kind: 'circle', imageUuid: null, radius: 1, strength: 1, rotation: 0, setHeight: 0, falloff: 0.5 } };
    constructor(readonly target: Terrain) {}
    readTerrainState(): ITerrainEditorState {
        const t = this.target;
        return {
            manage: { tileSize: t.tileSize, weightMapSize: t.weightMapSize, lightMapSize: t.lightMapSize, blockCount: [t.blockCount[0], t.blockCount[1]] },
            layers: Array.from({ length: TERRAIN_MAX_LAYER_COUNT }, (_, index) => {
                const layer = t.getLayer(index);
                return layer ? { detailMapUuid: layer.detailMap?.uuid || null, normalMapUuid: layer.normalMap?.uuid || null, metallic: layer.metallic, roughness: layer.roughness, tileSize: layer.tileSize } : null;
            }),
            mode: this.mode, currentLayer: this.currentLayer,
            sculpt: { tool: this.sculpt.tool, brush: { ...this.sculpt.brush } },
            paint: { brush: { ...this.paint.brush } },
        };
    }
    setTerrainMode(mode: TerrainEditorMode) { this.mode = mode; }
    setTerrainCurrentLayer(index: number) { if (index === -1 || this.target.getLayer(index)) this.currentLayer = index; }
    updateTerrainSculptSession(patch: ITerrainSculptSessionPatch) { if (patch.tool) this.sculpt.tool = patch.tool; Object.assign(this.sculpt.brush, patch.brush); }
    updateTerrainPaintSession(patch: ITerrainPaintSessionPatch) { Object.assign(this.paint.brush, patch.brush); }
    setSculptBrushTexture(texture: Texture2D | null) { this.sculpt.brush.kind = texture ? 'image' : 'circle'; this.sculpt.brush.imageUuid = texture?.uuid || null; }
    setPaintBrushTexture(texture: Texture2D | null) { this.paint.brush.kind = texture ? 'image' : 'circle'; this.paint.brush.imageUuid = texture?.uuid || null; }
    readTerrainBlock(): null { return null; } // No pointer-selected block exists in a Worker.
}
