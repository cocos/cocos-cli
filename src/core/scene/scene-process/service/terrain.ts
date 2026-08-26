import { Component, Terrain, TerrainAsset } from 'cc';
import { BaseService, register } from './core';
import { ServiceEvents } from './core/global-events';
import { getEditorNodeByUuid, getEditorNodeByPath } from './gizmo/utils/editor-node';
import { loadAny } from './node/node-create';
import { Rpc } from '../rpc';
import type { ITerrainEvents, ITerrainService } from '../../common';

/**
 * Terrain 资源生命周期管理。
 *
 * 3.x 的 terrain manager 依赖 Editor.Dialog/Plugin；CLI 只保留其数据和资产接口，
 * 将“是否询问用户”交给 pink。已有 .terrain 资源直接 saveAsset，未绑定资源时返回 2，
 * 由 UI 决定 Save As 的目标 URL。
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

    private terrainOfNode(node: any): Terrain | null {
        return node?.components?.find((component: Component) => component instanceof Terrain
            || (component as any).__classname__ === 'cc.Terrain') as Terrain | null ?? null;
    }

    private terrainOfUuid(uuid: string): Terrain | null {
        return this.terrainOfNode(getEditorNodeByUuid(uuid));
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
        if (component instanceof Terrain) this.removeComponent(component);
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
}
