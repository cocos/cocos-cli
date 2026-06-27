import type { AnimationClip, AnimationState } from 'cc';
import type {
    IAnimationEventDump,
    IAnimationOperation,
    IAnimationOperationResult,
} from '../../../common';
import {
    addAuxiliaryCurve,
    copyAuxKey,
    createAuxKey,
    moveAuxKeys,
    removeAuxKey,
    removeAuxiliaryCurve,
    renameAuxiliaryCurve,
} from './auxiliary-curve';
import {
    addEmbeddedPlayer,
    addEmbeddedPlayerGroup,
    clearEmbeddedPlayers,
    deleteEmbeddedPlayer,
    removeEmbeddedPlayerGroup,
    updateEmbeddedPlayer,
} from './embedded-player';
import {
    createPropertyKey,
    movePropertyKeys,
    removePropertyKey,
    type IPropertyCurveOperationContext,
} from './property-curve';
import {
    cloneValue,
    ensureClipEvents,
    getClipSample,
    normalizeFrames,
    queryClipEvents,
    updateClipEventData,
} from './utils';

const SUPPORTED_CLIP_OPERATIONS = [
    'changeSample',
    'changeSpeed',
    'changeWrapMode',
    'addEvent',
    'deleteEvent',
    'updateEvent',
    'moveEvents',
    'copyEventsTo',
    'addEmbeddedPlayer',
    'deleteEmbeddedPlayer',
    'updateEmbeddedPlayer',
    'clearEmbeddedPlayer',
    'addEmbeddedPlayerGroup',
    'removeEmbeddedPlayerGroup',
    'clearEmbeddedPlayerGroup',
    'addAuxiliaryCurve',
    'removeAuxiliaryCurve',
    'renameAuxiliaryCurve',
    'createAuxKey',
    'removeAuxKey',
    'moveAuxKeys',
    'copyAuxKey',
    'createPropertyKey',
    'removePropertyKey',
    'movePropertyKeys',
];

export function validateAnimationOperation(operation: IAnimationOperation, currentClipUuid: string): IAnimationOperationResult | null {
    if (!operation || typeof (operation as any).type !== 'string' || typeof (operation as any).clipUuid !== 'string') {
        return {
            state: 'failure',
            result: false,
            reason: 'Animation operation is invalid.',
        };
    }

    if (operation.clipUuid !== currentClipUuid) {
        return {
            state: 'failure',
            result: false,
            reason: `current edit clip: '${currentClipUuid}' but you want to operate: '${operation.clipUuid}'`,
        };
    }

    if (!isSupportedClipOperation(operation.type)) {
        return {
            state: 'failure',
            result: false,
            reason: `Method '${operation.type}' does not exist to manipulate the animation.`,
        };
    }

    return null;
}

export function isSupportedClipOperation(funcName: string): boolean {
    return SUPPORTED_CLIP_OPERATIONS.includes(funcName);
}

export async function applyClipOperation(state: AnimationState, operation: IAnimationOperation, context: IPropertyCurveOperationContext): Promise<boolean> {
    const clip = state.clip;
    switch (operation.type) {
        case 'changeSample':
            return changeClipSample(clip, operation.sample);
        case 'changeSpeed':
            return changeClipSpeed(clip, operation.speed);
        case 'changeWrapMode':
            return changeClipWrapMode(clip, operation.wrapMode);
        case 'addEvent':
            return addClipEvent(clip, operation.frame, operation.func, operation.params, true);
        case 'deleteEvent':
            return deleteClipEvents(clip, operation.frames, true);
        case 'updateEvent':
            return updateClipEvents(clip, operation.frames, operation.events);
        case 'moveEvents':
            return moveClipEvents(clip, operation.frames, operation.offset);
        case 'copyEventsTo':
            return copyClipEventsTo(clip, operation.frames, operation.dstFrame);
        case 'addEmbeddedPlayer':
            return await addEmbeddedPlayer(clip, operation.embeddedPlayer);
        case 'deleteEmbeddedPlayer':
            return await deleteEmbeddedPlayer(clip, operation.embeddedPlayer);
        case 'updateEmbeddedPlayer':
            return await updateEmbeddedPlayer(clip, operation.embeddedPlayer, operation.newEmbeddedPlayer);
        case 'clearEmbeddedPlayer':
            return await clearEmbeddedPlayers(clip, operation.group);
        case 'addEmbeddedPlayerGroup':
            return addEmbeddedPlayerGroup(clip, operation.group);
        case 'removeEmbeddedPlayerGroup':
            return await removeEmbeddedPlayerGroup(clip, operation.key);
        case 'clearEmbeddedPlayerGroup':
            return await clearEmbeddedPlayers(clip, operation.key);
        case 'addAuxiliaryCurve':
            return addAuxiliaryCurve(clip, operation.name);
        case 'removeAuxiliaryCurve':
            return removeAuxiliaryCurve(clip, operation.name);
        case 'renameAuxiliaryCurve':
            return renameAuxiliaryCurve(clip, operation.name, operation.newName);
        case 'createAuxKey':
            return createAuxKey(clip, operation.name, operation.frame, operation.value);
        case 'removeAuxKey':
            return removeAuxKey(clip, operation.name, operation.frame);
        case 'moveAuxKeys':
            return moveAuxKeys(clip, operation.name, operation.frames, operation.offset);
        case 'copyAuxKey':
            return copyAuxKey(clip, operation.name, operation.frame, operation.dstFrame);
        case 'createPropertyKey':
            return createPropertyKey(clip, context, operation);
        case 'removePropertyKey':
            return removePropertyKey(clip, context, operation);
        case 'movePropertyKeys':
            return movePropertyKeys(clip, context, operation);
        default:
            return false;
    }
}

function changeClipSample(clip: AnimationClip, value: unknown): boolean {
    let sample = Math.round(Number(value));
    if (!Number.isFinite(sample) || sample < 1) {
        sample = 1;
    }

    const oldSample = getClipSample(clip);
    const events = queryClipEvents(clip);
    if (events) {
        for (const event of events) {
            const frame = Math.round((Number(event.frame) || 0) * oldSample);
            event.frame = frame / sample;
        }
    }

    (clip as any).sample = sample;
    updateClipEventData(clip);
    return true;
}

function changeClipSpeed(clip: AnimationClip, value: unknown): boolean {
    const speed = Number(value);
    if (!Number.isFinite(speed)) {
        return false;
    }
    (clip as any).speed = speed;
    return true;
}

function changeClipWrapMode(clip: AnimationClip, value: unknown): boolean {
    const wrapMode = Number(value);
    (clip as any).wrapMode = Number.isFinite(wrapMode) ? wrapMode : 0;
    return true;
}

function addClipEvent(clip: AnimationClip, frameValue: unknown, funcName: unknown, paramsValue: unknown, updateEventData: boolean): boolean {
    const frame = Number(frameValue);
    if (!Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const events = ensureClipEvents(clip);
    events.push({
        frame: frame / getClipSample(clip),
        func: typeof funcName === 'string' ? funcName : '',
        params: Array.isArray(paramsValue) ? cloneValue(paramsValue) : [],
    });
    events.sort((a, b) => Number(a.frame) - Number(b.frame));

    if (updateEventData) {
        updateClipEventData(clip);
    }
    return true;
}

function deleteClipEvents(clip: AnimationClip, framesValue: unknown, updateEventData: boolean): boolean {
    const events = queryClipEvents(clip);
    if (!events) {
        return false;
    }

    const frames = normalizeFrames(framesValue);
    const sample = getClipSample(clip);
    for (let i = events.length - 1; i >= 0; i--) {
        const frame = Math.round((Number(events[i].frame) || 0) * sample);
        if (frames.includes(frame)) {
            events.splice(i, 1);
        }
    }

    if (updateEventData) {
        updateClipEventData(clip);
    }
    return true;
}

function updateClipEvents(clip: AnimationClip, framesValue: unknown, eventsValue: IAnimationEventDump[]): boolean {
    const frames = normalizeFrames(framesValue);
    if (frames.length === 0) {
        return false;
    }

    const newEvents = Array.isArray(eventsValue) ? eventsValue : [];
    for (const frame of frames) {
        if (!deleteClipEvents(clip, [frame], false)) {
            return false;
        }
        for (const event of newEvents) {
            addClipEvent(clip, frame, event.func, event.params, false);
        }
    }

    updateClipEventData(clip);
    return true;
}

function moveClipEvents(clip: AnimationClip, framesValue: unknown, offsetValue: unknown): boolean {
    const events = queryClipEvents(clip);
    if (!events) {
        return false;
    }

    const frames = normalizeFrames(framesValue);
    const offset = Number(offsetValue);
    if (!Number.isFinite(offset)) {
        return false;
    }

    const sample = getClipSample(clip);
    for (const event of events) {
        const frame = Math.round((Number(event.frame) || 0) * sample);
        if (frames.includes(frame)) {
            event.frame = Math.max(0, frame + offset) / sample;
        }
    }

    events.sort((a, b) => Number(a.frame) - Number(b.frame));
    updateClipEventData(clip);
    return true;
}

function copyClipEventsTo(clip: AnimationClip, framesValue: unknown, dstFrameValue: unknown): boolean {
    const events = queryClipEvents(clip);
    if (!events) {
        return false;
    }

    const frames = normalizeFrames(framesValue).sort((a, b) => a - b);
    const dstFrame = Number(dstFrameValue);
    if (frames.length === 0 || !Number.isFinite(dstFrame)) {
        return false;
    }

    const sample = getClipSample(clip);
    const baseFrame = frames[0];
    const matched = events
        .filter((event) => frames.includes(Math.round((Number(event.frame) || 0) * sample)))
        .map((event) => ({
            frame: Math.max(0, Math.round((Number(event.frame) || 0) * sample) - baseFrame + dstFrame),
            func: event.func,
            params: cloneValue(event.params || []),
        }));

    for (const event of matched) {
        addClipEvent(clip, event.frame, event.func, event.params, false);
    }

    updateClipEventData(clip);
    return true;
}
