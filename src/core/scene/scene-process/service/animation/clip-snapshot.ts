import type { AnimationClip } from 'cc';
import type {
    IAnimationAuxiliaryCurveDump,
    IAnimationCurveDump,
    IAnimationEmbeddedPlayerDump,
    IAnimationEmbeddedPlayerGroup,
    IAnimationEventDump,
} from '../../../common';
import { dumpAuxiliaryCurves, replaceAuxiliaryCurves } from './auxiliary-curve';
import {
    dumpEmbeddedPlayers,
    queryEmbeddedPlayerGroups,
    replaceEmbeddedPlayerGroups,
    replaceEmbeddedPlayers,
} from './embedded-player';
import { dumpPropertyCurves, replacePropertyCurves } from './property-curve';
import type { IPropertyCurveMetadataContext } from './property-curve';
import {
    cloneValue,
    getClipSample,
    queryClipEvents,
    updateClipEventData,
} from './utils';

export interface IAnimationClipSnapshot {
    duration: number;
    sample: number;
    speed: number;
    wrapMode: number;
    curves: IAnimationCurveDump[];
    events: IAnimationEventDump[];
    embeddedPlayers: IAnimationEmbeddedPlayerDump[];
    embeddedPlayerGroups: IAnimationEmbeddedPlayerGroup[];
    auxiliaryCurves: Record<string, IAnimationAuxiliaryCurveDump>;
}

export function captureAnimationClipSnapshot(clip: AnimationClip, options: IPropertyCurveMetadataContext = {}): IAnimationClipSnapshot {
    const sample = getClipSample(clip);
    const events = queryClipEvents(clip) || [];
    return {
        duration: Number((clip as any).duration) || 0,
        sample,
        speed: Number((clip as any).speed) || 0,
        wrapMode: Number((clip as any).wrapMode) || 0,
        curves: dumpPropertyCurves(clip, { ...options, includeDefaults: true }),
        events: events.map((event: any) => ({
            frame: Math.round((Number(event.frame) || 0) * sample),
            func: event.func || '',
            params: Array.isArray(event.params) ? cloneValue(event.params) : [],
        })),
        embeddedPlayers: dumpEmbeddedPlayers(clip),
        embeddedPlayerGroups: queryEmbeddedPlayerGroups(clip),
        auxiliaryCurves: dumpAuxiliaryCurves(clip, { includeDefaults: true }),
    };
}

export async function restoreAnimationClipSnapshot(clip: AnimationClip, snapshot: IAnimationClipSnapshot): Promise<void> {
    (clip as any).duration = snapshot.duration;
    (clip as any).sample = snapshot.sample;
    (clip as any).speed = snapshot.speed;
    (clip as any).wrapMode = snapshot.wrapMode;
    if (!replacePropertyCurves(clip, snapshot.curves)) {
        throw new Error('Failed to restore animation property curves.');
    }
    restoreEvents(clip, snapshot);
    replaceEmbeddedPlayerGroups(clip, snapshot.embeddedPlayerGroups);
    if (!await replaceEmbeddedPlayers(clip, snapshot.embeddedPlayers)) {
        throw new Error('Failed to restore animation embedded players.');
    }
    if (!replaceAuxiliaryCurves(clip, snapshot.auxiliaryCurves)) {
        throw new Error('Failed to restore animation auxiliary curves.');
    }
}

export function animationClipSnapshotsEqual(left: IAnimationClipSnapshot, right: IAnimationClipSnapshot): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function restoreEvents(clip: AnimationClip, snapshot: IAnimationClipSnapshot): void {
    const sample = snapshot.sample || 1;
    (clip as any).events = snapshot.events.map((event) => ({
        frame: event.frame / sample,
        func: event.func,
        params: cloneValue(event.params || []),
    }));
    updateClipEventData(clip);
}
