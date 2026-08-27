import { Component, Terrain, TerrainAsset } from 'cc';
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
    ITerrainPaintSessionPatch,
    ITerrainService,
    ITerrainSculptSessionPatch,
    ITerrainTarget,
    TerrainBlockReadResult,
    TerrainEditorMode,
    TerrainReadResult,
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
