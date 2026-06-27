import type { IUndoCommand, IUndoCommandMeta, IUndoRedoResult } from '../../../common';
import { createUndoId } from '../undo/commands/command-utils-shared';
import type { IAnimationClipSnapshot } from './clip-snapshot';

interface IAnimationClipSnapshotCommandOptions {
    clipUuid: string;
    before: IAnimationClipSnapshot;
    after: IAnimationClipSnapshot;
    applySnapshot: (snapshot: IAnimationClipSnapshot) => Promise<void>;
}

export class AnimationClipSnapshotCommand implements IUndoCommand {
    readonly meta: IUndoCommandMeta;

    constructor(private readonly options: IAnimationClipSnapshotCommandOptions) {
        this.meta = {
            id: createUndoId('animation-operation'),
            label: 'Animation Operation',
            type: 'animation:clip-snapshot',
            scope: {
                assetUuid: options.clipUuid,
                editorType: 'animation',
                mode: 'animation',
            },
            timestamp: Date.now(),
        };
    }

    async undo(): Promise<IUndoRedoResult> {
        return await this._apply(this.options.before);
    }

    async redo(): Promise<IUndoRedoResult> {
        return await this._apply(this.options.after);
    }

    private async _apply(snapshot: IAnimationClipSnapshot): Promise<IUndoRedoResult> {
        try {
            await this.options.applySnapshot(snapshot);
            return {
                success: true,
                commandId: this.meta.id,
                label: this.meta.label,
            };
        } catch (error) {
            return {
                success: false,
                commandId: this.meta.id,
                label: this.meta.label,
                reason: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
