import { BaseService } from './core';
import { register } from './core/decorator';
import { ServiceEvents } from './core/global-events';
import type { ISelectionService, ISelectionEvents, IChangeNodeOptions } from '../../common';
import { NodeEventType } from '../../common';
import type { Node } from 'cc';

function getNodeMgr() {
    return ((cc as any).EditorExtends || (globalThis as any).EditorExtends)?.Node;
}

function pathToUuid(path: string): string {
    const NodeMgr = getNodeMgr();
    if (!NodeMgr) return '';
    return NodeMgr.getNodeUuidByPath?.(path) ?? '';
}

function uuidToPath(uuid: string): string {
    const NodeMgr = getNodeMgr();
    if (!NodeMgr) return '';
    const node = NodeMgr.getNode?.(uuid);
    if (!node) return '';
    return NodeMgr.getNodePath(node) ?? '';
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
        const index = this._selections.findIndex(e => e.path === path);
        if (index !== -1) return;
        const uuid = pathToUuid(path);
        this._selections.unshift({ path, uuid });
        if (uuid) {
            this._callFocusInEditor(uuid);
        }
        this.broadcast('selection:select', path, this._getPaths());
    }

    unselect(path: string): void {
        const index = this._selections.findIndex(e => e.path === path);
        if (index === -1) return;
        const entry = this._selections[index];
        this._selections.splice(index, 1);
        if (entry.uuid) {
            this._callLostFocusInEditor(entry.uuid);
        }
        this.broadcast('selection:unselect', path, this._getPaths());
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
        return this._selections.some(e => e.path === path);
    }

    reset(): void {
        this._selections.length = 0;
    }

    private _getPaths(): string[] {
        return this._selections.map(e => e.path);
    }

    private _callFocusInEditor(uuid: string): void {
        try {
            const NodeMgr = getNodeMgr();
            if (!NodeMgr) return;
            const node = NodeMgr.getNode(uuid);
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
            const NodeMgr = getNodeMgr();
            if (!NodeMgr) return;
            const node = NodeMgr.getNode(uuid);
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
