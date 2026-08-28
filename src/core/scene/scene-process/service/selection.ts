import { BaseService } from './core';
import { register } from './core/decorator';
import { ServiceEvents } from './core/global-events';
import type { ISelectionService, ISelectionEvents, IChangeNodeOptions } from '../../common';
import { NodeEventType } from '../../common';
import type { Node } from 'cc';
import { getEditorNodeByUuid, getEditorNodePath, getEditorNodeUuidByPath } from './gizmo/utils/editor-node';
import { normalizeNodePath } from '../../../engine/editor-extends/manager/path-utils';

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

    init() {
        this._onNodeChangedHandler = (node: Node, opts: IChangeNodeOptions = {}) => {
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
