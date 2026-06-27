import type { AnimationClip, AnimationState } from 'cc';
import type { IAnimationClipDump } from '../../../common';
import { dumpAuxiliaryCurves } from './auxiliary-curve';
import { dumpEmbeddedPlayers, queryEmbeddedPlayerGroups } from './embedded-player';
import { dumpPropertyCurves } from './property-curve';
import { cloneValue, getClipSample } from './utils';

export function createClipDump(clip: AnimationClip, state: AnimationState | undefined, options: {
    isSkeleton: boolean;
    useBakedAnimation: boolean;
}): IAnimationClipDump {
    const sample = getClipSample(clip);
    const events = Array.isArray((clip as any).events) ? (clip as any).events : [];
    return {
        name: clip.name,
        duration: Number((clip as any).duration) || 0,
        sample,
        speed: Number((clip as any).speed) || 0,
        wrapMode: Number((clip as any).wrapMode) || 0,
        curves: dumpPropertyCurves(clip),
        events: events.map((event: any) => ({
            frame: Math.round((Number(event.frame) || 0) * sample),
            func: event.func || '',
            params: Array.isArray(event.params) ? cloneValue(event.params) : [],
        })),
        embeddedPlayers: dumpEmbeddedPlayers(clip),
        embeddedPlayerGroups: queryEmbeddedPlayerGroups(clip),
        auxiliaryCurves: dumpAuxiliaryCurves(clip),
        time: state?.current ?? 0,
        isLock: false,
        isSkeleton: options.isSkeleton,
        useBakedAnimation: options.useBakedAnimation,
    };
}
