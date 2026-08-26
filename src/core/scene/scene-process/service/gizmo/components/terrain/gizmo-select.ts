import { Terrain, TerrainInfo, TerrainLayer, TERRAIN_MAX_LAYER_COUNT, assetManager } from 'cc';
import { Service } from '../../../core/decorator';
import { loadAny } from '../../../node/node-create';
import GizmoBase from '../../base/gizmo-base';
import { TerrainEditor } from './terrain-editor';
import { eTerrainEditorMode } from './terrain-editor-mode';
import { TerrainBrushType, TerrainImageBrush } from './terrain-brush';
import type { GizmoMouseEvent } from '../../utils/defines';

interface IBrush { radius: number; strength: number; _setHeight: number; }
interface ITerrainInfo { tileSize: number; weightMapSize: number; lightMapSize: number; blockCount: number[]; }

/** Component gizmo containing all Terrain editing operations. */
export default class TerrainGizmo extends GizmoBase<Terrain> {
    private _editor!: TerrainEditor;
    private _isEditorInit = false;
    private _isShiftDown = false;
    private _isConcave = false;
    private _isSmooth = false;
    private _isFlatten = false;
    private _isSetHeight = false;

    public get editor() { return this._editor; }
    public get isConcave() { return this._isConcave; }
    public get isSmooth() { return this._isSmooth; }
    public get isFlatten() { return this._isFlatten; }
    public get isSetHeight() { return this._isSetHeight; }
    public applySmooth(value: boolean) { this._isSmooth = value; }
    public get isTerrainChange() { return !!this.target && Service.Terrain.isTerrainChange; }
    public set isTerrainChange(value: boolean) {
        if (this.target) { (this.target as any).manager = Service.Terrain; (this.target as any).isTerrainChange = value; }
        if (value && this.target) Service.Terrain.select(this.target.node.uuid);
    }

    protected init() {
        this._editor = new TerrainEditor((Service.Camera as any).getCamera?.() ?? null, this);
    }
    protected onShow() {
        this.registerCameraMovedEvent(); this.initEditor(); this._editor.updateBlockDepthOffset();
    }
    protected onHide() {
        this._isEditorInit = false; this.unregisterCameraMoveEvent();
        this._editor?.clearBrush(); this._editor?.setEditTerrain(null); this._editor?.setCurrentLayer(0);
        Service.Engine.repaintInEditMode();
    }
    public onTargetUpdate() { if (this._isInitialized) this.initEditor(); }
    public onNodeChanged() { if (this._isInitialized) this.initEditor(); }
    public onEditorCameraMoved() { this._editor?.updateBlockDepthOffset(); }
    private initEditor() {
        if (!this._isEditorInit && this._editor) {
            this._editor.setEditTerrain(this.target); this._isEditorInit = true; Service.Engine.repaintInEditMode();
        }
    }

    async addLayerByUuid(uuid: string) {
        if (!this.target) return -1;
        const texture = await loadAny<any>(uuid);
        const layer = new TerrainLayer(); layer.detailMap = texture; layer.tileSize = 1;
        const index = this.target.addLayer(layer); this.updateTerrainAsset(); this.isTerrainChange = true; this.emitNodeChange();
        Service.Engine.repaintInEditMode(); return index;
    }
    async setSculptBrush(uuid: string) { return this.setBrushImage(eTerrainEditorMode.SCULPT, uuid); }
    async setPaintBrush(uuid: string) { return this.setBrushImage(eTerrainEditorMode.PAINT, uuid); }
    private async setBrushImage(mode: eTerrainEditorMode, uuid: string) {
        const editMode: any = this._editor.getMode(mode);
        if (!uuid) { editMode.setBrushImage(null); return true; }
        const texture = await loadAny<any>(uuid);
        const imageBrush = editMode.getBrush(TerrainBrushType.IMAGE) as TerrainImageBrush;
        if (imageBrush.image !== texture) editMode.setBrushImage(texture);
        this.isTerrainChange = true; Service.Engine.repaintInEditMode(); return true;
    }
    async setSculptBrushRotation(rotation: number) {
        (this._editor.getMode(eTerrainEditorMode.SCULPT) as any).setSculptBrushRotation(rotation);
    }
    async setLayerValue(index: number, uuid: string, extVal: any) {
        if (!this.target) return null;
        const layer = this.target.getLayer(index); if (!layer) return null;
        if (extVal) {
            if ('tileSize' in extVal) layer.tileSize = extVal.tileSize;
            if ('metallic' in extVal) layer.metallic = extVal.metallic;
            if ('roughness' in extVal) layer.roughness = extVal.roughness;
            if ('normalMap' in extVal) layer.normalMap = extVal.normalMap ? await loadAny<any>(extVal.normalMap) : null;
        }
        if (uuid) layer.detailMap = await loadAny<any>(uuid);
        this.updateTerrainAsset(); this.isTerrainChange = true; this.emitNodeChange(); Service.Engine.repaintInEditMode();
        return index;
    }
    removeLayerByIndex(index: number) {
        if (!this.target) return;
        this.target.removeLayer(index); this.updateTerrainAsset(); this.isTerrainChange = true; this.emitNodeChange(); Service.Engine.repaintInEditMode();
    }
    setCurrentEditLayer(index: number) { this._editor.setCurrentLayer(index); Service.Engine.repaintInEditMode(); }
    getLayers() {
        if (!this.target) return [];
        return Array.from({ length: TERRAIN_MAX_LAYER_COUNT }, (_, index) => {
            const layer = this.target!.getLayer(index);
            return layer ? {
                detailMap: layer.detailMap?._uuid ?? null, metallic: layer.metallic,
                normalMap: layer.normalMap?._uuid ?? null, roughness: layer.roughness, tileSize: layer.tileSize,
            } : null;
        });
    }
    getCurrentEditLayer() { return this._editor.getCurrentLayer(); }
    setCurrentEditMode(mode: eTerrainEditorMode, option?: any) {
        const config = Object.assign({ isSculptDown: false, isSmooth: false, isFlatten: false, isSetHeight: false }, option || {});
        this._isConcave = this._isShiftDown = !!config.isSculptDown; this._isSmooth = !!config.isSmooth;
        this._isFlatten = !!config.isFlatten; this._isSetHeight = !!config.isSetHeight;
        this._editor.setMode(mode); Service.Engine.repaintInEditMode();
    }
    queryTerrainInfo(): ITerrainInfo | null {
        const info = this.target?.info; return info ? {
            tileSize: info.tileSize, weightMapSize: info.weightMapSize, lightMapSize: info.lightMapSize, blockCount: [...info.blockCount],
        } : null;
    }
    changeTerrainInfo(info: any) {
        if (!this.target) return;
        const terrainInfo = new TerrainInfo(); Object.assign(terrainInfo, info); this.target.rebuild(terrainInfo);
        this.isTerrainChange = true; this.emitNodeChange(); Service.Engine.repaintInEditMode();
    }
    queryBrushOfMode(mode: eTerrainEditorMode): IBrush | null {
        if (mode !== eTerrainEditorMode.SCULPT && mode !== eTerrainEditorMode.PAINT) return null;
        const brush = (this._editor.getMode(mode) as any).getCurrentBrush();
        return { radius: brush.radius, strength: brush.strength, _setHeight: brush._setHeight };
    }
    setBrushOfMode(mode: eTerrainEditorMode, setting: any) {
        if (mode !== eTerrainEditorMode.SCULPT && mode !== eTerrainEditorMode.PAINT) return;
        const brush = (this._editor.getMode(mode) as any).getCurrentBrush();
        for (const key of Object.keys(setting || {})) if (key !== 'material' && setting[key] !== undefined) brush[key] = setting[key];
    }
    getBlockInfo() {
        const mode = this._editor.getMode(eTerrainEditorMode.SELECT); const index = mode.getCurrentBlockIndex() ?? [0, 0];
        const weight = mode.getCurrentWeightData();
        return {
            index: { x: index[0], y: index[1] },
            weight: weight ? { data: Array.from(weight.data), width: weight.width, height: weight.height } : null,
            layers: mode.getCurrentLayerList().map((layer: any) => layer?._uuid ?? ''),
        };
    }
    emitNodeChange() { if (this.target) this.onComponentChanged(this.target.node); }
    onKeyDown(event: any) { if (event.shiftKey) this._isShiftDown = true; }
    onKeyUp(event: any) { if (event.keyCode === 16) this._isShiftDown = this._isConcave; }
    onUpdate(deltaTime: number) { this._editor?.update(deltaTime, this._isShiftDown); }
    onCameraControlModeChanged(mode: number) { if (mode !== 0 && this._editor?.isChanged) this.emitNodeChange(); }
    updateTerrainAsset() { if (this.target?._asset) this.target.exportLayerListToAsset(this.target._asset); }

    public onControllerMouseDown(event: GizmoMouseEvent) { event.propagationStopped = true; this._isShiftDown = event.shiftKey; this._editor.onMouseDown(event.x, event.y); }
    public onControllerMouseMove(event: GizmoMouseEvent) { event.propagationStopped = true; this._editor.onMouseMove(event.x, event.y); }
    public onControllerMouseUp(event: GizmoMouseEvent) { event.propagationStopped = true; if (this._editor.isChanged) this.emitNodeChange(); this._editor.onMouseUp(); }
    public onControllerHoverOut() { this._editor.onHoverOut(); }
}
