import type { IUndoService } from '../../../../common';

/** The result is already in Undo history and must not be silently restored by the caller. */
export class LightFXResultRetainedError extends Error {
    constructor(stage: 'recording' | 'save', cause: unknown) {
        super(`LightFX result retained in the scene and Undo history; ${stage} was not confirmed. Check the scene before saving again or undoing. ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = 'LightFXResultRetainedError';
    }
}

/** Record before attempting I/O: a rejected save may already have written the scene to disk. */
export async function finishSavedLightFXRecording(
    undo: Pick<IUndoService, 'endRecording' | 'createCheckpoint'>,
    recordingId: string,
    save?: () => Promise<unknown>,
): Promise<void> {
    const before = undo.createCheckpoint();
    try {
        await undo.endRecording(recordingId);
    } catch (error) {
        const current = undo.createCheckpoint();
        if (current.commandId === recordingId && current.generation === before.generation) {
            throw new LightFXResultRetainedError('recording', error);
        }
        throw error;
    }
    if (save) {
        try {
            // Editor.save now marks the completed recording, not its predecessor.
            await save();
        } catch (error) {
            throw new LightFXResultRetainedError('save', error);
        }
    }
}
