import type { AnimationClip, Asset } from 'cc';
import type {
    IAnimationAuxiliaryCurveDump,
    IAnimationCurveDump,
    IAnimationCurveKeyDump,
    IAnimationEmbeddedPlayerDump,
    IAnimationEmbeddedPlayerGroup,
    IAnimationEventDump,
    IAnimationValue,
} from '../../../common';
import {
    loadAnimationAssetValue,
    queryAnimationAssetCtor,
    queryAnimationAssetUuid,
} from './asset-value';
import { dumpAuxiliaryCurves, replaceAuxiliaryCurves } from './auxiliary-curve';
import {
    dumpEmbeddedPlayers,
    queryEmbeddedPlayerGroups,
    replaceEmbeddedPlayerGroups,
    replaceEmbeddedPlayers,
} from './embedded-player';
import {
    capturePropertyTrackOwners,
    dumpPropertyCurves,
    replacePropertyCurves,
    restorePropertyTrackOwners,
} from './property-curve';
import type {
    IPropertyCurveMetadataContext,
    IPropertyTrackOwnersSnapshot,
} from './property-curve';
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
    // With same-name siblings, undo/redo must persist track ownership to restore correct bindings
    propertyTrackOwners?: IPropertyTrackOwnersSnapshot;
}

type AnimationAssetCtor = new () => Asset;
type PendingAnimationAssetLoads = Map<AnimationAssetCtor, Map<string, Promise<Asset>>>;

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
        propertyTrackOwners: options.rootNode
            ? capturePropertyTrackOwners(options.rootNode, clip)
            : undefined,
    };
}

export async function restoreAnimationClipSnapshot(
    clip: AnimationClip,
    snapshot: IAnimationClipSnapshot,
    options: IPropertyCurveMetadataContext = {},
): Promise<void> {
    const previous = captureAnimationClipSnapshot(clip, options);
    const pendingAssetLoads: PendingAnimationAssetLoads = new Map();
    try {
        await applyAnimationClipSnapshot(clip, snapshot, pendingAssetLoads, options);
    } catch (error) {
        try {
            await applyAnimationClipSnapshot(clip, previous, pendingAssetLoads, options);
        } catch (restoreError) {
            console.error('[Animation] rollback failed animation clip snapshot restore:', restoreError);
        }
        throw error;
    }
}

async function applyAnimationClipSnapshot(
    clip: AnimationClip,
    snapshot: IAnimationClipSnapshot,
    pendingAssetLoads: PendingAnimationAssetLoads,
    options: IPropertyCurveMetadataContext,
): Promise<void> {
    (clip as any).duration = snapshot.duration;
    (clip as any).sample = snapshot.sample;
    (clip as any).speed = snapshot.speed;
    (clip as any).wrapMode = snapshot.wrapMode;
    const curves = await hydrateAnimationAssetCurveValues(snapshot.curves, pendingAssetLoads);
    if (!replacePropertyCurves(clip, curves)) {
        throw new Error('Failed to restore animation property curves.');
    }
    if (options.rootNode) {
        restorePropertyTrackOwners(options.rootNode, clip, snapshot.propertyTrackOwners ?? {});
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

async function hydrateAnimationAssetCurveValues(
    curves: IAnimationCurveDump[],
    pendingAssetLoads: PendingAnimationAssetLoads,
): Promise<IAnimationCurveDump[]> {
    return await Promise.all(curves.map(async (curve) => {
        if (!Array.isArray(curve.keyframes) || curve.keyframes.length === 0) {
            return curve;
        }

        let changed = false;
        const keyframes = await Promise.all(curve.keyframes.map(async (keyframe) => {
            const value = await hydrateAnimationAssetKeyframeValue(curve, keyframe, pendingAssetLoads);
            if (value === keyframe.dump.value) {
                return keyframe;
            }
            changed = true;
            return {
                ...keyframe,
                dump: {
                    ...keyframe.dump,
                    value: value as IAnimationValue,
                },
            };
        }));

        return changed ? { ...curve, keyframes } : curve;
    }));
}

async function hydrateAnimationAssetKeyframeValue(
    curve: IAnimationCurveDump,
    keyframe: IAnimationCurveKeyDump,
    pendingAssetLoads: PendingAnimationAssetLoads,
): Promise<unknown> {
    const assetCtor = queryAnimationAssetKeyframeCtor(curve, keyframe);
    const value = keyframe.dump.value as unknown;
    if (!assetCtor || value === null || value === undefined || value instanceof assetCtor) {
        return value;
    }

    const uuid = queryAnimationAssetUuid(value);
    if (!uuid) {
        return value;
    }

    return await loadAnimationAssetOnce(assetCtor, uuid, pendingAssetLoads);
}

function queryAnimationAssetKeyframeCtor(
    curve: IAnimationCurveDump,
    keyframe: IAnimationCurveKeyDump,
): AnimationAssetCtor | null {
    if (keyframe.dump.type) {
        const keyframeCtor = queryAnimationAssetCtor({ type: { value: keyframe.dump.type } });
        if (keyframeCtor) {
            return keyframeCtor;
        }
    }
    return curve.type ? queryAnimationAssetCtor({ type: curve.type }) : null;
}

function loadAnimationAssetOnce(
    assetCtor: AnimationAssetCtor,
    uuid: string,
    pendingAssetLoads: PendingAnimationAssetLoads,
): Promise<Asset> {
    let ctorLoads = pendingAssetLoads.get(assetCtor);
    if (!ctorLoads) {
        ctorLoads = new Map();
        pendingAssetLoads.set(assetCtor, ctorLoads);
    }

    let pending = ctorLoads.get(uuid);
    if (!pending) {
        pending = loadAnimationAssetValue(assetCtor, uuid);
        ctorLoads.set(uuid, pending);
    }
    return pending;
}

// propertyTrackOwners is internal bookkeeping, not animation content; exclude it to correctly detect "content changed"
export function animationClipSnapshotsEqual(left: IAnimationClipSnapshot, right: IAnimationClipSnapshot): boolean {
    const { propertyTrackOwners: _leftOwners, ...leftData } = left;
    const { propertyTrackOwners: _rightOwners, ...rightData } = right;
    return JSON.stringify(leftData) === JSON.stringify(rightData);
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
