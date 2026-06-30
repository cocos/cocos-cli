import type { AnimationClip } from 'cc';
import { dumpAuxiliaryCurves } from './auxiliary-curve';
import { dumpEmbeddedPlayers } from './embedded-player';
import {
    getClipSample,
    queryClipEvents,
} from './utils';
import {
    getClipTracks,
    parsePropertyTrack,
    queryTrackChannels,
} from './property-curve-track';

const SPRITE_FRAME_PROP_KEY = 'cc.Sprite.spriteFrame';

export function syncAnimationClipDuration(clip: AnimationClip): number {
    const duration = queryAnimationClipDuration(clip);
    (clip as any).duration = duration;
    return duration;
}

function queryAnimationClipDuration(clip: AnimationClip): number {
    const sample = getClipSample(clip);
    return Math.max(
        queryTrackDuration(clip, sample),
        queryEventDuration(clip),
        queryEmbeddedPlayerDuration(clip, sample),
        queryAuxiliaryCurveDuration(clip, sample),
    );
}

function queryTrackDuration(clip: AnimationClip, sample: number): number {
    let duration = queryFiniteDuration(typeof (clip as any).range === 'function' ? (clip as any).range()?.max : 0);
    for (const track of getClipTracks(clip)) {
        const parsed = parsePropertyTrack(track);
        const frameDuration = parsed?.descriptor.propKey === SPRITE_FRAME_PROP_KEY ? 1 / sample : 0;
        for (const channel of queryTrackChannels(track)) {
            for (const time of queryCurveTimes(channel.curve)) {
                duration = Math.max(duration, time + frameDuration);
            }
        }
    }
    return duration;
}

function queryEventDuration(clip: AnimationClip): number {
    let duration = 0;
    for (const event of queryClipEvents(clip) || []) {
        duration = Math.max(duration, queryFiniteDuration((event as any).frame));
    }
    return duration;
}

function queryEmbeddedPlayerDuration(clip: AnimationClip, sample: number): number {
    let duration = 0;
    for (const player of dumpEmbeddedPlayers(clip)) {
        duration = Math.max(duration, queryFiniteDuration(player.end / sample));
    }
    return duration;
}

function queryAuxiliaryCurveDuration(clip: AnimationClip, sample: number): number {
    let duration = 0;
    for (const curve of Object.values(dumpAuxiliaryCurves(clip))) {
        for (const keyframe of curve.keyframes) {
            duration = Math.max(duration, queryFiniteDuration(keyframe.frame / sample));
        }
    }
    return duration;
}

function queryCurveTimes(curve: unknown): number[] {
    const curveAny = curve as any;
    if (typeof curveAny?.times === 'function') {
        return Array.from(curveAny.times()).map((time) => queryFiniteDuration(time));
    }
    if (typeof curveAny?.keyframes === 'function') {
        return Array.from(curveAny.keyframes()).map((keyframe: any) => queryFiniteDuration(keyframe?.[0]));
    }
    return [];
}

function queryFiniteDuration(value: unknown): number {
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
}
