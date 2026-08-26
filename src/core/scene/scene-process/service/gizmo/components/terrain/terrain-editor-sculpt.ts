import { Rect, Terrain, TERRAIN_BLOCK_TILE_COMPLEXITY, Texture2D, Vec2, Vec3, math } from 'cc';
import { Service } from '../../../core/decorator';
import {
    TerrainBrush, TerrainBrushType, TerrainCircleBrush, TerrainEdModifierKeyState, TerrainImageBrush,
} from './terrain-brush';
import { TerrainEditorMode } from './terrain-editor-mode';
import {
    eTerrainTerrainEditorSculptToolMode, TerrainEditorSculptTool, TerrainEditorSculptTool_Flatten,
    TerrainEditorSculptTool_Sculpt, TerrainEditorSculptTool_SetHeight, TerrainEditorSculptTool_Smooth,
} from './terrain-editor-sculpt-tools';
import { TerrainHeightOperation, TerrainHeightUndoRedo } from './terrain-operation';

const clamp = math.clamp;

export class TerrainEditorSculpt extends TerrainEditorMode {
    public _brushes: TerrainBrush[];
    public _undo: TerrainHeightUndoRedo | null = null;
    public _currentBrush: TerrainBrush;
    private _currentTool: TerrainEditorSculptTool | null = null;

    constructor(gizmo: any) {
        super(gizmo);
        const circle = new TerrainCircleBrush(); circle.strength = 5;
        const image = new TerrainImageBrush(); image.strength = 5;
        this._brushes = [circle, image]; this._currentBrush = circle;
    }

    public setCurrentBrush(type: TerrainBrushType) {
        const old = this._currentBrush;
        this._currentBrush = this._brushes[type];
        this._currentBrush.position.set(old.position);
        this._currentBrush.radius = old.radius;
        this._currentBrush.strength = old.strength;
        this._currentBrush._setHeight = old._setHeight;
    }
    public getCurrentBrush() { return this._currentBrush; }
    public getBrush(type: TerrainBrushType) { return this._brushes[type]; }
    public setBrushImage(texture: Texture2D | null) {
        const imageBrush = this.getBrush(TerrainBrushType.IMAGE) as TerrainImageBrush;
        imageBrush.image = texture; this.setCurrentBrush(texture ? TerrainBrushType.IMAGE : TerrainBrushType.CIRCLE);
    }
    public setSculptBrushRotation(rotation: number) { (this.getBrush(TerrainBrushType.IMAGE) as TerrainImageBrush)._rotation = rotation; }

    public onUpdate(terrain: Terrain, deltaTime: number, isShiftDown: boolean) {
        if (!this._currentTool) return;
        const modifiers = new TerrainEdModifierKeyState(); modifiers.siftPressed = isShiftDown;
        this._updateHeight(terrain, deltaTime, modifiers);
        this.gizmo.isTerrainChange = true;
    }
    public forceUpdate() { TerrainBrush.updateBrushDepthOffsetToMaterial(this._currentBrush.material); }

    public onUpdateBrushPosition(terrain: Terrain, position: Vec3) {
        const brush = this._currentBrush; brush.update(terrain, position);
        const bbmin = new Vec2(), bbmax = new Vec2(); brush.getBound(bbmin, bbmax);
        const brushRect = new Rect(bbmin.x, bbmin.y, bbmax.x - bbmin.x, bbmax.y - bbmin.y);
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
        this._undo = new TerrainHeightUndoRedo(terrain);
        let mode = eTerrainTerrainEditorSculptToolMode.SCULPT;
        if (this.gizmo.isSmooth) mode = eTerrainTerrainEditorSculptToolMode.SMOOTH;
        else if (this.gizmo.isFlatten) mode = eTerrainTerrainEditorSculptToolMode.FLATTEN;
        else if (this.gizmo.isSetHeight) mode = eTerrainTerrainEditorSculptToolMode.SET_HEIGHT;
        switch (mode) {
            case eTerrainTerrainEditorSculptToolMode.SMOOTH: this._currentTool = new TerrainEditorSculptTool_Smooth(); break;
            case eTerrainTerrainEditorSculptToolMode.FLATTEN: this._currentTool = new TerrainEditorSculptTool_Flatten(); break;
            case eTerrainTerrainEditorSculptToolMode.SET_HEIGHT: this._currentTool = new TerrainEditorSculptTool_SetHeight(this._currentBrush._setHeight); break;
            default: this._currentTool = new TerrainEditorSculptTool_Sculpt(this.gizmo.isConcave); break;
        }
        const x = Math.floor(this._currentBrush.position.x / terrain.info.tileSize);
        const y = Math.floor(this._currentBrush.position.z / terrain.info.tileSize);
        this._currentTool.start(terrain, x, y);
    }

    public onMouseUp() {
        if (this._undo?.data.length || this._undo?.redoOperations.length) Service.Undo.push(this._undo);
        this._undo = null; this._currentTool = null;
    }

    public _updateHeight(terrain: Terrain, deltaTime: number, modifiers: TerrainEdModifierKeyState) {
        if (!this._currentTool) return;
        const bbmin = new Vec2(), bbmax = new Vec2(); this._currentBrush.getBound(bbmin, bbmax);
        let x1 = Math.floor(bbmin.x / terrain.info.tileSize), y1 = Math.floor(bbmin.y / terrain.info.tileSize);
        let x2 = Math.floor(bbmax.x / terrain.info.tileSize), y2 = Math.floor(bbmax.y / terrain.info.tileSize);
        const maxX = terrain.info.vertexCount[0] - 1, maxY = terrain.info.vertexCount[1] - 1;
        if (x1 > maxX || x2 < 0 || y1 > maxY || y2 < 0) return;
        x1 = clamp(x1, 0, maxX); y1 = clamp(y1, 0, maxY); x2 = clamp(x2, 0, maxX); y2 = clamp(y2, 0, maxY);
        const operation = new TerrainHeightOperation(terrain); this._undo?.redoOperations.push(operation);
        for (let y = y1; y <= y2; ++y) {
            for (let x = x1; x <= x2; ++x) {
                let height = terrain.getHeightClamp(x, y);
                this._undo?.push(x, y, height);
                const delta = this._currentBrush.getDelta(x * terrain.info.tileSize, y * terrain.info.tileSize) * deltaTime;
                height = this._currentTool.apply(terrain, x, y, height, delta, modifiers);
                operation.push(x, y, height);
            }
        }
        operation.apply();
        Service.Terrain?.onSculpt(terrain.node);
    }
}
