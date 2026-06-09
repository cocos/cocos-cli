import { Node } from 'cc';
import { Service } from '../core';
import {
    captureNodeStructureSnapshot,
    type INodeStructureSnapshot,
} from '../undo/commands/node-structure-command-utils';
import { PrefabNodeStructureCommand } from '../undo/commands/prefab-node-structure-command';
import { PrefabUnwrapCommand } from '../undo/commands/prefab-unwrap-command';
import { PrefabApplyCommand } from '../undo/commands/prefab-apply-command';

interface IPrefabReloadPreserveState {
    preserveUndoHistory: boolean;
    editorUuid: string | null;
}

export class PrefabUndoHelper {
    private _prefabReloadsPreservingUndoHistory = new Map<string, IPrefabReloadPreserveState>();

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

    pushApplyCommand(
        type: string,
        label: string,
        before: INodeStructureSnapshot | null,
        after: INodeStructureSnapshot | null,
        assetUuid: string,
        assetSource: string,
        beforeAssetContent: string,
        afterAssetContent: string,
    ): void {
        const pair = this._getPushablePair(before, after, beforeAssetContent !== afterAssetContent);
        if (!pair) {
            return;
        }

        Service.Undo?.push(new PrefabApplyCommand(
            type,
            label,
            pair[0],
            pair[1],
            assetUuid,
            assetSource,
            beforeAssetContent,
            afterAssetContent,
        ));
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

    preserveUndoHistoryForPrefabReload(assetUuid: string, editorUuid: string | null = null): void {
        const existing = this._prefabReloadsPreservingUndoHistory.get(assetUuid);
        this._prefabReloadsPreservingUndoHistory.set(assetUuid, {
            preserveUndoHistory: true,
            editorUuid: existing?.editorUuid ?? editorUuid,
        });
    }

    cancelPreserveUndoHistoryForPrefabReload(assetUuid: string): void {
        this._prefabReloadsPreservingUndoHistory.delete(assetUuid);
    }

    consumePreserveUndoHistoryForPrefabReload(assetUuid: string): IPrefabReloadPreserveState {
        const state = this._prefabReloadsPreservingUndoHistory.get(assetUuid);
        this.cancelPreserveUndoHistoryForPrefabReload(assetUuid);
        return state ?? {
            preserveUndoHistory: false,
            editorUuid: null,
        };
    }

    private _getPushablePair(
        before: INodeStructureSnapshot | null,
        after: INodeStructureSnapshot | null,
        force = false,
    ): [INodeStructureSnapshot, INodeStructureSnapshot] | null {
        if (!before || !after || Service.Undo?.isApplying?.()) {
            return null;
        }

        return !force && JSON.stringify(before) === JSON.stringify(after) ? null : [before, after];
    }
}
