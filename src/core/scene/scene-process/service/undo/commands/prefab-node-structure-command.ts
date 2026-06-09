import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import {
    createNodeCommandMeta,
    type INodeStructureSnapshot,
} from './node-structure-command-utils';
import { replacePrefabNodeSnapshot } from './prefab-command-utils';

export class PrefabNodeStructureCommand implements IUndoCommand {
    meta: IUndoCommandMeta;

    constructor(
        type: string,
        label: string,
        private readonly before: INodeStructureSnapshot,
        private readonly after: INodeStructureSnapshot,
    ) {
        this.meta = createNodeCommandMeta(type, label);
    }

    async undo(): Promise<IUndoRedoResult> {
        return replacePrefabNodeSnapshot(this.after, this.before, this.meta);
    }

    async redo(): Promise<IUndoRedoResult> {
        return replacePrefabNodeSnapshot(this.before, this.after, this.meta);
    }
}
