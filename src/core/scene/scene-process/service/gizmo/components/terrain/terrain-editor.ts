import { Camera, Terrain, Vec3 } from 'cc';
import { Service } from '../../../core/decorator';
import ControllerUtils from '../../utils/controller-utils';
import { TerrainBrush } from './terrain-brush';
import { TerrainEditorManage } from './terrain-editor-manage';
import { TerrainEditorMode, eTerrainEditorMode } from './terrain-editor-mode';
import { TerrainEditorPaint } from './terrain-editor-paint';
import { TerrainEditorSculpt } from './terrain-editor-sculpt';
import { TerrainEditorSelect } from './terrain-editor-select';
import type TerrainGizmo from './gizmo-select';

const tempVec3_1 = new Vec3();
const tempVec3_2 = new Vec3();
const tempVec3_3 = new Vec3();

export class TerrainEditor {
    private _terrain: Terrain | null = null;
    private _modes: [TerrainEditorManage, TerrainEditorSculpt, TerrainEditorPaint, TerrainEditorSelect];
    private _currentMode: TerrainEditorMode | null = null;
    private _cameraComp: Camera | null;
    public isChanged = false;
    private _gizmo: TerrainGizmo;

    constructor(camera: Camera | null, gizmo: TerrainGizmo) {
        this._cameraComp = camera;
        this._gizmo = gizmo;
        this._modes = [
            new TerrainEditorManage(gizmo), new TerrainEditorSculpt(gizmo),
            new TerrainEditorPaint(gizmo), new TerrainEditorSelect(gizmo),
        ];
        this.setMode(eTerrainEditorMode.MANAGE);
    }
    public setEditTerrain(terrain: Terrain | null) { this._terrain = terrain; }
    public getEditTerrain() { return this._terrain; }
    public setMode(mode: eTerrainEditorMode) {
        this._currentMode?.onDeactivate(); this._currentMode = this._modes[mode]; this._currentMode.onActivate(); this.clearBrush();
    }
    public clearBrush() {
        this._terrain?.getBlocks().forEach((block) => block.setBrushMaterial(null));
        this._currentMode?.onDeactivate();
    }
    public getMode<T extends eTerrainEditorMode>(mode: T) { return this._modes[mode] as [TerrainEditorManage, TerrainEditorSculpt, TerrainEditorPaint, TerrainEditorSelect][T]; }
    public getCurrentMode() { return this._currentMode; }
    public getCurrentModeType() {
        const index = this._modes.indexOf(this._currentMode as any);
        return index < 0 ? eTerrainEditorMode.SCULPT : index as eTerrainEditorMode;
    }
    public setCurrentLayer(layer: number) { this.getMode(eTerrainEditorMode.PAINT).setCurrentLayer(layer); }
    public getCurrentLayer() { return this.getMode(eTerrainEditorMode.PAINT).getCurrentLayer(); }
    public update(deltaTime: number, shiftDown: boolean) {
        if (!this._currentMode || !this._terrain) return;
        this._currentMode.onUpdate(this._terrain, deltaTime, shiftDown);
        Service.Engine.repaintInEditMode();
    }
    public onMouseDown(x: number, y: number) {
        if (!this._terrain) return;
        this.isChanged = false;
        const sculpt = this.getMode(eTerrainEditorMode.SCULPT), paint = this.getMode(eTerrainEditorMode.PAINT), select = this.getMode(eTerrainEditorMode.SELECT);
        if (this._currentMode === sculpt) { sculpt.onMouseDown(this._terrain); this.isChanged = true; }
        else if (this._currentMode === paint) { paint.onMouseDown(this._terrain); this.isChanged = true; }
        else if (this._currentMode === select && this._cameraComp) select.onMouseDown(this._terrain, this._cameraComp, x, y);
        Service.Engine.repaintInEditMode();
    }
    public onMouseUp() {
        if (!this._terrain) return;
        const sculpt = this.getMode(eTerrainEditorMode.SCULPT), paint = this.getMode(eTerrainEditorMode.PAINT);
        if (this._currentMode === sculpt) sculpt.onMouseUp(); else if (this._currentMode === paint) paint.onMouseUp();
        this.isChanged = false; Service.Engine.repaintInEditMode();
    }
    public onMouseMove(x: number, y: number) {
        if (!this._terrain || !this._cameraComp) return;
        const from = this._cameraComp.node.getWorldPosition();
        tempVec3_2.set(x, y, 0); this._cameraComp.screenToWorld(tempVec3_2, tempVec3_1);
        Vec3.subtract(tempVec3_3, tempVec3_1, from).normalize();
        const hit = this._terrain.rayCheck(from, tempVec3_3, 0.35, true);
        if (!hit) return;
        const sculpt = this.getMode(eTerrainEditorMode.SCULPT), paint = this.getMode(eTerrainEditorMode.PAINT);
        if (this._currentMode === sculpt) { sculpt.onUpdateBrushPosition(this._terrain, hit); this.isChanged = true; }
        else if (this._currentMode === paint) { paint.onUpdateBrushPosition(this._terrain, hit); this.isChanged = true; }
        Service.Engine.repaintInEditMode();
    }
    public onHoverOut() {
        if (this._currentMode !== this.getMode(eTerrainEditorMode.SELECT)) { this.clearBrush(); Service.Engine.repaintInEditMode(); }
    }
    public updateBlockDepthOffset() {
        const node = this._gizmo.target?.node, camera = this._cameraComp;
        if (!node || !camera) return;
        TerrainBrush.updateBrushDepthOffset(ControllerUtils.getCameraDistanceFactor(node.position, camera.node));
        if (this._currentMode === this.getMode(eTerrainEditorMode.SELECT)) { this.getMode(eTerrainEditorMode.SELECT).forceUpdate(); Service.Engine.repaintInEditMode(); }
    }
}
