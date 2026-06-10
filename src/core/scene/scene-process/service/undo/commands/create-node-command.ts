import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import {
    captureNodeStructureSnapshot,
    createNodeCommandMeta,
    type INodeStructureCaptureTarget,
    type INodeStructureSnapshot,
    removeNodeStructureSnapshot,
    restoreNodeStructureSnapshot,
    success,
} from './node-structure-command-utils';

export class CreateNodeCommand implements IUndoCommand {
    meta: IUndoCommandMeta;

    constructor(private readonly snapshots: INodeStructureSnapshot[]) {
        this.meta = createNodeCommandMeta('node:create', 'Create Node');
    }

    static capture(targets: INodeStructureCaptureTarget[]): CreateNodeCommand | null {
        const snapshots = targets
            .map(target => captureNodeStructureSnapshot(target.node, target.path))
            .filter((snapshot): snapshot is INodeStructureSnapshot => !!snapshot)
            .sort((a, b) => a.siblingIndex - b.siblingIndex);
        return snapshots.length > 0 ? new CreateNodeCommand(snapshots) : null;
    }

    async undo(): Promise<IUndoRedoResult> {
        for (let index = this.snapshots.length - 1; index >= 0; index--) {
            const result = removeNodeStructureSnapshot(this.snapshots[index], this.meta);
            if (!result.success) {
                return result;
            }
        }
        return success(this.meta);
    }

    async redo(): Promise<IUndoRedoResult> {
        for (const snapshot of this.snapshots) {
            const result = await restoreNodeStructureSnapshot(snapshot, this.meta);
            if (!result.success) {
                return result;
            }
        }
        return success(this.meta);
    }
}
