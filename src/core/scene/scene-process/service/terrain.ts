import { Component, Terrain, TerrainAsset, TerrainInfo, TerrainLayer, Texture2D, TERRAIN_MAX_LAYER_COUNT } from 'cc';
import { BaseService, queryRegisteredService, register } from './core';
import { ServiceEvents } from './core/global-events';
import { getEditorNodeByUuid, getEditorNodeByPath } from './gizmo/utils/editor-node';
import { loadAny } from './node/node-create';
import { Rpc } from '../rpc';
import type {
    ITerrainBlockData,
    ITerrainBrushPatch,
    ITerrainEditorState,
    ITerrainEvents,
    ITerrainInvalidSnapshot,
    ITerrainLayerPatch,
    ITerrainLayerState,
    ITerrainManageState,
    ITerrainPaintSessionPatch,
    ITerrainService,
    ITerrainSculptSessionPatch,
    ITerrainTarget,
    TerrainBlockReadResult,
    TerrainEditorMode,
    TerrainReadResult,
    IUndoCommand,
    IUndoRedoResult,
    IUndoService,
} from '../../common';

interface ITerrainSessionGizmo {
    target: Terrain | null;
    readTerrainState(): ITerrainEditorState;
    setTerrainMode(mode: TerrainEditorMode): void;
    setTerrainCurrentLayer(currentLayer: number): void;
    updateTerrainSculptSession(patch: ITerrainSculptSessionPatch): void;
    updateTerrainPaintSession(patch: ITerrainPaintSessionPatch): void;
    readTerrainBlock(): ITerrainBlockData | null;
}

interface IGizmoServiceLookup {
    getComponentGizmo(component: Component): unknown;
}

const terrainEditorModes = new Set<TerrainEditorMode>(['manage', 'sculpt', 'paint', 'block']);
const terrainSculptTools = new Set<NonNullable<ITerrainSculptSessionPatch['tool']>>([
    'bulge', 'sunken', 'smooth', 'flatten', 'set-height',
]);
const terrainBrushKinds = new Set<NonNullable<ITerrainBrushPatch['kind']>>(['circle', 'image']);

function copyTarget(target: ITerrainTarget): ITerrainTarget {
    return { nodeUuid: target.nodeUuid, componentUuid: target.componentUuid };
}

function isTerrainTarget(value: unknown): value is ITerrainTarget {
    if (!value || typeof value !== 'object') return false;
    const target = value as Partial<ITerrainTarget>;
    return typeof target.nodeUuid === 'string' && target.nodeUuid.length > 0
        && typeof target.componentUuid === 'string' && target.componentUuid.length > 0;
}

function isTerrainSessionGizmo(value: unknown): value is ITerrainSessionGizmo {
    if (!value || typeof value !== 'object') return false;
    const gizmo = value as Partial<ITerrainSessionGizmo>;
    return 'target' in gizmo
        && typeof gizmo.readTerrainState === 'function'
        && typeof gizmo.setTerrainMode === 'function'
        && typeof gizmo.setTerrainCurrentLayer === 'function'
        && typeof gizmo.updateTerrainSculptSession === 'function'
        && typeof gizmo.updateTerrainPaintSession === 'function'
        && typeof gizmo.readTerrainBlock === 'function';
}

function normalizeBrushPatch(value: unknown): ITerrainBrushPatch | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const source = value as ITerrainBrushPatch;
    const patch: ITerrainBrushPatch = {};
    if (source.kind && terrainBrushKinds.has(source.kind)) patch.kind = source.kind;
    for (const key of ['radius', 'strength', 'rotation', 'setHeight'] as const) {
        if (typeof source[key] === 'number' && Number.isFinite(source[key])) patch[key] = source[key];
    }
    return Object.keys(patch).length ? patch : undefined;
}

function normalizeSculptPatch(value: unknown): ITerrainSculptSessionPatch | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const source = value as ITerrainSculptSessionPatch;
    const patch: ITerrainSculptSessionPatch = {};
    if (source.tool && terrainSculptTools.has(source.tool)) patch.tool = source.tool;
    const brush = normalizeBrushPatch(source.brush);
    if (brush) patch.brush = brush;
    return Object.keys(patch).length ? patch : undefined;
}

function normalizePaintPatch(value: unknown): ITerrainPaintSessionPatch | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const brush = normalizeBrushPatch((value as ITerrainPaintSessionPatch).brush);
    return brush ? { brush } : undefined;
}


interface ITerrainLayerAssets {
    detailMap?: Texture2D | null;
    normalMap?: Texture2D | null;
}

function copyManageState(value: ITerrainManageState): ITerrainManageState {
    return {
        tileSize: value.tileSize,
        weightMapSize: value.weightMapSize,
        lightMapSize: value.lightMapSize,
        blockCount: [value.blockCount[0], value.blockCount[1]],
    };
}

function copyLayerState(value: ITerrainLayerState): ITerrainLayerState {
    return {
        detailMapUuid: value.detailMapUuid,
        normalMapUuid: value.normalMapUuid,
        metallic: value.metallic,
        roughness: value.roughness,
        tileSize: value.tileSize,
    };
}

function copyLayerStates(values: Array<ITerrainLayerState | null>): Array<ITerrainLayerState | null> {
    return values.map((value) => value ? copyLayerState(value) : null);
}

function isFinitePositive(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isPositiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximum;
}

function isUuidOrNull(value: unknown): value is string | null {
    return value === null || (typeof value === 'string' && value.length > 0);
}

function normalizeManageState(value: unknown): ITerrainManageState | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as Partial<ITerrainManageState>;
    if (!isFinitePositive(source.tileSize)
        || !isPositiveInteger(source.weightMapSize, 0x7fff)
        || !isPositiveInteger(source.lightMapSize, 0x7fff)
        || !Array.isArray(source.blockCount)
        || source.blockCount.length !== 2
        || !isPositiveInteger(source.blockCount[0])
        || !isPositiveInteger(source.blockCount[1])) {
        return null;
    }
    return {
        tileSize: source.tileSize,
        weightMapSize: source.weightMapSize,
        lightMapSize: source.lightMapSize,
        blockCount: [source.blockCount[0], source.blockCount[1]],
    };
}

function normalizeLayerState(value: unknown): ITerrainLayerState | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as Partial<ITerrainLayerState>;
    const { detailMapUuid, normalMapUuid, metallic, roughness, tileSize } = source;
    if (!isUuidOrNull(detailMapUuid)
        || !isUuidOrNull(normalMapUuid)
        || typeof metallic !== 'number' || !Number.isFinite(metallic)
        || typeof roughness !== 'number' || !Number.isFinite(roughness)
        || !isFinitePositive(tileSize)) {
        return null;
    }
    return { detailMapUuid, normalMapUuid, metallic, roughness, tileSize };
}

function normalizeLayerPatch(value: unknown): ITerrainLayerPatch | null {
    if (!value || typeof value !== 'object') return null;
    const source = value as ITerrainLayerPatch;
    const patch: ITerrainLayerPatch = {};
    for (const key of ['detailMapUuid', 'normalMapUuid'] as const) {
        if (!Object.hasOwn(source, key)) continue;
        if (!isUuidOrNull(source[key])) return null;
        patch[key] = source[key];
    }
    for (const key of ['metallic', 'roughness'] as const) {
        if (!Object.hasOwn(source, key)) continue;
        if (!Number.isFinite(source[key])) return null;
        patch[key] = source[key];
    }
    if (Object.hasOwn(source, 'tileSize')) {
        if (!isFinitePositive(source.tileSize)) return null;
        patch.tileSize = source.tileSize;
    }
    return Object.keys(patch).length ? patch : null;
}

function statesEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Terrain asset lifecycle and target-safe editor-session access.
 *
 * The public Terrain capability never exposes gizmos. This service validates the
 * requested node/component pair, adapts the matching internal gizmo, and returns
 * JSON-safe canonical snapshots for the Scene webview.
 */
@register('Terrain')
export class TerrainService extends BaseService<ITerrainEvents> implements ITerrainService {
    public readonly name = 'cc.Terrain' as const;
    public readonly editedComponents: Terrain[] = [];
    public readonly selectedComponents: Terrain[] = [];
    private _terrainUndoSequence = 0;

    init() {
        // SelectionService broadcasts paths, while the old manager received node UUIDs.
        // Keep both entry points so pink can use either protocol.
        ServiceEvents.on('selection:select', (path: string) => this.onSelectionSelect(path));
        ServiceEvents.on('selection:unselect', (path: string) => this.onSelectionUnselect(path));
        ServiceEvents.on('selection:clear', () => this.onSelectionClear());
    }

    private isTerrainComponent(component: Component | null | undefined): component is Terrain {
        return component instanceof Terrain || (component as any)?.__classname__ === 'cc.Terrain';
    }

    private terrainOfNode(node: any): Terrain | null {
        return node?.components?.find((component: Component) => this.isTerrainComponent(component)) as Terrain | null ?? null;
    }

    private terrainOfUuid(uuid: string): Terrain | null {
        return this.terrainOfNode(getEditorNodeByUuid(uuid));
    }

    private resolveTarget(target: ITerrainTarget): { component: Terrain; gizmo: ITerrainSessionGizmo } | null {
        if (!isTerrainTarget(target)) return null;
        const node = getEditorNodeByUuid(target.nodeUuid);
        const component = node?.components?.find((candidate: Component) => candidate.uuid === target.componentUuid
            && this.isTerrainComponent(candidate)) as Terrain | undefined;
        if (!component || component.node !== node || !this.selectedComponents.includes(component)) return null;

        const gizmoService = queryRegisteredService<IGizmoServiceLookup>('Gizmo');
        const gizmo = gizmoService?.getComponentGizmo(component);
        if (!isTerrainSessionGizmo(gizmo) || gizmo.target !== component) return null;
        return { component, gizmo };
    }

    private invalidResult(target: ITerrainTarget): ITerrainInvalidSnapshot {
        return { target: copyTarget(target), valid: false };
    }

    private readResolved(target: ITerrainTarget, gizmo: ITerrainSessionGizmo): TerrainReadResult {
        return { target: copyTarget(target), valid: true, ...gizmo.readTerrainState() };
    }

    /** Returns a canonical snapshot or `valid: false`; it never falls back to another Terrain. */
    public read(target: ITerrainTarget): TerrainReadResult {
        if (!isTerrainTarget(target)) return { target: { nodeUuid: '', componentUuid: '' }, valid: false };
        const resolved = this.resolveTarget(target);
        return resolved ? this.readResolved(target, resolved.gizmo) : this.invalidResult(target);
    }

    public setMode(target: ITerrainTarget, mode: TerrainEditorMode): TerrainReadResult {
        const resolved = this.resolveTarget(target);
        if (!resolved) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        if (!terrainEditorModes.has(mode)) return this.readResolved(target, resolved.gizmo);
        resolved.gizmo.setTerrainMode(mode);
        this.emit('terrain:session-changed', copyTarget(target));
        return this.read(target);
    }

    public setCurrentLayer(target: ITerrainTarget, currentLayer: number): TerrainReadResult {
        const resolved = this.resolveTarget(target);
        if (!resolved) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        if (!Number.isInteger(currentLayer) || currentLayer < -1) return this.readResolved(target, resolved.gizmo);
        resolved.gizmo.setTerrainCurrentLayer(currentLayer);
        this.emit('terrain:session-changed', copyTarget(target));
        return this.read(target);
    }

    public setSculptSession(target: ITerrainTarget, patch: ITerrainSculptSessionPatch): TerrainReadResult {
        const resolved = this.resolveTarget(target);
        if (!resolved) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        const normalized = normalizeSculptPatch(patch);
        if (!normalized) return this.readResolved(target, resolved.gizmo);
        resolved.gizmo.updateTerrainSculptSession(normalized);
        this.emit('terrain:session-changed', copyTarget(target));
        return this.read(target);
    }

    public setPaintSession(target: ITerrainTarget, patch: ITerrainPaintSessionPatch): TerrainReadResult {
        const resolved = this.resolveTarget(target);
        if (!resolved) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        const normalized = normalizePaintPatch(patch);
        if (!normalized) return this.readResolved(target, resolved.gizmo);
        resolved.gizmo.updateTerrainPaintSession(normalized);
        this.emit('terrain:session-changed', copyTarget(target));
        return this.read(target);
    }

    /** Reads the currently inspected block only; no Terrain mutation or Undo occurs. */
    public readBlock(target: ITerrainTarget): TerrainBlockReadResult {
        if (!isTerrainTarget(target)) return { target: { nodeUuid: '', componentUuid: '' }, valid: false };
        const resolved = this.resolveTarget(target);
        if (!resolved) return this.invalidResult(target);
        return { target: copyTarget(target), valid: true, block: resolved.gizmo.readTerrainBlock() };
    }

    /** Commits a full Manage draft as one CLI-owned Terrain mutation and Undo command. */
    public async saveManage(target: ITerrainTarget, manage: ITerrainManageState): Promise<TerrainReadResult> {
        const next = normalizeManageState(manage);
        if (!next) return this.read(target);
        const resolved = this.resolveTarget(target);
        if (!resolved) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        const undoService = this.getTerrainUndoService();
        if (!undoService) return this.readResolved(target, resolved.gizmo);

        const before = copyManageState(resolved.gizmo.readTerrainState().manage);
        if (statesEqual(before, next)) return this.readResolved(target, resolved.gizmo);
        if (!this.applyTerrainManageState(resolved.component, next)) return this.read(target);

        const result = this.read(target);
        if (!result.valid) return result;
        const after = copyManageState(result.manage);
        this.pushTerrainUndo(undoService, resolved.component, 'Save Terrain Manage', 'terrain:save-manage',
            () => this.applyTerrainManageState(resolved.component, before),
            () => this.applyTerrainManageState(resolved.component, after));
        return result;
    }

    /** Adds one complete layer; incompatible or unavailable textures leave Terrain untouched. */
    public async addLayer(target: ITerrainTarget, layer: ITerrainLayerState): Promise<TerrainReadResult> {
        const next = normalizeLayerState(layer);
        if (!next || !next.detailMapUuid) return this.read(target);
        const initial = this.resolveTarget(target);
        if (!initial) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        const undoService = this.getTerrainUndoService();
        if (!undoService) return this.readResolved(target, initial.gizmo);
        const assets = await this.loadLayerAssets(next);
        if (!assets?.detailMap) return this.read(target);

        const resolved = this.resolveTarget(target);
        if (!resolved) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        const before = copyLayerStates(resolved.gizmo.readTerrainState().layers);
        if (!this.addTerrainLayer(resolved.component, next, assets)) return this.read(target);

        const result = this.read(target);
        if (!result.valid) return result;
        const after = copyLayerStates(result.layers);
        this.pushTerrainUndo(undoService, resolved.component, 'Add Terrain Layer', 'terrain:add-layer',
            () => this.applyTerrainLayerStates(resolved.component, before),
            () => this.applyTerrainLayerStates(resolved.component, after));
        return result;
    }

    /** Removes a single layer slot as one CLI-owned Terrain mutation and Undo command. */
    public async removeLayer(target: ITerrainTarget, index: number): Promise<TerrainReadResult> {
        if (!this.isLayerIndex(index)) return this.read(target);
        const resolved = this.resolveTarget(target);
        if (!resolved) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        const undoService = this.getTerrainUndoService();
        if (!undoService) return this.readResolved(target, resolved.gizmo);
        const before = copyLayerStates(resolved.gizmo.readTerrainState().layers);
        if (!this.removeTerrainLayer(resolved.component, index)) return this.read(target);

        const result = this.read(target);
        if (!result.valid) return result;
        const after = copyLayerStates(result.layers);
        this.pushTerrainUndo(undoService, resolved.component, 'Remove Terrain Layer', 'terrain:remove-layer',
            () => this.applyTerrainLayerStates(resolved.component, before),
            () => this.applyTerrainLayerStates(resolved.component, after));
        return result;
    }

    /** Updates one layer slot; texture references are resolved before the target can mutate. */
    public async updateLayer(target: ITerrainTarget, index: number, patch: ITerrainLayerPatch): Promise<TerrainReadResult> {
        if (!this.isLayerIndex(index)) return this.read(target);
        const next = normalizeLayerPatch(patch);
        if (!next) return this.read(target);
        const initial = this.resolveTarget(target);
        if (!initial) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        const undoService = this.getTerrainUndoService();
        if (!undoService) return this.readResolved(target, initial.gizmo);
        const assets = await this.loadLayerAssets(next);
        if (!assets) return this.read(target);

        const resolved = this.resolveTarget(target);
        if (!resolved) return isTerrainTarget(target) ? this.invalidResult(target) : this.read(target);
        const before = copyLayerStates(resolved.gizmo.readTerrainState().layers);
        if (!this.updateTerrainLayer(resolved.component, index, next, assets)) return this.read(target);

        const result = this.read(target);
        if (!result.valid) return result;
        const after = copyLayerStates(result.layers);
        this.pushTerrainUndo(undoService, resolved.component, 'Update Terrain Layer', 'terrain:update-layer',
            () => this.applyTerrainLayerStates(resolved.component, before),
            () => this.applyTerrainLayerStates(resolved.component, after));
        return result;
    }

    private isLayerIndex(index: number): boolean {
        return Number.isInteger(index) && index >= 0 && index < TERRAIN_MAX_LAYER_COUNT;
    }

    private isAttachedTerrain(component: Terrain): boolean {
        return this.isTerrainComponent(component)
            && (component as any).isValid !== false
            && Array.isArray(component.node?.components)
            && component.node.components.includes(component);
    }

    private createTerrainInfo(state: ITerrainManageState): TerrainInfo {
        const info = new TerrainInfo();
        info.tileSize = state.tileSize;
        info.weightMapSize = state.weightMapSize;
        info.lightMapSize = state.lightMapSize;
        info.blockCount = [state.blockCount[0], state.blockCount[1]];
        return info;
    }

    private createTerrainLayer(state: ITerrainLayerState, assets: ITerrainLayerAssets): TerrainLayer {
        const layer = new TerrainLayer();
        layer.detailMap = assets.detailMap ?? null;
        layer.normalMap = assets.normalMap ?? null;
        layer.metallic = state.metallic;
        layer.roughness = state.roughness;
        layer.tileSize = state.tileSize;
        return layer;
    }

    private async loadTerrainTexture(uuid: string): Promise<Texture2D | null> {
        try {
            const texture = await loadAny<Texture2D>(uuid);
            return texture instanceof Texture2D ? texture : null;
        } catch (error) {
            console.warn(`[Terrain] load layer texture failed: ${uuid}`, error);
            return null;
        }
    }

    private async loadLayerAssets(value: Pick<ITerrainLayerState, 'detailMapUuid' | 'normalMapUuid'> | ITerrainLayerPatch): Promise<ITerrainLayerAssets | null> {
        const assets: ITerrainLayerAssets = {};
        for (const key of ['detailMapUuid', 'normalMapUuid'] as const) {
            if (!Object.hasOwn(value, key)) continue;
            const uuid = value[key];
            const assetKey = key === 'detailMapUuid' ? 'detailMap' : 'normalMap';
            if (uuid === null) {
                assets[assetKey] = null;
                continue;
            }
            if (typeof uuid !== 'string') return null;
            const texture = await this.loadTerrainTexture(uuid);
            if (!texture) return null;
            assets[assetKey] = texture;
        }
        return assets;
    }

    private applyTerrainManageState(component: Terrain, state: ITerrainManageState): boolean {
        if (!this.isAttachedTerrain(component)) return false;
        component.rebuild(this.createTerrainInfo(state));
        this.reportTerrainAuthoringChange(component);
        return true;
    }

    private addTerrainLayer(component: Terrain, state: ITerrainLayerState, assets: ITerrainLayerAssets): boolean {
        if (!this.isAttachedTerrain(component) || !assets.detailMap) return false;
        if (component.addLayer(this.createTerrainLayer(state, assets)) < 0) return false;
        this.reportTerrainAuthoringChange(component);
        return true;
    }

    private removeTerrainLayer(component: Terrain, index: number): boolean {
        if (!this.isAttachedTerrain(component) || !component.getLayer(index)) return false;
        component.removeLayer(index);
        this.reportTerrainAuthoringChange(component);
        return true;
    }

    private updateTerrainLayer(component: Terrain, index: number, patch: ITerrainLayerPatch, assets: ITerrainLayerAssets): boolean {
        if (!this.isAttachedTerrain(component)) return false;
        const layer = component.getLayer(index);
        if (!layer) return false;
        if (Object.hasOwn(patch, 'detailMapUuid')) layer.detailMap = assets.detailMap ?? null;
        if (Object.hasOwn(patch, 'normalMapUuid')) layer.normalMap = assets.normalMap ?? null;
        if (typeof patch.metallic === 'number') layer.metallic = patch.metallic;
        if (typeof patch.roughness === 'number') layer.roughness = patch.roughness;
        if (typeof patch.tileSize === 'number') layer.tileSize = patch.tileSize;
        this.reportTerrainAuthoringChange(component);
        return true;
    }

    private async applyTerrainLayerStates(component: Terrain, states: Array<ITerrainLayerState | null>): Promise<boolean> {
        const loaded = await Promise.all(states.map(async (state) => {
            if (!state) return null;
            const assets = await this.loadLayerAssets(state);
            return assets ? { state, assets } : undefined;
        }));
        if (loaded.some((value, index) => states[index] !== null && value === undefined) || !this.isAttachedTerrain(component)) {
            return false;
        }

        for (let index = 0; index < TERRAIN_MAX_LAYER_COUNT; index++) {
            const layer = loaded[index];
            if (layer) component.setLayer(index, this.createTerrainLayer(layer.state, layer.assets));
            else component.removeLayer(index);
        }
        this.reportTerrainAuthoringChange(component);
        return true;
    }

    private reportTerrainAuthoringChange(component: Terrain): void {
        if (component._asset) component.exportLayerListToAsset(component._asset);
        this.setDirty(component, true);
        ServiceEvents.emit('node:change', component.node, { type: 'component-changed' });
        queryRegisteredService<{ repaintInEditMode(): void }>('Engine')?.repaintInEditMode();
    }

    private getTerrainUndoService(): IUndoService | null {
        const undoService = queryRegisteredService<IUndoService>('Undo');
        return undoService && !undoService.isApplying() ? undoService : null;
    }

    private pushTerrainUndo(
        undoService: IUndoService,
        component: Terrain,
        label: string,
        type: string,
        undo: () => boolean | Promise<boolean>,
        redo: () => boolean | Promise<boolean>,
    ): void {
        const id = `${type}:${++this._terrainUndoSequence}`;
        const result = async (apply: () => boolean | Promise<boolean>): Promise<IUndoRedoResult> => {
            const success = await apply();
            return success
                ? { success: true, commandId: id, label }
                : { success: false, commandId: id, label, reason: 'Terrain target or texture is unavailable' };
        };
        const command: IUndoCommand = {
            meta: { id, label, type, scope: { editorType: 'scene' }, timestamp: Date.now() },
            undo: () => result(undo),
            redo: () => result(redo),
        };
        undoService.push(command);
    }

    private setManager(component: Terrain, value: any) {
        (component as any).manager = value;
    }

    private setDirty(component: Terrain, value: boolean) {
        (component as any).isTerrainChange = value;
        if (value) {
            this.emit('terrain:changed', component);
        }
    }

    public get isTerrainChange(): boolean {
        return this.editedComponents.some((component) => (component as any).isTerrainChange === true);
    }

    public set isTerrainChange(value: boolean) {
        for (const component of this.selectedComponents) {
            this.setDirty(component, value);
        }
    }

    public select(nodeUuid: string): void {
        const component = this.terrainOfUuid(nodeUuid);
        if (!component) return;
        this.setManager(component, this);
        if (!this.selectedComponents.includes(component)) this.selectedComponents.push(component);
        if (!this.editedComponents.includes(component)) this.editedComponents.push(component);
    }

    public unselect(nodeUuid: string): void {
        const component = this.terrainOfUuid(nodeUuid);
        if (!component) return;
        this.setManager(component, null);
        const selectedIndex = this.selectedComponents.indexOf(component);
        if (selectedIndex >= 0) this.selectedComponents.splice(selectedIndex, 1);
        // Keep editedComponents until the node is removed, like the 3.x manager.
    }

    public onSelectionSelect(path: string): void {
        const node = getEditorNodeByPath(path);
        if (node) this.select(node.uuid);
    }

    public onSelectionUnselect(path: string): void {
        const node = getEditorNodeByPath(path);
        if (node) this.unselect(node.uuid);
    }

    public onSelectionClear(): void {
        for (const component of this.selectedComponents) this.setManager(component, null);
        this.selectedComponents.length = 0;
    }

    public onNodeRemoved(node: any): void {
        const component = this.terrainOfNode(node);
        if (!component) return;
        this.removeComponent(component);
    }

    public onComponentRemoved(component: Component): void {
        if (this.isTerrainComponent(component)) this.removeComponent(component);
    }

    private removeComponent(component: Terrain) {
        this.setManager(component, null);
        const selected = this.selectedComponents.indexOf(component);
        if (selected >= 0) this.selectedComponents.splice(selected, 1);
        const edited = this.editedComponents.indexOf(component);
        if (edited >= 0) this.editedComponents.splice(edited, 1);
    }

    public onSculpt(node: any): void {
        this.emit('terrain:sculpt', node);
    }

    public serialize(component: Terrain): Uint8Array {
        const asset = component.exportAsset();
        // TerrainAsset's binary export is the canonical .terrain native payload.
        return asset._exportNativeData();
    }

    public async saveAsset(isClose = false, component?: Terrain): Promise<0 | 1 | 2> {
        void isClose;
        const targets = component ? [component] : this.editedComponents;
        let result: 0 | 1 | 2 = 1;
        for (const terrain of targets) {
            if (!(terrain as any).isTerrainChange) continue;
            const uuid = terrain._asset?._uuid;
            if (!uuid) {
                result = 2;
                continue;
            }
            try {
                const saved = await Rpc.getInstance().request('assetManager', 'saveAsset', [
                    uuid,
                    Buffer.from(this.serialize(terrain)),
                ]);
                if (!saved || saved.uuid !== uuid) {
                    result = 2;
                    continue;
                }
                this.setDirty(terrain, false);
                result = 0;
            } catch (error) {
                console.error('[Terrain] saveAsset failed:', error);
                result = 2;
            }
        }
        return result;
    }

    public async saveAssetDialog(file?: string, isClose = false): Promise<0 | 1 | 2> {
        let result: 0 | 1 | 2 = 1;
        for (const terrain of this.editedComponents) {
            if (!(terrain as any).isTerrainChange) continue;
            const uuid = terrain._asset?._uuid;
            if (uuid) {
                const code = await this.saveAsset(isClose, terrain);
                if (code === 2) result = 2;
                else if (code === 0) result = 0;
                continue;
            }

            // No UI is intentionally implemented here. pink can pass a db:// target
            // through `file` to create the asset, or use its own Save As dialog.
            if (!file) {
                result = 2;
                continue;
            }
            try {
                const created = await Rpc.getInstance().request('assetManager', 'createAsset', [{
                    target: file,
                    content: Buffer.from(this.serialize(terrain)),
                    overwrite: true,
                }]);
                if (created) {
                    (terrain as any)._asset = await loadAny<TerrainAsset>(created.uuid ?? created);
                    this.setDirty(terrain, false);
                    result = 0;
                } else {
                    result = 2;
                }
            } catch (error) {
                console.error('[Terrain] create terrain asset failed:', error);
                result = 2;
            }
        }
        return result;
    }

    public async close(): Promise<0 | 1 | 2> {
        if (!this.isTerrainChange) return 1;
        return this.saveAssetDialog(undefined, true);
    }

    public async addAssetToComp(assetUuid: string): Promise<void> {
        for (const terrain of this.selectedComponents) {
            if (assetUuid) {
                try {
                    (terrain as any)._asset = await loadAny<TerrainAsset>(assetUuid);
                } catch {
                    (terrain as any)._asset = null;
                }
            } else if (!(terrain as any)._asset) {
                (terrain as any)._asset = new TerrainAsset();
                this.setDirty(terrain, false);
            }
            ServiceEvents.emit('node:change', terrain.node, { type: 'component-changed' });
        }
    }

    public onAssetDeleted(uuid: string): void {
        for (const terrain of this.editedComponents) {
            if (terrain._asset?._uuid === uuid) {
                ServiceEvents.emit('node:change', terrain.node, { type: 'component-changed' });
            }
        }
    }

    public onEditorClosed(): void {
        this.onSelectionClear();
        this.editedComponents.length = 0;
    }

    public onEditorDisposed(): void {
        this.onEditorClosed();
    }
}
