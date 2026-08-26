import type { Terrain } from 'cc';

export enum eTerrainEditorMode { MANAGE, SCULPT, PAINT, SELECT }

export class TerrainEditorMode {
    protected _gizmo: any;
    constructor(gizmo: any) { this._gizmo = gizmo; }
    get gizmo() { return this._gizmo; }
    public onUpdate(_terrain: Terrain, _dTime: number, _isShiftDown: boolean) {}
    public onActivate() {}
    public onDeactivate() {}
    public forceUpdate() {}
}
