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
                // 如果某一步 undo 失败，把前面已经 undo 的子命令重新 redo 回去，
                // 尽量恢复到执行 undo 之前的状态，避免只恢复了一半。
                for (let i = undone.length - 1; i >= 0; i--) {
                    try {
                        await undone[i].redo();
                    } catch (_e) {
                        // 某个补偿操作失败时，继续处理剩下的子命令。
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
                // 如果某一步 redo 失败，把前面已经 redo 的子命令重新 undo 回去，
                // 尽量恢复到执行 redo 之前的状态，避免只恢复了一半。
                for (let i = redone.length - 1; i >= 0; i--) {
                    try {
                        await redone[i].undo();
                    } catch (_e) {
                        // 某个补偿操作失败时，继续处理剩下的子命令。
                    }
                }
                return result;
            }
            redone.push(child);
        }
        return { success: true, commandId: this.meta.id, label: this.meta.label };
    }
}
