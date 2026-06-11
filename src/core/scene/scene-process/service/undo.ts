import { BaseService } from './core';
import { register } from './core/decorator';
import { SceneUndoManager } from './undo/scene-undo-manager';
import { EventSourceType, NodeEventType, type IUndoService, type IUndoEvents, type IUndoBeginOptions, type IUndoCommand, type IUndoGroupOptions, type IUndoRedoResult } from '../../common';
import type { Component, Node } from 'cc';
import { ServiceEvents } from './core/global-events';
import type { ISnapshotAdapter } from './undo/commands/snapshot-command';
import { restoreComponentSnapshotDump, restoreNodeSnapshotDump, snapshotMapsEqual } from './undo/commands/command-utils-shared';
import dumpUtil from './dump';

interface IRecordingComponentSnapshot {
    uuid: string;
    path: string;
    nodeUuid: string;
    nodePath: string;
    index: number;
    type: string;
    dump: any;
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

type IRecordingSnapshot = IRecordingNodeSnapshot | IRecordingStandaloneComponentSnapshot;

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
        return this._undoMgr.beginRecording(uuids, options);
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

    async undo(): Promise<IUndoRedoResult> {
        const wasDirty = this._undoMgr.isDirty();
        const result = await this._undoMgr.undo();
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

    async redo(): Promise<IUndoRedoResult> {
        const wasDirty = this._undoMgr.isDirty();
        const result = await this._undoMgr.redo();
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

    canUndo(): boolean {
        return this._undoMgr.canUndo();
    }

    canRedo(): boolean {
        return this._undoMgr.canRedo();
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
            dump: this._cloneDump(dumpUtil.dumpNode(node, { includeComponents: false })),
            components: node.components
                .map(component => this._captureComponentSnapshot(component as Component))
                .filter((snapshot): snapshot is IRecordingComponentSnapshot => !!snapshot),
        };
    }

    private _captureComponentSnapshot(component: Component): IRecordingComponentSnapshot | null {
        if (!this._isComponentInCurrentScene(component)) {
            return null;
        }

        return {
            uuid: component.uuid,
            path: this._getComponentPath(component),
            nodeUuid: component.node.uuid,
            nodePath: this._getNodePath(component.node),
            index: component.node.components.indexOf(component),
            type: this._getComponentType(component),
            dump: this._cloneDump(dumpUtil.dumpComponent(component)),
        };
    }

    private async _applySceneSnapshots(data: Map<string, IRecordingSnapshot>): Promise<IUndoRedoResult> {
        for (const snapshot of data.values()) {
            const result = snapshot.kind === 'node'
                ? await this._applyNodeSnapshot(snapshot)
                : await this._applyComponentSnapshot(snapshot);
            if (!result.success) {
                return result;
            }
        }
        return { success: true };
    }

    private async _applyNodeSnapshot(snapshot: IRecordingNodeSnapshot): Promise<IUndoRedoResult> {
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
                    await this._restoreComponentDump(component, componentSnapshot.dump);
                }
            }
            ServiceEvents.emit('node:change', node, {
                source: EventSourceType.UNDO,
                type: NodeEventType.SET_PROPERTY,
            });
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    private async _applyComponentSnapshot(snapshot: IRecordingStandaloneComponentSnapshot): Promise<IUndoRedoResult> {
        const component = this._findComponent(snapshot);
        if (!component) {
            return { success: false, reason: `Component not found: ${snapshot.path || snapshot.uuid}` };
        }

        try {
            await this._restoreComponentDump(component, snapshot.dump);
            ServiceEvents.emit('node:change', component.node, {
                source: EventSourceType.UNDO,
                type: NodeEventType.SET_PROPERTY,
            });
            return { success: true };
        } catch (error) {
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
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
