import { Terrain, TerrainInfo, TerrainLayer, TERRAIN_MAX_LAYER_COUNT } from 'cc';
import type { Texture2D } from 'cc';
import { Service } from '../../../core/decorator';
import { loadAny } from '../../../node/node-create';
import GizmoBase from '../../base/gizmo-base';
import { TerrainEditor } from './terrain-editor';
import { TerrainEditorPaint } from './terrain-editor-paint';
import { TerrainEditorSculpt } from './terrain-editor-sculpt';
import { eTerrainEditorMode } from './terrain-editor-mode';
import { TerrainBrushType, TerrainImageBrush } from './terrain-brush';
import type {
    ITerrainBlockData,
    ITerrainBrushPatch,
    ITerrainBrushState,
    ITerrainEditorState,
    ITerrainPaintSessionPatch,
    ITerrainSculptSessionPatch,
    TerrainEditorMode,
    TerrainSculptTool,
} from '../../../../../common';
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

    /**
     * Internal adapter for TerrainService. It intentionally returns plain data
     * instead of exposing this gizmo or its editor internals to Scene callers.
     */
    public readTerrainState(): ITerrainEditorState {
        const info = this.queryTerrainInfo() ?? { tileSize: 0, weightMapSize: 0, lightMapSize: 0, blockCount: [0, 0] as [number, number] };
        return {
            manage: {
                tileSize: info.tileSize,
                weightMapSize: info.weightMapSize,
                lightMapSize: info.lightMapSize,
                blockCount: [info.blockCount[0] ?? 0, info.blockCount[1] ?? 0],
            },
            layers: this.getLayers().map((layer) => layer ? ({
                detailMapUuid: layer.detailMap,
                normalMapUuid: layer.normalMap,
                metallic: layer.metallic,
                roughness: layer.roughness,
                tileSize: layer.tileSize,
            }) : null),
            mode: this.getTerrainMode(),
            currentLayer: this._editor.getCurrentLayer(),
            sculpt: {
                tool: this.getTerrainSculptTool(),
                brush: this.getTerrainBrushState(eTerrainEditorMode.SCULPT),
            },
            paint: {
                brush: this.getTerrainBrushState(eTerrainEditorMode.PAINT),
            },
        };
    }

    public setTerrainMode(mode: TerrainEditorMode): void {
        const internalMode: Record<TerrainEditorMode, eTerrainEditorMode> = {
            manage: eTerrainEditorMode.MANAGE,
            sculpt: eTerrainEditorMode.SCULPT,
            paint: eTerrainEditorMode.PAINT,
            block: eTerrainEditorMode.SELECT,
        };
        this._editor.setMode(internalMode[mode]);
        Service.Engine.repaintInEditMode();
    }

    public setTerrainCurrentLayer(currentLayer: number): void {
        if (!Number.isInteger(currentLayer) || currentLayer < -1) return;
        if (currentLayer >= 0 && !this.target?.getLayer(currentLayer)) return;
        this._editor.setCurrentLayer(currentLayer);
        Service.Engine.repaintInEditMode();
    }

    public updateTerrainSculptSession(patch: ITerrainSculptSessionPatch): void {
        if (patch.tool) this.setTerrainSculptTool(patch.tool);
        if (patch.brush) this.updateTerrainBrush(eTerrainEditorMode.SCULPT, patch.brush);
        Service.Engine.repaintInEditMode();
    }

    public updateTerrainPaintSession(patch: ITerrainPaintSessionPatch): void {
        if (patch.brush) this.updateTerrainBrush(eTerrainEditorMode.PAINT, patch.brush);
        Service.Engine.repaintInEditMode();
    }

    public readTerrainBlock(): ITerrainBlockData | null {
        const select = this._editor.getMode(eTerrainEditorMode.SELECT);
        const index = select.getCurrentBlockIndex();
        if (!index) return null;
        const weight = select.getCurrentWeightData();
        return {
            index: { x: index[0], y: index[1] },
            layers: select.getCurrentLayerList().map((layer) => layer?._uuid ?? null),
            weight: weight ? {
                width: weight.width,
                height: weight.height,
                data: Array.from(weight.data),
            } : null,
        };
    }

    private getTerrainMode(): TerrainEditorMode {
        switch (this._editor.getCurrentModeType()) {
            case eTerrainEditorMode.MANAGE: return 'manage';
            case eTerrainEditorMode.SCULPT: return 'sculpt';
            case eTerrainEditorMode.PAINT: return 'paint';
            default: return 'block';
        }
    }

    private getTerrainSculptTool(): TerrainSculptTool {
        if (this._isSmooth) return 'smooth';
        if (this._isFlatten) return 'flatten';
        if (this._isSetHeight) return 'set-height';
        return this._isConcave ? 'sunken' : 'bulge';
    }

    private setTerrainSculptTool(tool: TerrainSculptTool): void {
        this._isConcave = tool === 'sunken';
        this._isShiftDown = this._isConcave;
        this._isSmooth = tool === 'smooth';
        this._isFlatten = tool === 'flatten';
        this._isSetHeight = tool === 'set-height';
    }

    private getTerrainBrushState(mode: eTerrainEditorMode.SCULPT | eTerrainEditorMode.PAINT): ITerrainBrushState {
        const editor = this.getTerrainBrushEditor(mode);
        const brush = editor.getCurrentBrush();
        const image = editor.getBrush(TerrainBrushType.IMAGE) as TerrainImageBrush;
        return {
            kind: brush === image ? 'image' : 'circle',
            imageUuid: image.image?._uuid ?? null,
            radius: brush.radius,
            strength: brush.strength,
            rotation: image._rotation,
            setHeight: brush._setHeight,
        };
    }

    private updateTerrainBrush(mode: eTerrainEditorMode.SCULPT | eTerrainEditorMode.PAINT, patch: ITerrainBrushPatch): void {
        const editor = this.getTerrainBrushEditor(mode);
        const image = editor.getBrush(TerrainBrushType.IMAGE) as TerrainImageBrush;
        const brush = editor.getCurrentBrush();
        if (typeof patch.radius === 'number') brush.radius = patch.radius;
        if (typeof patch.strength === 'number') brush.strength = patch.strength;
        if (typeof patch.rotation === 'number') image._rotation = patch.rotation;
        if (typeof patch.setHeight === 'number') brush._setHeight = patch.setHeight;
    }

    private getTerrainBrushEditor(mode: eTerrainEditorMode.SCULPT | eTerrainEditorMode.PAINT): TerrainEditorSculpt | TerrainEditorPaint {
        return mode === eTerrainEditorMode.SCULPT
            ? this._editor.getMode(eTerrainEditorMode.SCULPT)
            : this._editor.getMode(eTerrainEditorMode.PAINT);
    }

    async addLayerByUuid(uuid: string) {
        if (!this.target) return -1;
        const texture = await loadAny<any>(uuid);
        const layer = new TerrainLayer(); layer.detailMap = texture; layer.tileSize = 1;
        const index = this.target.addLayer(layer); this.updateTerrainAsset(); this.isTerrainChange = true; this.emitNodeChange();
        Service.Engine.repaintInEditMode(); return index;
    }

    /** Applies a service-validated Sculpt brush texture without changing Terrain asset state. */
    public setSculptBrushTexture(texture: Texture2D | null): void {
        const sculpt = this.getTerrainBrushEditor(eTerrainEditorMode.SCULPT);
        sculpt.setBrushImage(texture);
        Service.Engine.repaintInEditMode();
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
