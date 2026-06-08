import { ServiceEvents } from '../core/global-events';
import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../common';
import { getDumpUtil } from './dump-util';

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
        const ok = await this.applyData(this.undoData);
        if (!ok) {
            return { success: false, commandId: this.meta.id, label: this.meta.label, reason: 'Undo apply failed' };
        }
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }

    async redo(): Promise<IUndoRedoResult> {
        const ok = await this.applyData(this.redoData);
        if (!ok) {
            return { success: false, commandId: this.meta.id, label: this.meta.label, reason: 'Redo apply failed' };
        }
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }

    private async applyData(data: Map<string, IDump>): Promise<boolean> {
        const EditorExtends = (cc as any).EditorExtends;
        if (!EditorExtends) return false;

        let ok = true;
        for (const [uuid, dump] of data) {
            try {
                const node = EditorExtends.Node.getNode(uuid);
                if (node && dump) {
                    // dumpNode(encodeNode) 顶层含 path/parent/uuid/children/__type__/__comps__ 等非可还原字段，
                    // 只还原安全的可编辑属性（与 UndoService._restoreNodeDump 白名单一致），避免误改 uuid / 父子关系
                    for (const key of ['name', 'active', 'layer', 'mobility', 'position', 'rotation', 'scale']) {
                        if (dump[key]) {
                            await getDumpUtil().restoreProperty(node, key, dump[key]);
                        }
                    }
                    ServiceEvents.emit('node:change', node, { source: 'undo' });
                    continue;
                }

                const comp = EditorExtends.Component?.getComponent(uuid);
                if (comp && dump?.value) {
                    for (const key in dump.value) {
                        await getDumpUtil().restoreProperty(comp, key, dump.value[key]);
                    }
                    if (comp.node) {
                        ServiceEvents.emit('node:change', comp.node, { source: 'undo' });
                    }
                }
            } catch (e) {
                console.error('[Undo] applyData error:', e);
                ok = false;
            }
        }
        return ok;
    }
}

export { UndoCommand, SceneUndoCommand, SceneUndoCommandID };
