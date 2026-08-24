import type { AnimationClip, Node } from 'cc';
import type {
    IAnimationCurveDump,
    IAnimationPropertyType,
} from '../../../common';
import { dumpPropertyCurves, type IPropertyCurveMetadataContext } from './property-curve';
import { parseAnimationTrackTarget } from './property-curve-track';
import { queryAnimationPropertyMetadata } from './property-metadata';

type UntypedTrackRefine = (path: any, proxy: unknown) => string | null;
type UntypedTrack = {
    path?: unknown;
    upgrade?: (refine: UntypedTrackRefine) => unknown;
};

type PropertyMetadataQuery = (nodePath: string, propKey: string) => IAnimationPropertyType | null;

export function upgradeUntypedAnimationTracks(rootNode: Node, clip: AnimationClip): void {
    const upgradeUntypedTracks = (clip as AnimationClip & {
        upgradeUntypedTracks?: (refine: UntypedTrackRefine) => void;
    }).upgradeUntypedTracks;
    if (typeof upgradeUntypedTracks !== 'function') {
        return;
    }

    upgradeUntypedTracks.call(clip, createUntypedTrackRefiner((nodePath, propKey) => {
        return queryAnimationPropertyMetadata(rootNode, nodePath, propKey)?.type || null;
    }));
}

export function dumpUntypedAnimationCurves(clip: AnimationClip, options: IPropertyCurveMetadataContext): IAnimationCurveDump[] {
    const tracks = (clip as any)._tracks;
    if (!Array.isArray(tracks)) {
        return [];
    }

    const curves: IAnimationCurveDump[] = [];
    const refiner = createUntypedTrackRefiner((nodePath, propKey) => {
        return options.queryPropertyMetadata?.(nodePath, propKey)?.type || null;
    });
    for (const track of tracks as UntypedTrack[]) {
        if (typeof track?.upgrade !== 'function') {
            continue;
        }
        const typedTrack = track.upgrade(refiner);
        if (!typedTrack) {
            continue;
        }

        const clipView = Object.create(clip) as AnimationClip & { _tracks: unknown[] };
        clipView._tracks = [typedTrack];
        curves.push(...dumpPropertyCurves(clipView, options));
    }
    return curves;
}

function createUntypedTrackRefiner(queryMetadata: PropertyMetadataQuery): UntypedTrackRefine {
    return (path) => {
        const target = parseAnimationTrackTarget(path);
        if (!target) {
            return null;
        }

        const type = queryMetadata(target.nodePath, target.propKey)?.value || defaultAnimationPropertyType(target.propKey);
        switch (type) {
            case 'cc.Vec2':
                return 'vec2';
            case 'cc.Vec3':
                return 'vec3';
            case 'cc.Vec4':
                return 'vec4';
            case 'cc.Color':
                return 'color';
            case 'cc.Size':
                return 'size';
            default:
                return null;
        }
    };
}

function defaultAnimationPropertyType(propKey: string): string | undefined {
    switch (propKey) {
        case 'position':
        case 'eulerAngles':
        case 'scale':
            return 'cc.Vec3';
        default:
            return undefined;
    }
}
