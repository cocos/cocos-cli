import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import { prefabWriteSession } from '../../prefab/write-session';
import { PrefabWriteConflict, reconcilePrefabWrite } from '../../prefab/write-runtime';
import { loadWithPrefabSources } from '../../prefab/source-loader';
import { queryRegisteredService } from '../../core';
import type { IEditorSessionService } from '../../core/editor-session';
import { ReloadResult } from '../../../../common';
import {
    createNodeCommandMeta,
    failure,
    type INodeStructureSnapshot,
} from './node-structure-command-utils';
import { replacePrefabNodeSnapshot } from './prefab-command-utils';

export class PrefabApplyCommand implements IUndoCommand {
    meta: IUndoCommandMeta;
    private expectedFingerprint: string;

    constructor(
        type: string,
        label: string,
        private readonly before: INodeStructureSnapshot,
        private readonly after: INodeStructureSnapshot,
        private readonly assetUuid: string,
        private readonly assetSource: string,
        private readonly beforeAssetContent: string,
        private readonly afterAssetContent: string,
        afterFingerprint: string,
    ) {
        this.meta = createNodeCommandMeta(type, label);
        this.expectedFingerprint = afterFingerprint;
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
        try {
            const receipt = await prefabWriteSession.commit(this.assetUuid, assetContent, this.expectedFingerprint);
            this.expectedFingerprint = receipt.after.fingerprint;
            let restoring = false;
            return await reconcilePrefabWrite(receipt, async () => {
                try {
                    return await loadWithPrefabSources([this.assetUuid], async () => {
                        restoring = true;
                        const result = await replacePrefabNodeSnapshot(removeSnapshot, restoreSnapshot, this.meta);
                        if (!result.success) throw new Error(result.reason ?? 'Could not restore the instance snapshot.');
                        const reloaded = await queryRegisteredService<IEditorSessionService>('Editor')!.reloadWithinPrefabEdit();
                        if (reloaded !== ReloadResult.SUCCESS) throw new Error('The source was restored, but the runtime could not be reloaded.');
                        return result;
                    }, true);
                } catch (error) {
                    if (restoring) await prefabWriteSession.markUnavailable();
                    throw error;
                }
            });
        } catch (error) {
            const result = failure(this.meta, error instanceof Error ? error.message : String(error));
            if (error instanceof PrefabWriteConflict) result.error = {
                code: error.code, message: error.message, commitState: error.commitState, assetUuid: error.assetUuid, runtime: error.runtime,
            };
            return result;
        }
    }
}
