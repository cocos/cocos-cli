import {
    Camera, Material, Rect, Terrain, TerrainBlock, TERRAIN_BLOCK_TILE_COMPLEXITY, Texture2D, Vec2, Vec3, clamp,
} from 'cc';
import { ServiceEvents } from '../../../core/global-events';
import type { ITerrainBlockLayerSlot } from '../../../../../common';
import { TerrainBrush } from './terrain-brush';
import { TerrainEditorMode } from './terrain-editor-mode';

export class TerrainEditorWeightMapData {
    public data = new Uint8Array();
    public width = 0;
    public height = 0;
}

/** Block picker and read-only data provider for the terrain float window. */
export class TerrainEditorSelect extends TerrainEditorMode {
    private _selectMaterial: Material | null = null;
    private _selectBlock: TerrainBlock | null = null;
    private _weightMap: Texture2D | null = null;
    private _weightData: TerrainEditorWeightMapData | null = null;
    private _layerList: Array<Texture2D | null> = [];

    constructor(gizmo: any) {
        super(gizmo);
        const effect = (cc as any).EffectAsset?.get?.('internal/editor/terrain-select-brush');
        if (effect) { this._selectMaterial = new Material(); this._selectMaterial.initialize({ effectAsset: effect }); }
    }
    public setSelectBlock(block: TerrainBlock | null) {
        if (this._selectBlock === block) return;
        ServiceEvents.emit('terrain:block-update');
        if (this._selectBlock) this._updateBlockSelectMaterial(this._selectBlock, null);
        this._selectBlock = block;
        this._weightMap = null; this._weightData = null; this._layerList = [];
        if (!block) return;
        const terrain = block.getTerrain(); this._weightMap = block.weightmap;
        if (this._weightMap) {
            const size = terrain.info.weightMapSize;
            this._weightData = new TerrainEditorWeightMapData();
            this._weightData.width = size; this._weightData.height = size;
            this._weightData.data = new Uint8Array(size * size * 4);
            const index = block.getIndex(); let offset = 0;
            for (let y = index[1] * size; y < (index[1] + 1) * size; ++y) {
                for (let x = index[0] * size; x < (index[0] + 1) * size; ++x) {
                    const weight = terrain.getWeight(x, y);
                    this._weightData.data[offset++] = clamp(weight.x * 255, 0, 255);
                    this._weightData.data[offset++] = clamp(weight.y * 255, 0, 255);
                    this._weightData.data[offset++] = clamp(weight.z * 255, 0, 255);
                    this._weightData.data[offset++] = clamp(weight.w * 255, 0, 255);
                }
            }
        }
        this._layerList = block.layers.map((layerId) => layerId >= 0 ? terrain.getLayer(layerId)?.detailMap ?? null : null);
        this._updateBlockSelectMaterial(block, this._selectMaterial);
    }
    public getSelectBlock() { return this._selectBlock; }
    public getCurrentBlockIndex() { return this._selectBlock?.getIndex() ?? null; }
    public getCurrentWeightMap() { return this._weightMap; }
    public getCurrentWeightData() { return this._weightData; }
    public getCurrentLayerList() { return this._layerList; }
    /** Returns the Terrain-layer identity behind each RGBA slot without changing the legacy texture list. */
    public getCurrentBlockLayerSlots(): Array<ITerrainBlockLayerSlot | null> {
        const block = this._selectBlock;
        if (!block) return [];
        const terrain = block.getTerrain();
        return block.layers.map((layerIndex) => {
            if (layerIndex < 0) return null;
            return {
                layerIndex,
                detailMapUuid: terrain.getLayer(layerIndex)?.detailMap?.uuid ?? null,
            };
        });
    }
    public onDeactivate() { this.setSelectBlock(null); }
    public forceUpdate() {
        if (!this._selectBlock) return;
        TerrainBrush.updateBrushDepthOffsetToMaterial(this._selectMaterial);
        this._selectBlock.setBrushMaterial(this._selectMaterial); this._selectBlock._invalidMaterial();
    }
    public onMouseDown(terrain: Terrain, camera: Camera, x: number, y: number) {
        const from = camera.node.getWorldPosition(); const screen = new Vec3(x, y, 0); const to = new Vec3();
        camera.screenToWorld(screen, to); const direction = new Vec3(); Vec3.subtract(direction, to, from).normalize();
        const hit = terrain.rayCheck(from, direction, 0.35, true);
        if (!hit) return;
        // Terrain.rayCheck returns coordinates in Terrain local space even when
        // the input ray is world-space.
        const picked = new Vec2(hit.x, hit.z);
        const block = terrain.getBlocks().find((candidate) => {
            const index = candidate.getIndex();
            return new Rect(
                index[0] * TERRAIN_BLOCK_TILE_COMPLEXITY * terrain.info.tileSize,
                index[1] * TERRAIN_BLOCK_TILE_COMPLEXITY * terrain.info.tileSize,
                TERRAIN_BLOCK_TILE_COMPLEXITY * terrain.info.tileSize,
                TERRAIN_BLOCK_TILE_COMPLEXITY * terrain.info.tileSize,
            ).contains(picked);
        }) ?? null;
        this.setSelectBlock(this._selectBlock === block ? null : block);
    }
    private _updateBlockSelectMaterial(block: TerrainBlock, material: Material | null) {
        TerrainBrush.updateBrushDepthOffsetToMaterial(material); block.setBrushMaterial(material);
    }
}
