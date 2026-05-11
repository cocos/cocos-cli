import { BaseService } from './core';
import { register } from './core/decorator';
import type { ISelectionService, ISelectionEvents } from '../../common';

@register('Selection')
export class SelectionService extends BaseService<ISelectionEvents> implements ISelectionService {
    private _uuids: string[] = [];

    select(uuid: string): void {
        const index = this._uuids.indexOf(uuid);
        if (index !== -1) return;
        this._uuids.unshift(uuid);
        this._callFocusInEditor(uuid);
        this.broadcast('selection:select', uuid, this._uuids.slice());
    }

    unselect(uuid: string): void {
        const index = this._uuids.indexOf(uuid);
        if (index === -1) return;
        this._uuids.splice(index, 1);
        this._callLostFocusInEditor(uuid);
        this.broadcast('selection:unselect', uuid, this._uuids.slice());
    }

    clear(): void {
        while (this._uuids.length > 0) {
            const uuid = this._uuids.shift();
            if (uuid) {
                this._callLostFocusInEditor(uuid);
                this.emit('selection:unselect', uuid, this._uuids.slice());
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
            const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
            if (!EditorExtends) return;
            const node = EditorExtends.Node.getNode(uuid);
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
            const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
            if (!EditorExtends) return;
            const node = EditorExtends.Node.getNode(uuid);
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
