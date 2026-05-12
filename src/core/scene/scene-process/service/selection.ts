import { BaseService } from './core';
import { register } from './core/decorator';
import type { ISelectionService, ISelectionEvents } from '../../common';

function getNodeMgr() {
    return ((cc as any).EditorExtends || (globalThis as any).EditorExtends)?.Node;
}

function uuidToPath(uuid: string): string {
    const NodeMgr = getNodeMgr();
    if (!NodeMgr) return '';
    const node = NodeMgr.getNode?.(uuid);
    if (!node) return '';
    return NodeMgr.getNodePath(node) ?? '';
}

function uuidsToPath(uuids: string[]): string[] {
    return uuids.map(uuidToPath).filter(Boolean);
}

@register('Selection')
export class SelectionService extends BaseService<ISelectionEvents> implements ISelectionService {
    private _uuids: string[] = [];

    select(uuid: string): void {
        const index = this._uuids.indexOf(uuid);
        if (index !== -1) return;
        this._uuids.unshift(uuid);
        this._callFocusInEditor(uuid);
        const path = uuidToPath(uuid);
        const paths = uuidsToPath(this._uuids);
        this.broadcast('selection:select', path, paths);
    }

    unselect(uuid: string): void {
        const index = this._uuids.indexOf(uuid);
        if (index === -1) return;
        this._uuids.splice(index, 1);
        this._callLostFocusInEditor(uuid);
        const path = uuidToPath(uuid);
        const paths = uuidsToPath(this._uuids);
        this.broadcast('selection:unselect', path, paths);
    }

    clear(): void {
        while (this._uuids.length > 0) {
            const uuid = this._uuids.shift();
            if (uuid) {
                this._callLostFocusInEditor(uuid);
                const path = uuidToPath(uuid);
                const paths = uuidsToPath(this._uuids);
                this.emit('selection:unselect', path, paths);
            }
        }
        this.broadcast('selection:clear');
    }

    query(): string[] {
        return this._uuids.slice();
    }

    isSelect(uuid: string): boolean {
        return this._uuids.indexOf(uuid) !== -1;
    }

    reset(): void {
        this._uuids.length = 0;
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
