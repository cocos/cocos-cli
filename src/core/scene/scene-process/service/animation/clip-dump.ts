import type { AnimationClip, AnimationState } from 'cc';
import type { IAnimationClipDump, IAnimationCurveDump, IAnimationCurveKeyDump, IAnimationValue } from '../../../common';
import { dumpAuxiliaryCurves } from './auxiliary-curve';
import { queryExoticAnimationTracks, type IExoticAnimationTrack } from './exotic-animation-track';
import { dumpEmbeddedPlayers, queryEmbeddedPlayerGroups } from './embedded-player';
import { dumpPropertyCurves, type IPropertyCurveMetadataContext } from './property-curve';
import { dumpUntypedAnimationCurves } from './untyped-animation-track';
import { cloneValue, getClipSample } from './utils';

export function createClipDump(clip: AnimationClip, state: AnimationState | undefined, options: {
    isSkeleton: boolean;
    useBakedAnimation: boolean;
} & IPropertyCurveMetadataContext): IAnimationClipDump {
    const sample = getClipSample(clip);
    const events = Array.isArray((clip as any).events) ? (clip as any).events : [];
    return {
        name: clip.name,
        duration: Number((clip as any).duration) || 0,
        sample,
        speed: Number((clip as any).speed) || 0,
        wrapMode: Number((clip as any).wrapMode) || 0,
        curves: dumpAnimationCurves(clip, options),
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


function dumpAnimationCurves(clip: AnimationClip, options: IPropertyCurveMetadataContext): IAnimationCurveDump[] {
    const curves = dumpPropertyCurves(clip, options);
    const curveKeys = new Set(curves.map((curve) => `${curve.nodePath}\u0000${curve.key}`));
    for (const curve of dumpUntypedAnimationCurves(clip, options)) {
        const key = `${curve.nodePath}\u0000${curve.key}`;
        if (!curveKeys.has(key)) {
            curves.push(curve);
            curveKeys.add(key);
        }
    }
    for (const curve of dumpExoticAnimationCurves(clip)) {
        const key = `${curve.nodePath}\u0000${curve.key}`;
        if (!curveKeys.has(key)) {
            curves.push(curve);
            curveKeys.add(key);
        }
    }
    return curves;
}

function dumpExoticAnimationCurves(clip: AnimationClip): IAnimationCurveDump[] {
    const curves: IAnimationCurveDump[] = [];
    const sample = getClipSample(clip);
    for (const track of queryExoticAnimationTracks(clip)) {
        appendExoticCurve(curves, track, sample);
    }
    return curves;
}

function appendExoticCurve(curves: IAnimationCurveDump[], track: IExoticAnimationTrack, sample: number): void {
    if (!track.values || typeof track.values.get !== 'function') {
        return;
    }

    const times = Array.from(track.times, Number);
    const keyframes: IAnimationCurveKeyDump[] = [];
    const channels = track.partKeys?.map((partKey) => ({
        key: partKey,
        displayName: partKey,
        type: { value: 'cc.Number' },
        keyframes: [] as IAnimationCurveKeyDump[],
    }));

    for (let index = 0; index < times.length; index++) {
        const value: Record<string, number> = {};
        try {
            track.values.get(index, value);
        } catch {
            return;
        }
        const frame = Math.round(times[index] * sample);
        const dump = {
            value: cloneValue(value) as IAnimationValue,
            readonly: true,
            type: track.type,
        };
        keyframes.push({ frame, dump });
        if (channels) {
            for (const channel of channels) {
                channel.keyframes.push({
                    frame,
                    dump: { value: value[channel.key] ?? 0, readonly: true, type: 'cc.Number' },
                });
            }
        }
    }

    if (keyframes.length === 0) {
        return;
    }
    curves.push({
        nodePath: track.nodePath,
        key: track.key,
        keyframes,
        channels,
        displayName: track.key,
        name: track.key,
        menuName: track.key,
        type: { value: track.type },
        isCurveSupport: track.key !== 'rotation',
        partKeys: track.partKeys ? [...track.partKeys] : undefined,
    });
}
