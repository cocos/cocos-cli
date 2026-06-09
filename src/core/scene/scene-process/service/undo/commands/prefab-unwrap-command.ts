import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import { nodeOperation } from '../../prefab/node';
import {
    createNodeCommandMeta,
    type INodeStructureSnapshot,
    failure,
    success,
} from './node-structure-command-utils';
import {
    findPrefabCommandNode,
    nodeNotFound,
    replacePrefabNodeSnapshot,
} from './prefab-command-utils';

export class PrefabUnwrapCommand implements IUndoCommand {
    meta: IUndoCommandMeta;

    constructor(
        type: string,
        label: string,
        private readonly before: INodeStructureSnapshot,
        private readonly after: INodeStructureSnapshot,
        private readonly removeNested: boolean,
    ) {
        this.meta = createNodeCommandMeta(type, label);
    }

    async undo(): Promise<IUndoRedoResult> {
        return replacePrefabNodeSnapshot(this.after, this.before, this.meta);
    }

    async redo(): Promise<IUndoRedoResult> {
        const node = findPrefabCommandNode(this.before);
        if (!node) {
            return nodeNotFound(this.meta, this.before);
        }

        const result = nodeOperation.unWrapPrefabInstance(node.uuid, this.removeNested);
        return result ? success(this.meta) : failure(this.meta, `${this.meta.label} redo failed`);
    }
}
