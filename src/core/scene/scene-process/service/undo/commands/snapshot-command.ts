import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';

export interface ISnapshotAdapter {
    capture(uuids: string[]): Map<string, any> | Promise<Map<string, any>>;
    apply(data: Map<string, any>, direction: 'undo' | 'redo'): IUndoRedoResult | Promise<IUndoRedoResult>;
    equals(before: Map<string, any>, after: Map<string, any>): boolean;
}

export class SnapshotCommand implements IUndoCommand {
    constructor(
        public meta: IUndoCommandMeta,
        private readonly before: Map<string, any>,
        private readonly after: Map<string, any>,
        private readonly adapter: ISnapshotAdapter,
    ) { }

    async undo(): Promise<IUndoRedoResult> {
        const result = await this.adapter.apply(this.before, 'undo');
        return result.success ? { ...result, commandId: this.meta.id, label: this.meta.label } : result;
    }

    async redo(): Promise<IUndoRedoResult> {
        const result = await this.adapter.apply(this.after, 'redo');
        return result.success ? { ...result, commandId: this.meta.id, label: this.meta.label } : result;
    }
}
