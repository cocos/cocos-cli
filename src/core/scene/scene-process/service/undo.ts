import { BaseService } from './core';
import { register } from './core/decorator';
import { SceneUndoManager } from './undo/scene-undo-manager';
import { EventSourceType, NodeEventType, type IUndoService, type IUndoEvents, type IUndoBeginOptions, type IUndoCheckpoint, type IUndoCommand, type IUndoGroupOptions, type IUndoOperationOptions, type IUndoPushWithPreviousOptions, type IUndoRedoResult, type IUndoScope } from '../../common';
import type { Component, Node, Scene } from 'cc';
import { ServiceEvents } from './core/global-events';
import type { ISnapshotAdapter } from './undo/commands/snapshot-command';
import { restoreComponentSnapshotDump, restoreNodeSnapshotDump, snapshotMapsEqual } from './undo/commands/command-utils-shared';
import dumpUtil from './dump';
import { beginLightProbeRestore, captureLightProbeData, captureLightProbeGroup, getLightProbeSnapshotScenes, restoreLightProbeData, restoreLightProbeGroup, type LightProbeDataSnapshot, type LightProbeGroupSnapshot } from './scene/light-probe-snapshot';
import { deletedLightmapAssets } from './baking/lightfx/deleted-lightmap-assets';

interface IRecordingComponentSnapshot {
    uuid: string;
    path: string;
    nodeUuid: string;
    nodePath: string;
    index: number;
    type: string;
    dump: any;
    lightProbeGroup?: LightProbeGroupSnapshot;
}

interface IRecordingNodeSnapshot {
    kind: 'node';
    uuid: string;
    path: string;
    dump: any;
    components: IRecordingComponentSnapshot[];
}

interface IRecordingStandaloneComponentSnapshot extends IRecordingComponentSnapshot {
    kind: 'component';
}

interface IRecordingProbeSnapshot {
    kind: 'light-probe-data';
    uuid: string;
    data: LightProbeDataSnapshot;
}

type IRecordingSnapshot = IRecordingNodeSnapshot | IRecordingStandaloneComponentSnapshot | IRecordingProbeSnapshot;

// Internal recording target, not a public scene UUID. Explicit scene recordings
// (settings/baking) must still use the full scene snapshot adapter.
const PROBE_SCENE_TARGET = 'light-probe-data:';

@register('Undo')
export class UndoService extends BaseService<IUndoEvents> implements IUndoService {
    private _undoMgr: SceneUndoManager;

    constructor() {
        super();
        this._undoMgr = new SceneUndoManager({
            snapshotAdapter: this._createSceneSnapshotAdapter(),
        });
    }

    beginRecording(uuids: string[], options?: IUndoBeginOptions): string {
        const nodes = uuids.map(uuid => {
            const node = this._getEditorNodeManager()?.getNode?.(uuid) as Node | undefined;
            return node ?? (this._getEditorComponentManager()?.getComponent?.(uuid) as Component | undefined)?.node;
        }).filter((node): node is Node => this._isNodeInCurrentScene(node));
        // Fix the target set before the mutation. Even if a component is disabled
        // while recording, before/after must capture the same scene globals.
        const targets = new Set(uuids);
        for (const scene of getLightProbeSnapshotScenes(nodes)) {
            if (targets.has(scene.uuid)) {
                targets.delete(scene.uuid);
                targets.add(scene.uuid);
            } else {
                targets.add(PROBE_SCENE_TARGET + scene.uuid);
            }
        }
        return this._undoMgr.beginRecording([...targets], options);
    }

    async endRecording(commandId: string): Promise<void> {
        const wasDirty = this._undoMgr.isDirty();
        const pushed = await this._undoMgr.endRecording(commandId);
        this._emitDirtyIfChanged(wasDirty);
        if (pushed) {
            this.broadcast('undo:changed');
        }
    }

    cancelRecording(commandId: string): void {
        const wasDirty = this._undoMgr.isDirty();
        this._undoMgr.cancelRecording(commandId);
        this._emitDirtyIfChanged(wasDirty);
    }

    async undo(options?: IUndoOperationOptions): Promise<IUndoRedoResult> {
        const wasDirty = this._undoMgr.isDirty();
        const result = await this._undoMgr.undo(options);
        if (result.success) {
            try {
                const { Service } = require('./core/decorator');
                Service.Engine?.repaintInEditMode?.();
            } catch (e) {
                // Engine 可能还没初始化完成。
            }
            this._emitDirtyIfChanged(wasDirty);
        }
        this.broadcast('undo:changed');
        return result;
    }

    async redo(options?: IUndoOperationOptions): Promise<IUndoRedoResult> {
        const wasDirty = this._undoMgr.isDirty();
        const result = await this._undoMgr.redo(options);
        if (result.success) {
            try {
                const { Service } = require('./core/decorator');
                Service.Engine?.repaintInEditMode?.();
            } catch (e) {
                // Engine 可能还没初始化完成。
            }
            this._emitDirtyIfChanged(wasDirty);
        }
        this.broadcast('undo:changed');
        return result;
    }

    reset(): void {
        this.clearHistory();
    }

    clearHistory(): void {
        const wasDirty = this._undoMgr.isDirty();
        const hadUndoState =
            this._undoMgr.canUndo() ||
            this._undoMgr.canRedo() ||
            this._undoMgr.isGroupActive() ||
            this._undoMgr.hasActiveRecording();
        this._undoMgr.reset();
        this._emitDirtyIfChanged(wasDirty);
        if (hadUndoState) {
            this.broadcast('undo:changed');
        }
    }

    isDirty(): boolean {
        return this._undoMgr.isDirty();
    }

    createCheckpoint(): IUndoCheckpoint {
        return this._undoMgr.createCheckpoint();
    }

    hasScopedDifference(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): boolean {
        return this._undoMgr.hasScopedDifference(checkpoint, scope);
    }

    hasScopedDifferenceAfterCheckpoint(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): boolean {
        return this._undoMgr.hasScopedDifferenceAfterCheckpoint(checkpoint, scope);
    }

    async discardScopedChangesAfterCheckpoint(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): Promise<IUndoRedoResult> {
        const wasDirty = this._undoMgr.isDirty();
        const result = await this._undoMgr.discardScopedChangesAfterCheckpoint(checkpoint, scope);
        if (result.success) {
            this._emitDirtyIfChanged(wasDirty);
        }
        this.broadcast('undo:changed');
        return result;
    }

    hasDifferenceOutsideScope(checkpoint: IUndoCheckpoint, scope: Partial<IUndoScope>): boolean {
        return this._undoMgr.hasDifferenceOutsideScope(checkpoint, scope);
    }

    canUndo(options?: IUndoOperationOptions): boolean {
        return this._undoMgr.canUndo(options);
    }

    canRedo(options?: IUndoOperationOptions): boolean {
        return this._undoMgr.canRedo(options);
    }

    beginGroup(options?: IUndoGroupOptions): string {
        return this._undoMgr.beginGroup(options);
    }

    endGroup(groupId: string): IUndoRedoResult {
        const wasDirty = this._undoMgr.isDirty();
        const result = this._undoMgr.endGroup(groupId);
        this._emitDirtyIfChanged(wasDirty);
        if (result.success) {
            this.broadcast('undo:changed');
        }
        return result;
    }

    cancelGroup(groupId: string): IUndoRedoResult {
        return this._undoMgr.cancelGroup(groupId);
    }

    isGroupActive(): boolean {
        return this._undoMgr.isGroupActive();
    }

    push(command: IUndoCommand): void {
        const wasDirty = this._undoMgr.isDirty();
        this._undoMgr.push(command);
        this._emitDirtyIfChanged(wasDirty);
        this.broadcast('undo:changed');
    }

    pushWithPrevious(command: IUndoCommand, options: IUndoPushWithPreviousOptions): void {
        const wasDirty = this._undoMgr.isDirty();
        this._undoMgr.pushWithPrevious(command, options);
        this._emitDirtyIfChanged(wasDirty);
        this.broadcast('undo:changed');
    }

    markSaved(): void {
        const wasDirty = this._undoMgr.isDirty();
        this._undoMgr.markSaved();
        this._emitDirtyIfChanged(wasDirty);
    }

    hasActiveRecording(uuid?: string): boolean {
        return this._undoMgr.hasActiveRecording(uuid);
    }

    isApplying(): boolean {
        return this._undoMgr.isApplying();
    }

    /** 只在 dirty 状态真正变化时广播 dirty:changed。 */
    private _emitDirtyIfChanged(wasDirty: boolean): void {
        const nowDirty = this._undoMgr.isDirty();
        if (wasDirty !== nowDirty) {
            this.broadcast('dirty:changed', nowDirty);
        }
    }

    private _createSceneSnapshotAdapter(): ISnapshotAdapter {
        return {
            capture: (uuids: string[]) => this._captureSceneSnapshots(uuids),
            apply: async (data: Map<string, IRecordingSnapshot>) => this._applySceneSnapshots(data),
            equals: (before: Map<string, IRecordingSnapshot>, after: Map<string, IRecordingSnapshot>) => this._snapshotMapsEqual(before, after),
        };
    }

    private _captureSceneSnapshots(uuids: string[]): Map<string, IRecordingSnapshot> {
        const snapshots = new Map<string, IRecordingSnapshot>();
        for (const uuid of new Set(uuids)) {
            if (uuid.startsWith(PROBE_SCENE_TARGET)) {
                const sceneUuid = uuid.slice(PROBE_SCENE_TARGET.length);
                const scene = this._getEditorNodeManager()?.getNode?.(sceneUuid) as Scene | null;
                if (this._isNodeInCurrentScene(scene) && scene === scene.scene) {
                    snapshots.set(uuid, { kind: 'light-probe-data', uuid: sceneUuid, data: captureLightProbeData(scene) });
                }
                continue;
            }
            const node = this._getEditorNodeManager()?.getNode?.(uuid) as Node | null;
            if (this._isNodeInCurrentScene(node)) {
                snapshots.set(`node:${uuid}`, this._captureNodeSnapshot(node));
                continue;
            }

            const component = this._getEditorComponentManager()?.getComponent?.(uuid) as Component | null;
            if (this._isComponentInCurrentScene(component)) {
                const snapshot = this._captureComponentSnapshot(component);
                if (snapshot) {
                    snapshots.set(`component:${uuid}`, { kind: 'component', ...snapshot });
                }
            }
        }
        return snapshots;
    }

    private _captureNodeSnapshot(node: Node): IRecordingNodeSnapshot {
        return {
            kind: 'node',
            uuid: node.uuid,
            path: this._getNodePath(node),
            dump: deletedLightmapAssets.capture(node.scene, this._cloneDump(dumpUtil.dumpNode(node, { includeComponents: false }))),
            components: node.components
                .map(component => this._captureComponentSnapshot(component as Component))
                .filter((snapshot): snapshot is IRecordingComponentSnapshot => !!snapshot),
        };
    }

    private _captureComponentSnapshot(component: Component): IRecordingComponentSnapshot | null {
        if (!this._isComponentInCurrentScene(component)) {
            return null;
        }

        const lightProbeGroup = captureLightProbeGroup(component);
        return {
            uuid: component.uuid,
            path: this._getComponentPath(component),
            nodeUuid: component.node.uuid,
            nodePath: this._getNodePath(component.node),
            index: component.node.components.indexOf(component),
            type: this._getComponentType(component),
            dump: lightProbeGroup ? null : deletedLightmapAssets.capture(component.node.scene, this._cloneDump(dumpUtil.dumpComponent(component))),
            ...(lightProbeGroup ? { lightProbeGroup } : {}),
        };
    }

    private async _applySceneSnapshots(data: Map<string, IRecordingSnapshot>): Promise<IUndoRedoResult> {
        const snapshots = [...data.values()];
        const probes = snapshots.filter((snapshot): snapshot is IRecordingProbeSnapshot => snapshot.kind === 'light-probe-data');
        const changedNodes = probes.length ? new Set<Node>() : undefined;
        const scenes = new Map<string, Scene>();
        for (const snapshot of probes) {
            const scene = this._findNode(snapshot.uuid, '') as Scene | null;
            if (!scene || scene !== scene.scene) return { success: false, reason: `Probe scene not found: ${snapshot.uuid}` };
            scenes.set(snapshot.uuid, scene);
        }
        const releases = [...scenes.values()].map(beginLightProbeRestore);
        try {
            for (const snapshot of snapshots) {
                if (snapshot.kind === 'light-probe-data') continue;
                const result = snapshot.kind === 'node'
                    ? await this._applyNodeSnapshot(snapshot, changedNodes)
                    : await this._applyComponentSnapshot(snapshot, changedNodes);
                if (!result.success) return result;
            }
            for (const snapshot of probes) {
                const scene = scenes.get(snapshot.uuid)!;
                if (!this._isNodeInCurrentScene(scene)) return { success: false, reason: `Probe scene changed: ${snapshot.uuid}` };
                restoreLightProbeData(scene, snapshot.data);
                changedNodes!.add(scene);
            }
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        } finally {
            releases.forEach(release => release());
            // Publish after all groups and the global table agree. If restoration
            // fails midway, still expose the node changes already applied.
            for (const node of changedNodes ?? []) this._notifyRestoredNode(node);
        }
    }

    private async _applyNodeSnapshot(snapshot: IRecordingNodeSnapshot, changedNodes?: Set<Node>): Promise<IUndoRedoResult> {
        const node = this._findNode(snapshot.uuid, snapshot.path);
        if (!node) {
            return { success: false, reason: `Node not found: ${snapshot.path || snapshot.uuid}` };
        }

        try {
            ServiceEvents.emit('node:before-change', node);
            await this._restoreNodeDump(node, snapshot.dump);
            for (const componentSnapshot of snapshot.components) {
                const component = this._findComponent(componentSnapshot);
                if (component) {
                    await this._restoreComponentSnapshot(component, componentSnapshot);
                }
            }
            this._notifyRestoredNode(node, changedNodes);
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    private async _applyComponentSnapshot(snapshot: IRecordingStandaloneComponentSnapshot, changedNodes?: Set<Node>): Promise<IUndoRedoResult> {
        const component = this._findComponent(snapshot);
        if (!component) {
            return { success: false, reason: `Component not found: ${snapshot.path || snapshot.uuid}` };
        }

        try {
            await this._restoreComponentSnapshot(component, snapshot);
            this._notifyRestoredNode(component.node, changedNodes);
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    private _notifyRestoredNode(node: Node, changedNodes?: Set<Node>): void {
        if (changedNodes) { changedNodes.add(node); return; }
        ServiceEvents.emit('node:change', node, { source: EventSourceType.UNDO, type: NodeEventType.SET_PROPERTY });
    }

    private async _restoreComponentSnapshot(component: Component, snapshot: IRecordingComponentSnapshot): Promise<void> {
        if (snapshot.lightProbeGroup) restoreLightProbeGroup(component, snapshot.lightProbeGroup);
        else await this._restoreComponentDump(component, snapshot.dump);
    }

    private async _restoreNodeDump(node: Node, dump: any): Promise<void> {
        await restoreNodeSnapshotDump(node, dump, {
            updateNodeName: (uuid, name) => this._getEditorNodeManager()?.updateNodeName?.(uuid, name),
        });
    }

    private async _restoreComponentDump(component: Component, dump: any): Promise<void> {
        await restoreComponentSnapshotDump(component, dump);
    }

    private _findNode(uuid: string, path: string): Node | null {
        const byUuid = this._getEditorNodeManager()?.getNode?.(uuid) as Node | null;
        if (this._isNodeInCurrentScene(byUuid)) {
            return byUuid;
        }
        if (!path) {
            return null;
        }
        try {
            const byPath = this._getEditorNodeManager()?.getNodeByPath?.(path) as Node | null;
            return this._isNodeInCurrentScene(byPath) ? byPath : null;
        } catch (_error) {
            return null;
        }
    }

    private _findComponent(snapshot: IRecordingComponentSnapshot): Component | null {
        const editorComponent = this._getEditorComponentManager();
        const byUuid = editorComponent?.getComponent?.(snapshot.uuid) as Component | null;
        if (this._isComponentInCurrentScene(byUuid)) {
            return byUuid;
        }

        if (snapshot.path) {
            try {
                const byPath = editorComponent?.getComponentFromPath?.(snapshot.path) as Component | null;
                if (this._isComponentInCurrentScene(byPath)) {
                    return byPath;
                }
            } catch (_error) {
                // 按路径找不到组件时，再退回到节点和组件下标查找。
            }
        }

        const node = this._findNode(snapshot.nodeUuid, snapshot.nodePath);
        const byIndex = node?.components[snapshot.index] as Component | undefined;
        if (this._isComponentInCurrentScene(byIndex) && this._getComponentType(byIndex) === snapshot.type) {
            return byIndex;
        }
        return null;
    }

    private _isNodeInCurrentScene(node: Node | null | undefined): node is Node {
        if (!node?.isValid) {
            return false;
        }
        const scene = (cc as any).director?.getScene?.();
        return !!scene && (node === scene || node.isChildOf(scene));
    }

    private _isComponentInCurrentScene(component: Component | null | undefined): component is Component {
        return !!component?.isValid && this._isNodeInCurrentScene(component.node);
    }

    private _getNodePath(node: Node): string {
        const scene = (cc as any).director?.getScene?.();
        if (node === scene) {
            return '/';
        }
        return this._getEditorNodeManager()?.getNodePath?.(node) ?? '';
    }

    private _getComponentPath(component: Component): string {
        return this._getEditorComponentManager()?.getPathFromUuid?.(component.uuid) ?? '';
    }

    private _getComponentType(component: Component): string {
        return (cc as any).js?.getClassName?.(component.constructor) || component.constructor?.name || '';
    }

    private _getEditorNodeManager(): any {
        return this._getEditorExtends()?.Node;
    }

    private _getEditorComponentManager(): any {
        return this._getEditorExtends()?.Component;
    }

    private _getEditorExtends(): any {
        return (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    }

    private _snapshotMapsEqual(before: Map<string, IRecordingSnapshot>, after: Map<string, IRecordingSnapshot>): boolean {
        return snapshotMapsEqual(before, after);
    }

    private _cloneDump<T>(dump: T): T {
        return JSON.parse(JSON.stringify(dump)) as T;
    }
}
