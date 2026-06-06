import { ServiceEvents } from '../core/global-events';
import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../common';

class UndoCommand implements IUndoCommand {
    toPerformUndo = false;
    meta: IUndoCommandMeta = {
        id: '',
        label: '',
        type: 'unknown',
        scope: {},
        timestamp: Date.now(),
    };

    async perform(): Promise<IUndoRedoResult> {
        if (this.toPerformUndo) {
            return this.undo();
        }
        return this.redo();
    }

    async undo(): Promise<IUndoRedoResult> {
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }

    async redo(): Promise<IUndoRedoResult> {
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }
}

type IDump = any;
type SceneUndoCommandID = string;

class SceneUndoCommand extends UndoCommand {
    public tag = '';
    id: SceneUndoCommandID = '';
    auto = false;
    custom = false;
    uuids: string[] = [];
    undoData: Map<string, IDump> = new Map();
    redoData: Map<string, IDump> = new Map();

    async undo(): Promise<IUndoRedoResult> {
        await this.applyData(this.undoData);
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }

    async redo(): Promise<IUndoRedoResult> {
        await this.applyData(this.redoData);
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }

    private async applyData(data: Map<string, IDump>) {
        const EditorExtends = (cc as any).EditorExtends;
        if (!EditorExtends) return;

        for (const [uuid, dump] of data) {
            try {
                const node = EditorExtends.Node.getNode(uuid);
                if (node && dump) {
                    // Restore node by restoring each component's properties
                    if (dump.value) {
                        for (const key in dump.value) {
                            await this._dumpUtil().restoreProperty(node, key, dump.value[key]);
                        }
                    }
                    ServiceEvents.emit('node:change', node, { source: 'undo' });
                    continue;
                }

                const comp = EditorExtends.Component?.getComponent(uuid);
                if (comp && dump?.value) {
                    for (const key in dump.value) {
                        await this._dumpUtil().restoreProperty(comp, key, dump.value[key]);
                    }
                    if (comp.node) {
                        ServiceEvents.emit('node:change', comp.node, { source: 'undo' });
                    }
                }
            } catch (e) {
                console.error('[Undo] applyData error:', e);
            }
        }
    }

    private _dumpUtil(): typeof import('../dump/index').default {
        return require('../dump/index').default;
    }
}

export { UndoCommand, SceneUndoCommand, SceneUndoCommandID };
