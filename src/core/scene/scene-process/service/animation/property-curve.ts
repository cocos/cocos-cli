import { AnimationClip, Node, animation } from 'cc';
import type {
    IAnimationCurveDump,
    IAnimationCurveKeyDump,
    IAnimationValue,
} from '../../../common';
import {
    getClipSample,
    normalizeFrames,
} from './utils';

type PropertyKey = 'position' | 'scale' | 'eulerAngles';
type VectorTrack = InstanceType<typeof animation.VectorTrack>;

interface IPropertyTarget {
    nodePath?: string;
    nodeUuid?: string;
    propKey: string;
}

interface IVector3Value {
    x: number;
    y: number;
    z: number;
}

const VECTOR_PROPERTY_TYPES: Record<PropertyKey, { displayName: string; type: { value: string } }> = {
    position: { displayName: 'position', type: { value: 'cc.Vec3' } },
    scale: { displayName: 'scale', type: { value: 'cc.Vec3' } },
    eulerAngles: { displayName: 'rotation(eulerAngles)', type: { value: 'cc.Vec3' } },
};

const VECTOR_COMPONENTS = ['x', 'y', 'z'] as const;

export interface IPropertyCurveOperationContext {
    rootNode: Node;
    rootPath: string;
}

export function dumpPropertyCurves(clip: AnimationClip): IAnimationCurveDump[] {
    const curves: IAnimationCurveDump[] = [];
    for (const track of getClipTracks(clip)) {
        const target = parsePropertyTrack(track);
        if (!target) {
            continue;
        }
        const info = VECTOR_PROPERTY_TYPES[target.propKey];
        curves.push({
            nodePath: target.nodePath,
            key: target.propKey,
            keyframes: dumpVectorTrackKeyframes(clip, track),
            displayName: info.displayName,
            name: info.displayName,
            menuName: info.displayName,
            type: info.type,
            isCurveSupport: true,
            preExtrap: Number((track.channels()[0].curve as any).preExtrapolation) || 0,
            postExtrap: Number((track.channels()[0].curve as any).postExtrapolation) || 0,
        });
    }
    return curves.sort((a, b) => `${a.nodePath}:${a.key}`.localeCompare(`${b.nodePath}:${b.key}`));
}

export function createPropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget & { frame: number; value: IAnimationValue },
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const value = normalizeVector3Value(operation.value);
    const frame = Number(operation.frame);
    if (!target || !value || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey) || createPropertyTrack(clip, target.nodePath, target.propKey);
    const time = frame / getClipSample(clip);
    const channels = track.channels();
    for (let index = 0; index < VECTOR_COMPONENTS.length; index++) {
        setCurveKey(channels[index].curve, time, value[VECTOR_COMPONENTS[index]]);
    }
    return true;
}

export function removePropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget & { frames: number[] },
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frames = normalizeFrames(operation.frames);
    if (!target || frames.length === 0) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
    if (!track) {
        return false;
    }

    let changed = false;
    for (const channel of track.channels().slice(0, VECTOR_COMPONENTS.length)) {
        changed = removeCurveKeys(clip, channel.curve, frames) || changed;
    }
    removeTrackIfEmpty(clip, track);
    return changed;
}

export function movePropertyKeys(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget & { frames: number[]; offset: number },
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frames = normalizeFrames(operation.frames);
    const offset = Number(operation.offset);
    if (!target || frames.length === 0 || !Number.isFinite(offset)) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
    if (!track) {
        return false;
    }

    let changed = false;
    for (const channel of track.channels().slice(0, VECTOR_COMPONENTS.length)) {
        changed = moveCurveKeys(clip, channel.curve, frames, offset) || changed;
    }
    return changed;
}

export function replacePropertyCurves(clip: AnimationClip, curves: IAnimationCurveDump[]): boolean {
    removeSupportedPropertyTracks(clip);

    for (const curve of curves) {
        if (!isPropertyKey(curve.key)) {
            continue;
        }
        if (!Array.isArray(curve.keyframes) || curve.keyframes.length === 0) {
            continue;
        }

        const track = createPropertyTrack(clip, curve.nodePath, curve.key);
        for (const channel of track.channels().slice(0, VECTOR_COMPONENTS.length)) {
            (channel.curve as any).preExtrapolation = Number(curve.preExtrap) || 0;
            (channel.curve as any).postExtrapolation = Number(curve.postExtrap) || 0;
        }

        const keyframes = [...curve.keyframes].sort((a, b) => a.frame - b.frame);
        for (const keyframe of keyframes) {
            const value = normalizeVector3Value(keyframe.dump.value);
            if (!value) {
                return false;
            }
            const time = keyframe.frame / getClipSample(clip);
            const channels = track.channels();
            for (let index = 0; index < VECTOR_COMPONENTS.length; index++) {
                setCurveKey(channels[index].curve, time, value[VECTOR_COMPONENTS[index]]);
            }
        }
    }

    return true;
}

function dumpVectorTrackKeyframes(clip: AnimationClip, track: VectorTrack): IAnimationCurveKeyDump[] {
    const sample = getClipSample(clip);
    const channels = track.channels();
    const times = new Set<number>();
    for (const channel of channels.slice(0, VECTOR_COMPONENTS.length)) {
        for (const time of channel.curve.times()) {
            times.add(time);
        }
    }

    return Array.from(times)
        .sort((a, b) => a - b)
        .map((time) => ({
            frame: Math.round(time * sample),
            dump: {
                value: {
                    x: normalizeNumber(channels[0].curve.evaluate(time)),
                    y: normalizeNumber(channels[1].curve.evaluate(time)),
                    z: normalizeNumber(channels[2].curve.evaluate(time)),
                },
                type: 'cc.Vec3',
            },
        }));
}

function resolvePropertyTarget(context: IPropertyCurveOperationContext, operation: IPropertyTarget): { nodePath: string; propKey: PropertyKey } | null {
    if (!isPropertyKey(operation.propKey)) {
        return null;
    }

    const nodePath = resolveRelativeNodePath(context, operation);
    if (nodePath === null) {
        return null;
    }

    return {
        nodePath,
        propKey: operation.propKey,
    };
}

function resolveRelativeNodePath(context: IPropertyCurveOperationContext, operation: IPropertyTarget): string | null {
    if (operation.nodeUuid) {
        return findRelativeNodePathByUuid(context.rootNode, operation.nodeUuid);
    }

    const nodePath = normalizePath(operation.nodePath || '');
    if (!nodePath) {
        return '';
    }

    const rootPath = normalizePath(context.rootPath);
    if (nodePath === rootPath) {
        return '';
    }
    if (rootPath && nodePath.startsWith(`${rootPath}/`)) {
        return nodePath.slice(rootPath.length + 1);
    }
    return context.rootNode.getChildByPath(nodePath) ? nodePath : null;
}

function findRelativeNodePathByUuid(node: Node, uuid: string, prefix = ''): string | null {
    if (node.uuid === uuid) {
        return prefix;
    }
    for (const child of node.children) {
        const path = prefix ? `${prefix}/${child.name}` : child.name;
        const result = findRelativeNodePathByUuid(child, uuid, path);
        if (result !== null) {
            return result;
        }
    }
    return null;
}

function findPropertyTrack(clip: AnimationClip, nodePath: string, propKey: PropertyKey): VectorTrack | null {
    for (const track of getClipTracks(clip)) {
        const target = parsePropertyTrack(track);
        if (target?.nodePath === nodePath && target.propKey === propKey) {
            return track;
        }
    }
    return null;
}

function createPropertyTrack(clip: AnimationClip, nodePath: string, propKey: PropertyKey): VectorTrack {
    const track = new animation.VectorTrack();
    const path = new animation.TrackPath();
    if (nodePath) {
        path.toHierarchy(nodePath);
    }
    path.toProperty(propKey);
    track.path = path;
    track.componentsCount = 3;
    clip.addTrack(track);
    return track;
}

function parsePropertyTrack(track: unknown): { nodePath: string; propKey: PropertyKey } | null {
    if (!(track instanceof animation.VectorTrack) || track.componentsCount !== 3) {
        return null;
    }

    const path = track.path;
    let index = 0;
    let nodePath = '';
    while (index < path.length && path.isHierarchyAt(index)) {
        const segment = normalizePath(path.parseHierarchyAt(index));
        if (segment) {
            nodePath = nodePath ? `${nodePath}/${segment}` : segment;
        }
        index++;
    }

    if (index !== path.length - 1 || !path.isPropertyAt(index)) {
        return null;
    }

    const propKey = path.parsePropertyAt(index);
    return isPropertyKey(propKey) ? { nodePath, propKey } : null;
}

function removeSupportedPropertyTracks(clip: AnimationClip): void {
    for (let index = clip.tracksCount - 1; index >= 0; index--) {
        if (parsePropertyTrack(clip.getTrack(index))) {
            clip.removeTrack(index);
        }
    }
}

function removeTrackIfEmpty(clip: AnimationClip, track: VectorTrack): void {
    if (track.channels().slice(0, VECTOR_COMPONENTS.length).some((channel) => channel.curve.keyFramesCount > 0)) {
        return;
    }

    for (let index = clip.tracksCount - 1; index >= 0; index--) {
        if (clip.getTrack(index) === track) {
            clip.removeTrack(index);
            return;
        }
    }
}

function setCurveKey(curve: ReturnType<VectorTrack['channels']>[number]['curve'], time: number, value: number): void {
    const keyframes = Array.from(curve.keyframes())
        .filter(([keyTime]) => !isSameTime(keyTime, time))
        .concat([[time, { value } as any]]);
    keyframes.sort((a, b) => a[0] - b[0]);
    curve.assignSorted(keyframes as any);
}

function removeCurveKeys(clip: AnimationClip, curve: ReturnType<VectorTrack['channels']>[number]['curve'], frames: number[]): boolean {
    const sample = getClipSample(clip);
    const before = Array.from(curve.keyframes());
    const after = before.filter(([time]) => !frames.includes(Math.round(time * sample)));
    if (after.length === before.length) {
        return false;
    }
    curve.assignSorted(after);
    return true;
}

function moveCurveKeys(clip: AnimationClip, curve: ReturnType<VectorTrack['channels']>[number]['curve'], frames: number[], offset: number): boolean {
    const sample = getClipSample(clip);
    let changed = false;
    const keyframes = Array.from(curve.keyframes()).map(([time, value]) => {
        const frame = Math.round(time * sample);
        if (!frames.includes(frame)) {
            return { frame, value };
        }
        changed = true;
        return { frame: Math.max(0, frame + offset), value };
    });

    if (!changed) {
        return false;
    }
    keyframes.sort((a, b) => a.frame - b.frame);
    curve.assignSorted(keyframes.map((keyframe) => [keyframe.frame / sample, keyframe.value] as [number, any]));
    return true;
}

function getClipTracks(clip: AnimationClip): any[] {
    return Array.from((clip as any).tracks || []);
}

function isPropertyKey(value: unknown): value is PropertyKey {
    return value === 'position' || value === 'scale' || value === 'eulerAngles';
}

function normalizeVector3Value(value: IAnimationValue): IVector3Value | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const x = Number((value as any).x);
    const y = Number((value as any).y);
    const z = Number((value as any).z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }
    return { x, y, z };
}

function normalizeNumber(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizePath(path: string): string {
    return path.replace(/^\/+|\/+$/g, '');
}

function isSameTime(left: number, right: number): boolean {
    return Math.abs(left - right) <= 1e-6;
}
