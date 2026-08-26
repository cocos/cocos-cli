import { Rect, Terrain, TERRAIN_BLOCK_TILE_COMPLEXITY, Texture2D, Vec3, Vec4, math } from 'cc';
import { Service } from '../../../core/decorator';
import { TerrainBrush, TerrainBrushType, TerrainCircleBrush, TerrainImageBrush } from './terrain-brush';
import { TerrainEditorMode } from './terrain-editor-mode';
import { TerrainWeightOperation, TerrainWeightUndoRedo } from './terrain-operation';

const clamp = math.clamp;

export class TerrainEditorPaint extends TerrainEditorMode {
    public _brushes: TerrainBrush[];
    public _undo: TerrainWeightUndoRedo | null = null;
    public _currentLayer = -1;
    public _currentBrush: TerrainBrush;

    constructor(gizmo: any) {
        super(gizmo);
        const circle = new TerrainCircleBrush(); circle.strength = 5;
        const image = new TerrainImageBrush(); image.strength = 5;
        this._brushes = [circle, image]; this._currentBrush = circle;
    }
    public setCurrentBrush(type: TerrainBrushType) {
        const old = this._currentBrush; this._currentBrush = this._brushes[type];
        this._currentBrush.position.set(old.position); this._currentBrush.radius = old.radius;
        this._currentBrush.strength = old.strength; this._currentBrush._setHeight = old._setHeight;
        this._currentBrush._rotation = old._rotation;
    }
    public getCurrentBrush() { return this._currentBrush; }
    public getBrush(type: TerrainBrushType) { return this._brushes[type]; }
    public setBrushImage(texture: Texture2D | null) {
        const image = this.getBrush(TerrainBrushType.IMAGE) as TerrainImageBrush;
        image.image = texture; this.setCurrentBrush(texture ? TerrainBrushType.IMAGE : TerrainBrushType.CIRCLE);
    }
    public setCurrentLayer(layer: number) { this._currentLayer = layer; }
    public getCurrentLayer() { return this._currentLayer; }

    public onUpdate(terrain: Terrain, deltaTime: number) {
        if (!this._undo) return;
        this._updateWeight(terrain, deltaTime); this.gizmo.isTerrainChange = true;
    }
    public onUpdateBrushPosition(terrain: Terrain, position: Vec3) {
        const brush = this._currentBrush; brush.update(terrain, position);
        const brushRect = new Rect(position.x - brush.radius, position.z - brush.radius, brush.radius * 2, brush.radius * 2);
        for (const block of terrain.getBlocks()) {
            const index = block.getIndex();
            const bound = new Rect(
                index[0] * TERRAIN_BLOCK_TILE_COMPLEXITY * terrain.info.tileSize,
                index[1] * TERRAIN_BLOCK_TILE_COMPLEXITY * terrain.info.tileSize,
                TERRAIN_BLOCK_TILE_COMPLEXITY * terrain.info.tileSize,
                TERRAIN_BLOCK_TILE_COMPLEXITY * terrain.info.tileSize,
            );
            block.setBrushMaterial(bound.intersects(brushRect) ? brush.material : null);
        }
    }
    public onMouseDown(terrain: Terrain) {
        if (this._currentLayer !== -1) this._undo = new TerrainWeightUndoRedo(terrain);
    }
    public onMouseUp() {
        if (this._undo?.data.length || this._undo?.redoOperations.length) Service.Undo.push(this._undo);
        this._undo = null;
    }
    public forceUpdate() { TerrainBrush.updateBrushDepthOffsetToMaterial(this._currentBrush.material); }
    public onDeactivate() {
        if (!this.gizmo.editor.getEditTerrain()?._asset) this._currentLayer = -1;
    }

    private _updateWeight(terrain: Terrain, deltaTime: number) {
        const width = terrain.info.weightMapSize * terrain.info.blockCount[0];
        const height = terrain.info.weightMapSize * terrain.info.blockCount[1];
        if (!width || !height) return;
        const brush = this._currentBrush;
        let x1 = Math.floor((brush.position.x - brush.radius) / terrain.info.size.width * (width - 1));
        let y1 = Math.floor((brush.position.z - brush.radius) / terrain.info.size.height * (height - 1));
        let x2 = Math.floor((brush.position.x + brush.radius) / terrain.info.size.width * (width - 1));
        let y2 = Math.floor((brush.position.z + brush.radius) / terrain.info.size.height * (height - 1));
        if (x1 > width - 1 || x2 < 0 || y1 > height - 1 || y2 < 0) return;
        x1 = clamp(x1, 0, width - 1); y1 = clamp(y1, 0, height - 1); x2 = clamp(x2, 0, width - 1); y2 = clamp(y2, 0, height - 1);
        const operation = new TerrainWeightOperation(terrain); this._undo?.redoOperations.push(operation);
        for (let y = y1; y <= y2; ++y) {
            for (let x = x1; x <= x2; ++x) {
                const weight = terrain.getWeight(x, y);
                const block = terrain.getBlock(Math.floor(x / terrain.info.weightMapSize), Math.floor(y / terrain.info.weightMapSize));
                if (!block) continue;
                const layers = [...block.layers];
                const delta = brush.getDelta(
                    x / (width - 1) * terrain.info.size.width,
                    y / (height - 1) * terrain.info.size.height,
                ) * deltaTime;
                if (!delta) continue;
                const layerSlot = layers.indexOf(this._currentLayer);
                if (layerSlot >= 0) {
                    (weight as any)[['x', 'y', 'z', 'w'][layerSlot]] += delta;
                } else {
                    const emptySlot = layers.indexOf(-1);
                    if (emptySlot < 0) continue;
                    block.setLayer(emptySlot, this._currentLayer);
                    (weight as any)[['x', 'y', 'z', 'w'][emptySlot]] += delta;
                }
                const sum = weight.x + weight.y + weight.z + weight.w;
                if (sum > 0) weight.multiplyScalar(1 / sum);
                this._undo?.push(x, y, terrain.getWeight(x, y));
                this._undo?.pushBlock(block, layers, [...block.layers]);
                operation.push(x, y, weight);
            }
        }
        operation.apply();
    }
}
