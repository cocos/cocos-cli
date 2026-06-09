import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import { Rpc } from '../../../rpc';
import { Service } from '../../core';
import {
    createNodeCommandMeta,
    failure,
    type INodeStructureSnapshot,
    success,
} from './node-structure-command-utils';
import { replacePrefabNodeSnapshot } from './prefab-command-utils';

function getCurrentEditorUuid(): string | null {
    return (Service.Editor as unknown as { getCurrentEditorUuid?: () => string | null })
        .getCurrentEditorUuid?.() ?? null;
}

export class PrefabApplyCommand implements IUndoCommand {
    meta: IUndoCommandMeta;

    constructor(
        type: string,
        label: string,
        private readonly before: INodeStructureSnapshot,
        private readonly after: INodeStructureSnapshot,
        private readonly assetUuid: string,
        private readonly assetSource: string,
        private readonly beforeAssetContent: string,
        private readonly afterAssetContent: string,
    ) {
        this.meta = createNodeCommandMeta(type, label);
    }

    async undo(): Promise<IUndoRedoResult> {
        return this._apply(this.after, this.before, this.beforeAssetContent);
    }

    async redo(): Promise<IUndoRedoResult> {
        return this._apply(this.before, this.after, this.afterAssetContent);
    }

    private async _apply(
        removeSnapshot: INodeStructureSnapshot,
        restoreSnapshot: INodeStructureSnapshot,
        assetContent: string,
    ): Promise<IUndoRedoResult> {
        const assetResult = await restorePrefabAssetContent(
            this.assetUuid,
            this.assetSource,
            assetContent,
            this.meta,
        );
        if (!assetResult.success) {
            return assetResult;
        }

        return replacePrefabNodeSnapshot(removeSnapshot, restoreSnapshot, this.meta);
    }
}

async function restorePrefabAssetContent(
    assetUuid: string,
    assetSource: string,
    content: string,
    meta: IUndoCommandMeta,
): Promise<IUndoRedoResult> {
    const prefabService = Service.Prefab as unknown as {
        preserveUndoHistoryForPrefabReload?: (assetUuid: string, editorUuid?: string | null) => void;
        cancelPreserveUndoHistoryForPrefabReload?: (assetUuid: string) => void;
    };
    prefabService.preserveUndoHistoryForPrefabReload?.(assetUuid, getCurrentEditorUuid());

    try {
        await Rpc.getInstance().request('assetManager', 'saveAsset', [assetSource, content]);
        return success(meta);
    } catch (error) {
        prefabService.cancelPreserveUndoHistoryForPrefabReload?.(assetUuid);
        return failure(meta, error instanceof Error ? error.message : String(error));
    }
}
