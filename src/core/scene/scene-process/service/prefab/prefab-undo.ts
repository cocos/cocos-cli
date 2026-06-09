import { Node } from 'cc';
import { Service } from '../core';
import {
    captureNodeStructureSnapshot,
    type INodeStructureSnapshot,
} from '../undo/commands/node-structure-command-utils';
import { PrefabNodeStructureCommand } from '../undo/commands/prefab-node-structure-command';
import { PrefabUnwrapCommand } from '../undo/commands/prefab-unwrap-command';

export class PrefabUndoHelper {
    private _prefabReloadsPreservingUndoHistory = new Set<string>();

    captureSnapshot(node: Node | null | undefined): INodeStructureSnapshot | null {
        if (!node?.isValid) {
            return null;
        }
        return captureNodeStructureSnapshot(node);
    }

    pushNodeStructureCommand(
        type: string,
        label: string,
        before: INodeStructureSnapshot | null,
        after: INodeStructureSnapshot | null,
    ): void {
        const pair = this._getPushablePair(before, after);
        if (!pair) {
            return;
        }

        Service.Undo?.push(new PrefabNodeStructureCommand(type, label, pair[0], pair[1]));
    }

    pushUnwrapCommand(
        type: string,
        label: string,
        before: INodeStructureSnapshot | null,
        after: INodeStructureSnapshot | null,
        removeNested: boolean,
    ): void {
        const pair = this._getPushablePair(before, after);
        if (!pair) {
            return;
        }

        Service.Undo?.push(new PrefabUnwrapCommand(type, label, pair[0], pair[1], removeNested));
    }

    findNode(path: string, uuid?: string): Node | null {
        if (uuid) {
            const node = EditorExtends.Node.getNode(uuid) as Node | null;
            if (node?.isValid) {
                return node;
            }
        }

        try {
            const node = EditorExtends.Node.getNodeByPath(path) as Node | null;
            if (node?.isValid) {
                return node;
            }
        } catch (_error) {
            // Fall through to the throwing helper below.
        }

        try {
            return EditorExtends.Node.getNodeByPathOrThrow(path);
        } catch (_error) {
            return null;
        }
    }

    preserveUndoHistoryForPrefabReload(assetUuid: string): void {
        this._prefabReloadsPreservingUndoHistory.add(assetUuid);
    }

    cancelPreserveUndoHistoryForPrefabReload(assetUuid: string): void {
        this._prefabReloadsPreservingUndoHistory.delete(assetUuid);
    }

    consumePreserveUndoHistoryForPrefabReload(assetUuid: string): boolean {
        const preserveUndoHistory = this._prefabReloadsPreservingUndoHistory.has(assetUuid);
        this.cancelPreserveUndoHistoryForPrefabReload(assetUuid);
        return preserveUndoHistory;
    }

    private _getPushablePair(
        before: INodeStructureSnapshot | null,
        after: INodeStructureSnapshot | null,
    ): [INodeStructureSnapshot, INodeStructureSnapshot] | null {
        if (!before || !after || Service.Undo?.isApplying?.()) {
            return null;
        }

        return JSON.stringify(before) === JSON.stringify(after) ? null : [before, after];
    }
}
