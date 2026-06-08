import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';

export class CompositeCommand implements IUndoCommand {
    constructor(
        public meta: IUndoCommandMeta,
        private readonly children: IUndoCommand[],
    ) { }

    async undo(): Promise<IUndoRedoResult> {
        const undone: IUndoCommand[] = [];
        for (let index = this.children.length - 1; index >= 0; index--) {
            const child = this.children[index];
            const result = await child.undo();
            if (!result.success) {
                // Atomic rollback: re-redo already-undone children to avoid a partial state
                for (let i = undone.length - 1; i >= 0; i--) {
                    try {
                        await undone[i].redo();
                    } catch (_e) {
                        // best-effort rollback: keep rolling back the remaining children
                    }
                }
                return result;
            }
            undone.push(child);
        }
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }

    async redo(): Promise<IUndoRedoResult> {
        const redone: IUndoCommand[] = [];
        for (const child of this.children) {
            const result = await child.redo();
            if (!result.success) {
                // Atomic rollback: re-undo already-redone children to avoid a partial state
                for (let i = redone.length - 1; i >= 0; i--) {
                    try {
                        await redone[i].undo();
                    } catch (_e) {
                        // best-effort rollback: keep rolling back the remaining children
                    }
                }
                return result;
            }
            redone.push(child);
        }
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }
}
