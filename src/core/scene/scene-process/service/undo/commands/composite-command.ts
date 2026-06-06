import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';

export class CompositeCommand implements IUndoCommand {
    constructor(
        public meta: IUndoCommandMeta,
        private readonly children: IUndoCommand[],
    ) { }

    async undo(): Promise<IUndoRedoResult> {
        for (let index = this.children.length - 1; index >= 0; index--) {
            const result = await this.children[index].undo();
            if (!result.success) {
                return result;
            }
        }
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }

    async redo(): Promise<IUndoRedoResult> {
        for (const child of this.children) {
            const result = await child.redo();
            if (!result.success) {
                return result;
            }
        }
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }
}
