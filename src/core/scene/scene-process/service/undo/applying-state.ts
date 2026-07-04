import { queryRegisteredService } from '../core';

export function isUndoApplying(): boolean {
    const undo = queryRegisteredService<{ isApplying?: () => boolean }>('Undo');
    return Boolean(undo?.isApplying?.());
}
