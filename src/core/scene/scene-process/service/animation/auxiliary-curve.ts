import { AnimationClip, RealCurve } from 'cc';
import type {
    IAnimationAuxiliaryCurveDump,
    IAnimationCurveKeyData,
    IAnimationKeyValueDump,
} from '../../../common';
import {
    cloneValue,
    getClipSample,
    normalizeFrames,
} from './utils';
import {
    copyRealKeyDataInternalMetadata,
    createRealCurveValue,
    type IDumpRealKeyDataOptions,
    dumpRealKeyData,
    queryRealCurveKeyframes,
    queryRealCurveNumberValue,
    setRealCurveKey,
    updateRealCurveKeyData,
} from './real-curve-key-data';

export function dumpAuxiliaryCurves(clip: AnimationClip, options: IDumpRealKeyDataOptions = {}): Record<string, IAnimationAuxiliaryCurveDump> {
    if (typeof (clip as any).getAuxiliaryCurveNames_experimental !== 'function' || !ensureAuxiliaryCurveEntries(clip)) {
        return {};
    }

    const result: Record<string, IAnimationAuxiliaryCurveDump> = {};
    for (const name of Array.from((clip as any).getAuxiliaryCurveNames_experimental() || []) as string[]) {
        const curve = (clip as any).getAuxiliaryCurve_experimental(name) as RealCurve | null;
        if (!curve) {
            continue;
        }
        result[name] = dumpAuxiliaryCurve(clip, curve, options);
    }
    return result;
}

export function addAuxiliaryCurve(clip: AnimationClip, name: string): boolean {
    if (!name || typeof (clip as any).addAuxiliaryCurve_experimental !== 'function' || !ensureAuxiliaryCurveEntries(clip)) {
        return false;
    }
    if (typeof (clip as any).hasAuxiliaryCurve_experimental === 'function' && (clip as any).hasAuxiliaryCurve_experimental(name)) {
        return false;
    }
    return Boolean((clip as any).addAuxiliaryCurve_experimental(name));
}

export function removeAuxiliaryCurve(clip: AnimationClip, name: string): boolean {
    if (!name || typeof (clip as any).removeAuxiliaryCurve_experimental !== 'function' || !ensureAuxiliaryCurveEntries(clip)) {
        return false;
    }
    (clip as any).removeAuxiliaryCurve_experimental(name);
    return true;
}

export function renameAuxiliaryCurve(clip: AnimationClip, name: string, newName: string): boolean {
    const clipAny = clip as any;
    if (!name || !newName || typeof clipAny.renameAuxiliaryCurve_experimental !== 'function' || !ensureAuxiliaryCurveEntries(clip)) {
        return false;
    }
    if (typeof clipAny.hasAuxiliaryCurve_experimental === 'function') {
        if (!clipAny.hasAuxiliaryCurve_experimental(name) || (name !== newName && clipAny.hasAuxiliaryCurve_experimental(newName))) {
            return false;
        }
    }
    clipAny.renameAuxiliaryCurve_experimental(name, newName);
    return true;
}

export function createAuxKey(clip: AnimationClip, name: string, frameValue: unknown, value: unknown, keyData?: IAnimationCurveKeyData): boolean {
    const curve = getAuxiliaryCurve(clip, name);
    const frame = Number(frameValue);
    if (!curve || !Number.isFinite(frame) || frame < 0 || typeof value !== 'number') {
        return false;
    }
    setRealCurveKey(curve as any, frame / getClipSample(clip), createRealCurveValue(value, keyData));
    return true;
}

export function removeAuxKey(clip: AnimationClip, name: string, frameValue: unknown): boolean {
    const curve = getAuxiliaryCurve(clip, name);
    const frame = Number(frameValue);
    if (!curve || !Number.isFinite(frame) || frame < 0) {
        return false;
    }
    const index = curve.indexOfKeyframe(frame / getClipSample(clip));
    if (index < 0) {
        return false;
    }
    curve.removeKeyframe(index);
    return true;
}

export function moveAuxKeys(clip: AnimationClip, name: string, framesValue: unknown, offsetValue: unknown): boolean {
    const curve = getAuxiliaryCurve(clip, name);
    const frames = normalizeFrames(framesValue);
    const offset = Number(offsetValue);
    if (!curve || !Number.isFinite(offset)) {
        return false;
    }

    let changed = false;
    const retained: Array<{ frame: number; value: unknown }> = [];
    const moved = new Map<number, unknown>();
    for (const [time, value] of queryRealCurveKeyframes(curve as any)) {
        const frame = Math.round(time * getClipSample(clip));
        if (frames.includes(frame)) {
            changed = true;
            moved.set(Math.max(0, frame + offset), value);
        } else {
            retained.push({ frame, value });
        }
    }
    if (!changed) {
        return false;
    }
    const movedFrames = new Set(moved.keys());
    const keyframes = retained
        .filter((item) => !movedFrames.has(item.frame))
        .concat(Array.from(moved, ([frame, value]) => ({ frame, value })));
    keyframes.sort((a, b) => a.frame - b.frame);
    curve.assignSorted(keyframes.map((item) => [item.frame / getClipSample(clip), item.value] as [number, any]));
    return true;
}

export function copyAuxKey(clip: AnimationClip, name: string, frameValue: unknown, dstFrameValue: unknown): boolean {
    const curve = getAuxiliaryCurve(clip, name);
    const frame = Number(frameValue);
    const dstFrame = Number(dstFrameValue);
    if (!curve || !Number.isFinite(frame) || !Number.isFinite(dstFrame)) {
        return false;
    }
    const index = curve.indexOfKeyframe(frame / getClipSample(clip));
    if (index < 0) {
        return false;
    }
    const value = cloneValue(curve.getKeyframeValue(index));
    const dstIndex = curve.indexOfKeyframe(dstFrame / getClipSample(clip));
    if (dstIndex >= 0) {
        curve.removeKeyframe(dstIndex);
    }
    setRealCurveKey(curve as any, dstFrame / getClipSample(clip), value);
    return true;
}

export function updateAuxKeyData(clip: AnimationClip, name: string, frameValue: unknown, keyData?: IAnimationCurveKeyData): boolean {
    const curve = getAuxiliaryCurve(clip, name);
    const frame = Number(frameValue);
    if (!curve || !Number.isFinite(frame) || frame < 0) {
        return false;
    }
    return updateRealCurveKeyData(curve as any, frame / getClipSample(clip), keyData);
}

export function queryAuxiliaryCurveValueAtFrame(clip: AnimationClip, name: string, frameValue: unknown): IAnimationKeyValueDump | null {
    const curve = getAuxiliaryCurve(clip, name);
    const frame = Number(frameValue);
    if (!curve || !Number.isFinite(frame) || frame < 0) {
        return null;
    }
    return {
        value: queryRealCurveNumberValue(curve.evaluate(frame / getClipSample(clip))),
        type: 'cc.Number',
    };
}

export function serializeAuxiliaryCurvesForMeta(clip: AnimationClip): Record<string, { curve: unknown }> {
    if (typeof (clip as any).getAuxiliaryCurveNames_experimental !== 'function' || !ensureAuxiliaryCurveEntries(clip)) {
        return {};
    }

    const result: Record<string, { curve: unknown }> = {};
    for (const name of Array.from((clip as any).getAuxiliaryCurveNames_experimental() || []) as string[]) {
        const curve = (clip as any).getAuxiliaryCurve_experimental(name) as RealCurve | null;
        if (curve) {
            result[name] = {
                curve: EditorExtends.serialize(curve, { stringify: false }),
            };
        }
    }
    return result;
}

export function replaceAuxiliaryCurves(clip: AnimationClip, curves: Record<string, IAnimationAuxiliaryCurveDump>): boolean {
    const names = Object.keys(curves);
    const clipAny = clip as any;
    if (typeof clipAny.getAuxiliaryCurveNames_experimental !== 'function') {
        return names.length === 0;
    }
    if (!ensureAuxiliaryCurveEntries(clip) || typeof clipAny.removeAuxiliaryCurve_experimental !== 'function' || typeof clipAny.addAuxiliaryCurve_experimental !== 'function') {
        return false;
    }

    for (const name of Array.from(clipAny.getAuxiliaryCurveNames_experimental() || []) as string[]) {
        clipAny.removeAuxiliaryCurve_experimental(name);
    }

    for (const name of names) {
        if (!addAuxiliaryCurve(clip, name)) {
            return false;
        }
        const curve = getAuxiliaryCurve(clip, name);
        if (!curve) {
            return false;
        }
        const dump = curves[name];
        (curve as any).preExtrapolation = dump.preExtrap;
        (curve as any).postExtrapolation = dump.postExtrap;
        curve.assignSorted(dump.keyframes.map((key) => [key.frame / getClipSample(clip), createRealCurveValue(key.value, key)] as [number, any]));
    }
    return true;
}

function dumpAuxiliaryCurve(clip: AnimationClip, curve: RealCurve, options: IDumpRealKeyDataOptions): IAnimationAuxiliaryCurveDump {
    const sample = getClipSample(clip);
    return {
        keyframes: queryRealCurveKeyframes(curve as any).map(([time, value]) => {
            const keyData = dumpRealKeyData(value, options);
            const keyframe = {
                frame: Math.round(time * sample),
                value: queryRealCurveNumberValue(value),
                ...keyData,
            };
            copyRealKeyDataInternalMetadata(keyData, keyframe);
            return keyframe;
        }),
        preExtrap: Number((curve as any).preExtrapolation) || 0,
        postExtrap: Number((curve as any).postExtrapolation) || 0,
    };
}

function getAuxiliaryCurve(clip: AnimationClip, name: string): RealCurve | null {
    if (!name || typeof (clip as any).getAuxiliaryCurve_experimental !== 'function' || !ensureAuxiliaryCurveEntries(clip)) {
        return null;
    }
    return (clip as any).getAuxiliaryCurve_experimental(name) || null;
}

function ensureAuxiliaryCurveEntries(clip: AnimationClip): boolean {
    const clipAny = clip as any;
    if (Array.isArray(clipAny._auxiliaryCurveEntries)) {
        return true;
    }
    if (clipAny._auxiliaryCurveEntries === null || clipAny._auxiliaryCurveEntries === undefined) {
        clipAny._auxiliaryCurveEntries = [];
        return true;
    }
    return false;
}
