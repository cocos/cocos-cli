import type { AnimationClip, AnimationState } from 'cc';
import type { IAnimationClipDump, IAnimationCurveDump, IAnimationCurveKeyDump, IAnimationValue } from '../../../common';
import { dumpAuxiliaryCurves } from './auxiliary-curve';
import { dumpEmbeddedPlayers, queryEmbeddedPlayerGroups } from './embedded-player';
import { dumpPropertyCurves, type IPropertyCurveMetadataContext } from './property-curve';
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
        isLock: options.isSkeleton,
        isSkeleton: options.isSkeleton,
        useBakedAnimation: options.useBakedAnimation,
    };
}


function dumpAnimationCurves(clip: AnimationClip, options: IPropertyCurveMetadataContext): IAnimationCurveDump[] {
    const curves = dumpPropertyCurves(clip, options);
    const curveKeys = new Set(curves.map((curve) => `${curve.nodePath}\u0000${curve.key}`));
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
    const exoticAnimation = (clip as any)._exoticAnimation as { _nodeAnimations?: unknown[] } | null | undefined;
    if (!Array.isArray(exoticAnimation?._nodeAnimations)) {
        return [];
    }

    const sample = getClipSample(clip);
    const curves: IAnimationCurveDump[] = [];
    for (const nodeAnimation of exoticAnimation._nodeAnimations) {
        const node = nodeAnimation as {
            _path?: unknown;
            _position?: unknown;
            _rotation?: unknown;
            _scale?: unknown;
        };
        const nodePath = normalizeExoticNodePath(node._path);
        if (!nodePath) {
            continue;
        }
        appendExoticCurve(curves, nodePath, 'position', node._position, sample, 'cc.Vec3', ['x', 'y', 'z']);
        appendExoticCurve(curves, nodePath, 'rotation', node._rotation, sample, 'cc.Quat', undefined);
        appendExoticCurve(curves, nodePath, 'scale', node._scale, sample, 'cc.Vec3', ['x', 'y', 'z']);
    }
    return curves;
}

function appendExoticCurve(
    curves: IAnimationCurveDump[],
    nodePath: string,
    key: 'position' | 'rotation' | 'scale',
    trackValue: unknown,
    sample: number,
    type: string,
    partKeys: readonly string[] | undefined,
): void {
    const track = trackValue as {
        times?: ArrayLike<number>;
        values?: { get?: (index: number, value: Record<string, number>) => void };
    } | null | undefined;
    if (!track || !track.times || !track.values || typeof track.values.get !== 'function') {
        return;
    }

    const times = Array.from(track.times, Number);
    const keyframes: IAnimationCurveKeyDump[] = [];
    const channels = partKeys?.map((partKey) => ({
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
            type,
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
        nodePath,
        key,
        keyframes,
        channels,
        displayName: key,
        name: key,
        menuName: key,
        type: { value: type },
        isCurveSupport: key !== 'rotation',
        partKeys: partKeys ? [...partKeys] : undefined,
    });
}

function normalizeExoticNodePath(path: unknown): string {
    return String(path || '').replace(/^\/+|\/+$/g, '');
}
