import type { AnimationClip } from 'cc';
import { normalizePath } from './property-curve-track';

export type ExoticAnimationTrackKey = 'position' | 'rotation' | 'scale';

export interface IExoticAnimationTrack {
    nodePath: string;
    key: ExoticAnimationTrackKey;
    times: ArrayLike<number>;
    values?: {
        get?: (index: number, value: Record<string, number>) => void;
    };
    type: 'cc.Vec3' | 'cc.Quat';
    partKeys?: readonly string[];
}

const EXOTIC_TRACKS: Array<{
    key: ExoticAnimationTrackKey;
    field: '_position' | '_rotation' | '_scale';
    type: IExoticAnimationTrack['type'];
    partKeys?: readonly string[];
}> = [
    { key: 'position', field: '_position', type: 'cc.Vec3', partKeys: ['x', 'y', 'z'] },
    { key: 'rotation', field: '_rotation', type: 'cc.Quat' },
    { key: 'scale', field: '_scale', type: 'cc.Vec3', partKeys: ['x', 'y', 'z'] },
];

export function queryExoticAnimationTracks(clip: AnimationClip): IExoticAnimationTrack[] {
    const nodeAnimations = (clip as any)._exoticAnimation?._nodeAnimations;
    if (!Array.isArray(nodeAnimations)) {
        return [];
    }

    const tracks: IExoticAnimationTrack[] = [];
    for (const nodeAnimation of nodeAnimations) {
        const nodePath = normalizePath(String((nodeAnimation as any)?._path || ''));
        if (!nodePath) {
            continue;
        }
        for (const descriptor of EXOTIC_TRACKS) {
            const track = (nodeAnimation as any)?.[descriptor.field];
            if (!track || !track.times) {
                continue;
            }
            tracks.push({
                nodePath,
                key: descriptor.key,
                times: track.times,
                values: track.values,
                type: descriptor.type,
                partKeys: descriptor.partKeys,
            });
        }
    }
    return tracks;
}
