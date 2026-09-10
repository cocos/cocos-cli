import type { Scene } from 'cc';
import type { IUndoCommand, IUndoRedoResult } from '../../../../common';

/** Existing edits still undo normally, but cannot bring back SH from before Clear. */
export class LightProbeClearCommand implements IUndoCommand {
    readonly meta;

    constructor(private readonly command: IUndoCommand, private readonly sceneUuid: string, private readonly getScene: () => Scene | null) {
        this.meta = command.meta;
    }

    undo(): Promise<IUndoRedoResult> { return this.apply('undo'); }
    redo(): Promise<IUndoRedoResult> { return this.apply('redo'); }

    private async apply(direction: 'undo' | 'redo'): Promise<IUndoRedoResult> {
        try {
            return await this.command[direction]();
        } finally {
            // Also protect against partially applied failed commands. A replacement
            // scene owns another history and must never receive this scene's result.
            const scene = this.getScene();
            if (scene?.isValid && scene.uuid === this.sceneUuid) scene.globals.lightProbeInfo.onProbeBakeCleared();
        }
    }
}
