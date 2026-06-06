import { Node } from 'cc';
import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import {
    captureNodeStructureSnapshot,
    createNodeCommandMeta,
    type INodeStructureSnapshot,
    removeNodeStructureSnapshot,
    restoreNodeStructureSnapshot,
    success,
} from './node-structure-command-utils';

export class RemoveNodeCommand implements IUndoCommand {
    meta: IUndoCommandMeta;

    constructor(
        private readonly snapshot: INodeStructureSnapshot,
        private readonly keepWorldTransform?: boolean,
    ) {
        this.meta = createNodeCommandMeta('node:remove', 'Remove Node');
    }

    static capture(node: Node, keepWorldTransform?: boolean): RemoveNodeCommand | null {
        const snapshot = captureNodeStructureSnapshot(node);
        return snapshot ? new RemoveNodeCommand(snapshot, keepWorldTransform) : null;
    }

    async undo(): Promise<IUndoRedoResult> {
        return restoreNodeStructureSnapshot(this.snapshot, this.meta);
    }

    async redo(): Promise<IUndoRedoResult> {
        const result = removeNodeStructureSnapshot(this.snapshot, this.meta, this.keepWorldTransform);
        return result.success ? success(this.meta) : result;
    }
}
