import { Node } from 'cc';
import type { IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import {
    failure,
    type INodeStructureSnapshot,
    removeNodeStructureSnapshot,
    restoreNodeStructureSnapshot,
    success,
} from './node-structure-command-utils';
import { getEditorNodeManager, isNodeInCurrentScene } from './command-utils-shared';

export async function replacePrefabNodeSnapshot(
    removeSnapshot: INodeStructureSnapshot,
    restoreSnapshot: INodeStructureSnapshot,
    meta: IUndoCommandMeta,
): Promise<IUndoRedoResult> {
    const removeResult = removeNodeStructureSnapshot(removeSnapshot, meta);
    if (!removeResult.success) {
        return removeResult;
    }

    const restoreResult = await restoreNodeStructureSnapshot(restoreSnapshot, meta);
    return restoreResult.success ? success(meta) : restoreResult;
}

export function findPrefabCommandNode(snapshot: INodeStructureSnapshot): Node | null {
    const editorNode = getEditorNodeManager();
    const byUuid = editorNode?.getNode?.(snapshot.uuid) as Node | null;
    if (isNodeInCurrentScene(byUuid)) {
        return byUuid;
    }

    if (!snapshot.path) {
        return null;
    }

    try {
        const byPath = editorNode?.getNodeByPath?.(snapshot.path) as Node | null;
        return isNodeInCurrentScene(byPath) ? byPath : null;
    } catch (_error) {
        return null;
    }
}

export function nodeNotFound(meta: IUndoCommandMeta, snapshot: INodeStructureSnapshot): IUndoRedoResult {
    return failure(meta, `Node not found: ${snapshot.path || snapshot.uuid}`);
}
