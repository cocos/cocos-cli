import { Rect, Terrain, TerrainBlock, Vec2, Vec3, Vec4 } from 'cc';
import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../../common';

function commandMeta(type: string, terrain: Terrain): IUndoCommandMeta {
    return {
        id: `terrain-${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        label: type === 'height' ? 'Terrain Sculpt' : 'Terrain Paint',
        type: `terrain.${type}`,
        scope: { editorType: 'scene', nodePath: terrain.node.uuid },
        timestamp: Date.now(),
    };
}

export class TerrainHeightData { public x = 0; public y = 0; public value = 0; }

/** A single height delta applied during one brush update. */
export class TerrainHeightOperation {
    protected _terrain: Terrain;
    public data: TerrainHeightData[] = [];
    constructor(terrain: Terrain) { this._terrain = terrain; }
    set terrain(value: Terrain) { this._terrain = value; }
    get terrain() { return this._terrain; }
    public push(x: number, y: number, value: number) {
        if (this.data.some((item) => item.x === x && item.y === y)) return;
        this.data.push(Object.assign(new TerrainHeightData(), { x, y, value }));
    }
    public apply() {
        const terrain = this._terrain;
        if (!terrain || !this.data.length) return;
        let xmin = this.data[0].x, xmax = xmin, ymin = this.data[0].y, ymax = ymin;
        for (const item of this.data) {
            terrain.setHeight(item.x, item.y, item.value);
            xmin = Math.min(xmin, item.x); xmax = Math.max(xmax, item.x);
            ymin = Math.min(ymin, item.y); ymax = Math.max(ymax, item.y);
        }
        xmin = Math.max(0, xmin - 1); ymin = Math.max(0, ymin - 1);
        xmax = Math.min(terrain.info.vertexCount[0] - 1, xmax + 1);
        ymax = Math.min(terrain.info.vertexCount[1] - 1, ymax + 1);
        for (let y = ymin; y <= ymax; ++y) {
            for (let x = xmin; x <= xmax; ++x) terrain._setNormal(x, y, terrain._calcNormal(x, y));
        }
        const range = new Rect(xmin, ymin, xmax - xmin + 1, ymax - ymin + 1);
        for (const block of terrain.getBlocks()) {
            if (block.getRect().intersects(range)) { block._updateHeight(); block.update(); }
        }
    }
}

export class TerrainHeightUndoRedo extends TerrainHeightOperation implements IUndoCommand {
    public readonly meta: IUndoCommandMeta;
    public redoOperations: TerrainHeightOperation[] = [];
    constructor(terrain: Terrain) { super(terrain); this.meta = commandMeta('height', terrain); }
    async undo(): Promise<IUndoRedoResult> { this.apply(); return { success: true, commandId: this.meta.id, label: this.meta.label }; }
    async redo(): Promise<IUndoRedoResult> {
        for (const operation of this.redoOperations) operation.apply();
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }
}

export class TerrainWeightData { public x = 0; public y = 0; public value = new Vec4(); }

export class TerrainWeightOperation {
    protected _terrain: Terrain;
    public data: TerrainWeightData[] = [];
    constructor(terrain: Terrain) { this._terrain = terrain; }
    set terrain(value: Terrain) { this._terrain = value; }
    get terrain() { return this._terrain; }
    public push(x: number, y: number, value: Vec4) {
        if (this.data.some((item) => item.x === x && item.y === y)) return;
        const item = new TerrainWeightData(); item.x = x; item.y = y; item.value.set(value); this.data.push(item);
    }
    public apply() {
        const terrain = this._terrain;
        if (!terrain) return;
        const changed = new Set<TerrainBlock>();
        for (const item of this.data) {
            terrain.setWeight(item.x, item.y, item.value);
            const block = terrain.getBlock(
                Math.floor(item.x / terrain.info.weightMapSize),
                Math.floor(item.y / terrain.info.weightMapSize),
            );
            if (block) changed.add(block);
        }
        for (const block of changed) { block._updateWeightMap(); block.update(); }
    }
}

export class TerrainBlockLayerData {
    public readonly block: TerrainBlock;
    public readonly layers: number[];
    constructor(block: TerrainBlock, layers: number[]) { this.block = block; this.layers = [...layers]; }
}

export class TerrainWeightUndoRedo extends TerrainWeightOperation implements IUndoCommand {
    public readonly meta: IUndoCommandMeta;
    public readonly undoBlockLayers: TerrainBlockLayerData[] = [];
    public readonly redoBlockLayers: TerrainBlockLayerData[] = [];
    public readonly redoOperations: TerrainWeightOperation[] = [];
    constructor(terrain: Terrain) { super(terrain); this.meta = commandMeta('weight', terrain); }
    private applyLayers(items: TerrainBlockLayerData[]) {
        for (const item of items) item.layers.forEach((layer, index) => item.block.setLayer(index, layer));
    }
    async undo(): Promise<IUndoRedoResult> {
        this.applyLayers(this.undoBlockLayers); this.apply();
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }
    async redo(): Promise<IUndoRedoResult> {
        this.applyLayers(this.redoBlockLayers); for (const operation of this.redoOperations) operation.apply();
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }
    public pushBlock(block: TerrainBlock, undoLayers: number[], redoLayers: number[]) {
        const redo = this.redoBlockLayers.find((item) => item.block === block);
        if (redo) redo.layers.splice(0, redo.layers.length, ...redoLayers);
        else this.redoBlockLayers.push(new TerrainBlockLayerData(block, redoLayers));
        if (!this.undoBlockLayers.some((item) => item.block === block)) {
            this.undoBlockLayers.push(new TerrainBlockLayerData(block, undoLayers));
        }
    }
}

/** Kept for API compatibility with the 3.x layer operation implementation. */
export class TerrainLayerOperation {
    protected _terrain: Terrain;
    protected _layers: (any)[] = [];
    constructor(terrain: Terrain) { this._terrain = terrain; }
    set terrain(value: Terrain) { this._terrain = value; }
    get terrain() { return this._terrain; }
    setLayers() { this._layers = (this._terrain as any)._layerList?.slice?.() ?? []; }
    apply() { this._layers.forEach((layer, index) => (this._terrain as any).setLayer(index, layer)); }
}

export class TerrainLayerUndoRedo extends TerrainLayerOperation {
    public redoOperations: TerrainLayerOperation[] = [];
    undo() { this.apply(); }
    redo() { this.redoOperations.forEach((operation) => operation.apply()); }
}
