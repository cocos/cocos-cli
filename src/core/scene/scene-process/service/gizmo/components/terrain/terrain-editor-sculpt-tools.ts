import type { Terrain } from 'cc';
import { TerrainEdModifierKeyState } from './terrain-brush';

export enum eTerrainTerrainEditorSculptToolMode { SCULPT, SMOOTH, FLATTEN, SET_HEIGHT }

export class TerrainEditorSculptTool {
    start(_terrain: Terrain, _x: number, _y: number) {}
    apply(_terrain: Terrain, _x: number, _y: number, h: number, _delta: number, _modifiers: TerrainEdModifierKeyState) { return h; }
}
export class TerrainEditorSculptTool_Sculpt extends TerrainEditorSculptTool {
    constructor(public _concave: boolean) { super(); }
    apply(_terrain: Terrain, _x: number, _y: number, h: number, delta: number, modifiers: TerrainEdModifierKeyState) {
        return h + (this._concave || modifiers.siftPressed ? -delta : delta);
    }
}
export class TerrainEditorSculptTool_Smooth extends TerrainEditorSculptTool {
    apply(terrain: Terrain, x: number, y: number, h: number, delta: number) {
        const average = (terrain.getHeightClamp(x - 1, y - 1) + h + terrain.getHeightClamp(x + 1, y + 1)) / 3;
        return h + delta * 3 * (average - h);
    }
}
export class TerrainEditorSculptTool_Flatten extends TerrainEditorSculptTool {
    protected _height = 0;
    start(terrain: Terrain, x: number, y: number) { this._height = terrain.getHeightClamp(x, y); }
    apply(_terrain: Terrain, _x: number, _y: number, h: number, delta: number) {
        return h > this._height ? Math.max(h - delta, this._height) : Math.min(h + delta, this._height);
    }
}
export class TerrainEditorSculptTool_SetHeight extends TerrainEditorSculptTool_Flatten {
    constructor(height: number) { super(); this._height = height; }
    start(_terrain: Terrain, _x: number, _y: number) {}
}
