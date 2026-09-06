import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../../common';
import { Service } from '../../core';
import { createNodeCommandMeta, failure, success } from './node-structure-command-utils';

/** Restores a prefab asset and waits for its linked scene instances to reload. */
export class PrefabAssetCommand implements IUndoCommand {
    meta: IUndoCommandMeta;

    constructor(
        type: string,
        label: string,
        private readonly assetUuid: string,
        private readonly assetSource: string,
        private readonly beforeContent: string,
        private readonly afterContent: string,
    ) {
        this.meta = createNodeCommandMeta(type, label);
    }

    async undo(): Promise<IUndoRedoResult> {
        return this._restore(this.beforeContent);
    }

    async redo(): Promise<IUndoRedoResult> {
        return this._restore(this.afterContent);
    }

    private async _restore(content: string): Promise<IUndoRedoResult> {
        const prefabService = Service.Prefab as unknown as {
            restorePrefabAssetContent?: (assetUuid: string, assetSource: string, content: string) => Promise<void>;
        };
        try {
            if (!prefabService.restorePrefabAssetContent) {
                throw new Error('Prefab asset restoration is unavailable.');
            }
            await prefabService.restorePrefabAssetContent(this.assetUuid, this.assetSource, content);
            return success(this.meta);
        } catch (error) {
            return failure(this.meta, error instanceof Error ? error.message : String(error));
        }
    }
}
