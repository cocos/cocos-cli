import { AnimationClip, RealCurve } from 'cc';
import type { IAnimationAuxiliaryCurveDump } from '../../../common';
import {
    cloneValue,
    getClipSample,
    normalizeAuxiliaryCurveValue,
    normalizeFrames,
} from './utils';

export function dumpAuxiliaryCurves(clip: AnimationClip): Record<string, IAnimationAuxiliaryCurveDump> {
    if (typeof (clip as any).getAuxiliaryCurveNames_experimental !== 'function') {
        return {};
    }

    const result: Record<string, IAnimationAuxiliaryCurveDump> = {};
    for (const name of (clip as any).getAuxiliaryCurveNames_experimental() as string[]) {
        const curve = (clip as any).getAuxiliaryCurve_experimental(name) as RealCurve | null;
        if (!curve) {
            continue;
        }
        result[name] = dumpAuxiliaryCurve(clip, curve);
    }
    return result;
}

export function addAuxiliaryCurve(clip: AnimationClip, name: string): boolean {
    if (!name || typeof (clip as any).addAuxiliaryCurve_experimental !== 'function') {
        return false;
    }
    if (typeof (clip as any).hasAuxiliaryCurve_experimental === 'function' && (clip as any).hasAuxiliaryCurve_experimental(name)) {
        return false;
    }
    return Boolean((clip as any).addAuxiliaryCurve_experimental(name));
}

export function removeAuxiliaryCurve(clip: AnimationClip, name: string): boolean {
    if (!name || typeof (clip as any).removeAuxiliaryCurve_experimental !== 'function') {
        return false;
    }
    (clip as any).removeAuxiliaryCurve_experimental(name);
    return true;
}

export function renameAuxiliaryCurve(clip: AnimationClip, name: string, newName: string): boolean {
    if (!name || !newName || typeof (clip as any).renameAuxiliaryCurve_experimental !== 'function') {
        return false;
    }
    (clip as any).renameAuxiliaryCurve_experimental(name, newName);
    return true;
}

export function createAuxKey(clip: AnimationClip, name: string, frameValue: unknown, value: unknown): boolean {
    const curve = getAuxiliaryCurve(clip, name);
    const frame = Number(frameValue);
    if (!curve || !Number.isFinite(frame) || frame < 0 || typeof value !== 'number') {
        return false;
    }
    const time = frame / getClipSample(clip);
    const index = curve.indexOfKeyframe(time);
    if (index >= 0) {
        curve.removeKeyframe(index);
    }
    curve.addKeyFrame(time, value);
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

    const keyframes = Array.from(curve.keyframes()).map(([time, value]) => {
        const frame = Math.round(time * getClipSample(clip));
        return {
            frame: frames.includes(frame) ? Math.max(0, frame + offset) : frame,
            value,
        };
    });
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
    const dstIndex = curve.indexOfKeyframe(dstFrame / getClipSample(clip));
    if (dstIndex >= 0) {
        curve.removeKeyframe(dstIndex);
    }
    curve.addKeyFrame(dstFrame / getClipSample(clip), cloneValue(curve.getKeyframeValue(index)));
    return true;
}

export function serializeAuxiliaryCurvesForMeta(clip: AnimationClip): Record<string, { curve: unknown }> {
    if (typeof (clip as any).getAuxiliaryCurveNames_experimental !== 'function') {
        return {};
    }

    const result: Record<string, { curve: unknown }> = {};
    for (const name of (clip as any).getAuxiliaryCurveNames_experimental() as string[]) {
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
    if (typeof clipAny.removeAuxiliaryCurve_experimental !== 'function' || typeof clipAny.addAuxiliaryCurve_experimental !== 'function') {
        return false;
    }

    for (const name of clipAny.getAuxiliaryCurveNames_experimental() as string[]) {
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
        curve.assignSorted(dump.keyframes.map((key) => [key.frame / getClipSample(clip), key.value] as [number, any]));
    }
    return true;
}

function dumpAuxiliaryCurve(clip: AnimationClip, curve: RealCurve): IAnimationAuxiliaryCurveDump {
    const sample = getClipSample(clip);
    return {
        keyframes: Array.from(curve.keyframes()).map(([time, value]) => ({
            frame: Math.round(time * sample),
            value: normalizeAuxiliaryCurveValue((value as any).value),
        })),
        preExtrap: Number((curve as any).preExtrapolation) || 0,
        postExtrap: Number((curve as any).postExtrapolation) || 0,
    };
}

function getAuxiliaryCurve(clip: AnimationClip, name: string): RealCurve | null {
    if (!name || typeof (clip as any).getAuxiliaryCurve_experimental !== 'function') {
        return null;
    }
    return (clip as any).getAuxiliaryCurve_experimental(name) || null;
}
