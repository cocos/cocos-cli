import type {
    IAnimationOperation,
    IAnimationOperationResult,
} from '../../../common';

export function isAnimationOperationResult(value: IAnimationOperation | IAnimationOperationResult): value is IAnimationOperationResult {
    return (value as IAnimationOperationResult).state === 'success' || (value as IAnimationOperationResult).state === 'failure';
}

export function shouldSyncClipDuration(operation: IAnimationOperation): boolean {
    switch (operation.type) {
        case 'changeSample':
        case 'addEvent':
        case 'deleteEvent':
        case 'updateEvent':
        case 'moveEvents':
        case 'copyEventsTo':
        case 'addEmbeddedPlayer':
        case 'deleteEmbeddedPlayer':
        case 'updateEmbeddedPlayer':
        case 'clearEmbeddedPlayer':
        case 'removeEmbeddedPlayerGroup':
        case 'clearEmbeddedPlayerGroup':
        case 'removeAuxiliaryCurve':
        case 'createAuxKey':
        case 'removeAuxKey':
        case 'moveAuxKeys':
        case 'copyAuxKey':
        case 'createPropertyKey':
        case 'updatePropertyKey':
        case 'removePropertyCurve':
        case 'removePropertyKey':
        case 'removePropertyKeys':
        case 'movePropertyKeys':
        case 'copyPropertyKeysTo':
            return true;
        default:
            return false;
    }
}

/**
 * Imported skeletal clips keep the duration authored by the importer. Their
 * editable event/settings operations must not recompute duration from the
 * currently visible event list and accidentally shorten the source clip.
 */
export function shouldSyncAnimationClipDuration(operation: IAnimationOperation, isSkeleton: boolean): boolean {
    return !isSkeleton && shouldSyncClipDuration(operation);
}

export function isAllowedSkeletonAnimationOperation(operation: IAnimationOperation): boolean {
    switch (operation.type) {
        case 'changeSample':
        case 'changeSpeed':
        case 'changeWrapMode':
        case 'addEvent':
        case 'deleteEvent':
        case 'updateEvent':
        case 'moveEvents':
        case 'copyEventsTo':
        case 'addEmbeddedPlayer':
        case 'deleteEmbeddedPlayer':
        case 'updateEmbeddedPlayer':
        case 'clearEmbeddedPlayer':
        case 'addEmbeddedPlayerGroup':
        case 'removeEmbeddedPlayerGroup':
        case 'clearEmbeddedPlayerGroup':
        case 'addAuxiliaryCurve':
        case 'removeAuxiliaryCurve':
        case 'renameAuxiliaryCurve':
        case 'createAuxKey':
        case 'removeAuxKey':
        case 'moveAuxKeys':
        case 'copyAuxKey':
        case 'updateAuxKeyData':
            return true;
        default:
            return false;
    }
}
