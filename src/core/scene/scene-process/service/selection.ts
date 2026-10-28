import { BaseService } from './core';
import { register } from './core/decorator';
import { ServiceEvents } from './core/global-events';
import type { ISelectionService, ISelectionEvents, IChangeNodeOptions } from '../../common';
import { NodeEventType } from '../../common';
import type { Node } from 'cc';
import { getEditorNodeByUuid, getEditorNodePath, getEditorNodeUuidByPath } from './utils/editor-node';
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
        if (this._onNodeChangedHandler) return;
        this._onNodeChangedHandler = (_node, opts = {}) => {
            if (opts.type === NodeEventType.PARENT_CHANGED
                || (opts.type === NodeEventType.SET_PROPERTY && opts.propPath === 'name')
                || opts.source === 'undo') {
                // Retain addresses before nodes leave the index; the changed node may be an ancestor.
                for (const entry of this._selections) {
                    this._getPath(entry);
                }
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

    select(path: string): void {
        const entry = this._resolveEntry(path);
        const index = this._findSelection(entry);
        if (index !== -1) return;
        this._selections.unshift(entry);
        if (entry.uuid) {
            this._callFocusInEditor(entry.uuid);
        }
        this.broadcast('selection:select', this._getPath(entry), this._getPaths());
    }

    unselect(path: string): void {
        const index = this._findSelection(this._resolveEntry(path));
        if (index === -1) return;
        const entry = this._selections[index];
        this._selections.splice(index, 1);
        if (entry.uuid) {
            this._callLostFocusInEditor(entry.uuid);
        }
        this.broadcast('selection:unselect', this._getPath(entry), this._getPaths());
    }

    clear(): void {
        while (this._selections.length > 0) {
            const entry = this._selections.shift();
            if (entry) {
                if (entry.uuid) {
                    this._callLostFocusInEditor(entry.uuid);
                }
                this.emit('selection:unselect', this._getPath(entry), this._getPaths());
            }
        }
        this.broadcast('selection:clear');
    }

    query(): string[] {
        return this._getPaths();
    }

    isSelect(path: string): boolean {
        return this._findSelection(this._resolveEntry(path)) !== -1;
    }

    reset(): void {
        this._selections.length = 0;
    }

    private _resolveEntry(path: string): SelectionEntry {
        const normalized = normalizeNodePath(path);
        return { path: normalized, uuid: pathToUuid(normalized) };
    }

    private _findSelection(target: SelectionEntry): number {
        return this._selections.findIndex(entry => {
            // UUID-only lookups must also retain the last address before a node leaves the index.
            const currentPath = this._getPath(entry);
            // Prefab-relative aliases can resolve to the same node as an absolute path.
            if (target.uuid && entry.uuid) {
                return entry.uuid === target.uuid;
            }
            return currentPath === target.path;
        });
    }

    private _getPaths(): string[] {
        return this._selections.map(entry => this._getPath(entry));
    }

    private _getPath(entry: SelectionEntry): string {
        // Resolve at the point of use: ancestor edits and Undo can change the address
        // without a matching name/parent event for this selected node.
        const path = uuidToPath(entry.uuid);
        if (path) {
            entry.path = normalizeNodePath(path);
        }
        // Preserve unresolved selections and the last address of temporarily missing nodes.
        // Never bind a known UUID to another node that now occupies its old path.
        return entry.path;
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
