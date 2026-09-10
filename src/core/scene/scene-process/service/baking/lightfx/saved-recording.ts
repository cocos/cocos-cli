import type { IUndoService } from '../../../../common';

/** Completes a result recording without treating a later edit as part of its saved result. */
export async function finishSavedLightFXRecording(
    undo: Pick<IUndoService, 'endRecording' | 'createCheckpoint' | 'markSaved'>,
    recordingId: string,
    save?: () => Promise<unknown>,
    commit?: () => Promise<unknown>,
): Promise<void> {
    if (save) await save();
    const saved = save ? undo.createCheckpoint() : undefined;
    await undo.endRecording(recordingId);
    if (commit) await commit();
    if (!saved) return;
    const current = undo.createCheckpoint();
    // Editor.save marks the previous history entry because recording is still
    // open. Advance that mark only for this exact committed recording. A no-op
    // recording needs no new mark; edits or history resets during commit do not
    // belong to the saved result and must remain dirty.
    if (current.commandId === recordingId && current.generation === saved.generation) undo.markSaved();
}
