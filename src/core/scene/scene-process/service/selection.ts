import { BaseService } from './core';
import { register, Service } from './core/decorator';
import { ServiceEvents } from './core/global-events';
import type { ISelectionService, ISelectionEvents, IChangeNodeOptions } from '../../common';
import { NodeEventType } from '../../common';
import type { Node } from 'cc';
import { getEditorNodeByUuid, getEditorNodePath, getEditorNodeUuidByPath } from './gizmo/utils/editor-node';
import { normalizeNodePath } from '../../../engine/editor-extends/manager/path-utils';
import { Rpc } from '../rpc';
import type { IBrowserNodeSnapshotState, IBrowserNodeTransformState } from '../../browser-scene-state';
import dumpUtil from './dump';

function pathToUuid(path: string): string {
    return getEditorNodeUuidByPath(path);
}

function uuidToPath(uuid: string): string {
    const node = getEditorNodeByUuid(uuid);
    if (!node) return '';
    return getEditorNodePath(node);
}

interface SelectionEntry {
    path: string;
    uuid: string;
}

@register('Selection')
export class SelectionService extends BaseService<ISelectionEvents> implements ISelectionService {
    private _selections: SelectionEntry[] = [];
    private _onNodeChangedHandler?: (node: Node, opts?: IChangeNodeOptions) => void;
    private _browserNodeRevision = 0;

    init() {
        this._onNodeChangedHandler = (node: Node, opts: IChangeNodeOptions = {}) => {
            if (opts.type === NodeEventType.TRANSFORM_CHANGED) {
                this._publishBrowserNodeTransform(node);
            } else {
                this._publishBrowserNodeSnapshot(node);
            }
            if (opts.type === NodeEventType.SET_PROPERTY && opts.propPath === 'name') {
                this._onNodePathChanged(node);
            } else if (opts.type === NodeEventType.PARENT_CHANGED) {
                this._onNodePathChanged(node);
            }
        };
        ServiceEvents.on('node:change', this._onNodeChangedHandler);
    }

    destroy() {
        if (this._onNodeChangedHandler) {
            ServiceEvents.off('node:change', this._onNodeChangedHandler);
            this._onNodeChangedHandler = undefined;
        }
    }

    private _onNodePathChanged(node: Node) {
        const uuid = node.uuid;
        const newPath = uuidToPath(uuid);
        if (!newPath) return;

        for (const entry of this._selections) {
            if (entry.uuid === uuid) {
                entry.path = newPath;
            }
        }
    }

    select(path: string): void {
        // 选中项以归一化路径为键，'/Canvas' 与 'Canvas' 是同一个节点，不能存成两条
        const normalized = normalizeNodePath(path);
        const index = this._selections.findIndex(e => e.path === normalized);
        if (index !== -1) return;
        const uuid = pathToUuid(normalized);
        this._selections.unshift({ path: normalized, uuid });
        if (uuid) {
            this._callFocusInEditor(uuid);
        }
        this.broadcast('selection:select', normalized, this._getPaths());
        this._publishBrowserSelection();
    }

    unselect(path: string): void {
        const normalized = normalizeNodePath(path);
        const index = this._selections.findIndex(e => e.path === normalized);
        if (index === -1) return;
        const entry = this._selections[index];
        this._selections.splice(index, 1);
        if (entry.uuid) {
            this._callLostFocusInEditor(entry.uuid);
        }
        this.broadcast('selection:unselect', normalized, this._getPaths());
        this._publishBrowserSelection();
    }

    clear(): void {
        while (this._selections.length > 0) {
            const entry = this._selections.shift();
            if (entry) {
                if (entry.uuid) {
                    this._callLostFocusInEditor(entry.uuid);
                }
                this.emit('selection:unselect', entry.path, this._getPaths());
            }
        }
        this.broadcast('selection:clear');
        this._publishBrowserSelection();
    }

    query(): string[] {
        return this._selections.map(e => e.path);
    }

    isSelect(path: string): boolean {
        const normalized = normalizeNodePath(path);
        return this._selections.some(e => e.path === normalized);
    }

    reset(): void {
        this._selections.length = 0;
    }

    private _getPaths(): string[] {
        return this._selections.map(e => e.path);
    }

    /** Keep the headless screenshot worker in sync with the browser editor selection. */
    private _publishBrowserSelection(): void {
        if (!(Rpc as any).isWebTransport?.()) {
            return;
        }
        try {
            const editorUuid = (Service.Editor as any)?.getCurrentEditorUuid?.();
            if (!editorUuid) {
                return;
            }
            void Rpc.getInstance()
                .request('browserSceneState', 'setEditorState', [editorUuid, {
                    selection: this._getPaths(),
                    camera: Service.Camera?.getScreenshotState?.(),
                }])
                .catch((error: unknown) => {
                    console.warn('[Selection] Failed to publish PinK selection.', error);
                });
        } catch (error) {
            console.warn('[Selection] Failed to publish PinK selection.', error);
        }
    }

    /** Keep unsaved browser-side node movement visible to the screenshot worker. */
    private _publishBrowserNodeTransform(node: Node): void {
        if (!(Rpc as any).isWebTransport?.()) {
            return;
        }
        try {
            const editor = Service.Editor as any;
            const editorUuid = editor?.getCurrentEditorUuid?.();
            const root = editor?.getRootNode?.() as Node | null;
            if (!editorUuid || !root || !this._belongsToEditor(node, root)) {
                return;
            }
            const path = getEditorNodePath(node);
            if (!path) {
                return;
            }
            const position = (node as any).position;
            const rotation = (node as any).rotation;
            const scale = (node as any).scale;
            if (!position || !rotation || !scale) {
                return;
            }
            const transform: IBrowserNodeTransformState = {
                uuid: node.uuid,
                path,
                revision: ++this._browserNodeRevision,
                position: { x: position.x, y: position.y, z: position.z },
                rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
                scale: { x: scale.x, y: scale.y, z: scale.z },
            };
            void Rpc.getInstance()
                .request('browserSceneState', 'setEditorState', [editorUuid, {
                    nodeTransforms: [transform],
                }])
                .catch((error: unknown) => {
                    console.warn('[Selection] Failed to publish PinK node transform.', error);
                });
        } catch (error) {
            console.warn('[Selection] Failed to publish PinK node transform.', error);
        }
    }

    /** Publish a JSON-safe dump so all unsaved Node and Component inspector values
     * can be restored in the separate screenshot worker without saving the asset. */
    private _publishBrowserNodeSnapshot(node: Node): void {
        if (!(Rpc as any).isWebTransport?.()) {
            return;
        }
        try {
            const context = this._getBrowserNodeContext(node);
            if (!context) {
                return;
            }
            const dump = dumpUtil.dumpNode(node);
            if (!dump) {
                return;
            }
            const snapshot: IBrowserNodeSnapshotState = {
                uuid: node.uuid,
                path: context.path,
                revision: ++this._browserNodeRevision,
                dump,
            };
            void Rpc.getInstance()
                .request('browserSceneState', 'setEditorState', [context.editorUuid, {
                    nodeSnapshots: [snapshot],
                }])
                .catch((error: unknown) => {
                    console.warn('[Selection] Failed to publish PinK node inspector state.', error);
                });
        } catch (error) {
            console.warn('[Selection] Failed to publish PinK node inspector state.', error);
        }
    }

    private _getBrowserNodeContext(node: Node): { editorUuid: string; path: string } | null {
        const editor = Service.Editor as any;
        const editorUuid = editor?.getCurrentEditorUuid?.();
        const root = editor?.getRootNode?.() as Node | null;
        if (!editorUuid || !root || !this._belongsToEditor(node, root)) {
            return null;
        }
        const path = getEditorNodePath(node);
        return path ? { editorUuid, path } : null;
    }

    private _belongsToEditor(node: Node, root: Node): boolean {
        let current: Node | null = node;
        while (current) {
            if (current === root) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    private _callFocusInEditor(uuid: string): void {
        try {
            const node = getEditorNodeByUuid(uuid) as any;
            if (!node?._components) return;
            for (const comp of node.components) {
                if (comp?.onFocusInEditor) {
                    comp.onFocusInEditor();
                }
            }
        } catch (e) {
            console.error('[Selection] onFocusInEditor error:', e);
        }
    }

    private _callLostFocusInEditor(uuid: string): void {
        try {
            const node = getEditorNodeByUuid(uuid) as any;
            if (!node?._components) return;
            for (const comp of node.components) {
                if (comp?.onLostFocusInEditor) {
                    comp.onLostFocusInEditor();
                }
            }
        } catch (e) {
            console.error('[Selection] onLostFocusInEditor error:', e);
        }
    }
}
