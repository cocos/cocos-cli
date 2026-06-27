import { AnimationClip, Node } from 'cc';
import type {
    IAnimationCurveDump,
} from '../../../common';
import {
    getClipSample,
    normalizeFrames,
} from './utils';
import {
    dumpPropertyTrack,
    moveCurveKeys,
    queryTargetCurves,
    removeCurveKeys,
    restoreTrackKeyframes,
    setTrackKey,
} from './property-curve-keyframe';
import {
    applyTrackExtrapolation,
    createPropertyDescriptor,
    createPropertyDescriptorFromDump,
    createPropertyTrack,
    findPropertyTrack,
    getClipTracks,
    normalizePath,
    parsePropertyTrack,
    removeSupportedPropertyTracks,
    removeTrackIfEmpty,
} from './property-curve-track';
import type {
    ICreatePropertyKeyOperation,
    IPropertyTarget,
} from './property-curve-types';

interface IResolvedPropertyTarget {
    nodePath: string;
    propKey: string;
}

export interface IPropertyCurveOperationContext {
    rootNode: Node;
    rootPath: string;
}

export function dumpPropertyCurves(clip: AnimationClip): IAnimationCurveDump[] {
    const curves: IAnimationCurveDump[] = [];
    for (const track of getClipTracks(clip)) {
        const parsed = parsePropertyTrack(track);
        if (!parsed) {
            continue;
        }

        const curveDump = dumpPropertyTrack(clip, track, parsed.descriptor);
        if (curveDump) {
            curves.push({
                nodePath: parsed.nodePath,
                key: parsed.descriptor.propKey,
                ...curveDump,
            });
        }
    }
    return curves.sort((a, b) => `${a.nodePath}:${a.key}`.localeCompare(`${b.nodePath}:${b.key}`));
}

export function createPropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: ICreatePropertyKeyOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frame = Number(operation.frame);
    if (!target || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const existedTrack = findPropertyTrack(clip, target.nodePath, target.propKey);
    const descriptor = existedTrack
        ? parsePropertyTrack(existedTrack)?.descriptor
        : createPropertyDescriptor(target.propKey, operation.value);
    if (!descriptor) {
        return false;
    }

    const track = existedTrack || createPropertyTrack(clip, target.nodePath, descriptor);
    const time = frame / getClipSample(clip);
    return setTrackKey(track, descriptor, time, operation.value, operation.channel, operation.keyData);
}

export function removePropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget & { frames: number[]; channel?: string },
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frames = normalizeFrames(operation.frames);
    if (!target || frames.length === 0) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
    const descriptor = track ? parsePropertyTrack(track)?.descriptor : null;
    if (!track || !descriptor) {
        return false;
    }

    let changed = false;
    for (const curve of queryTargetCurves(track, descriptor, operation.channel)) {
        changed = removeCurveKeys(clip, curve, frames) || changed;
    }
    removeTrackIfEmpty(clip, track);
    return changed;
}

export function movePropertyKeys(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget & { frames: number[]; offset: number; channel?: string },
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frames = normalizeFrames(operation.frames);
    const offset = Number(operation.offset);
    if (!target || frames.length === 0 || !Number.isFinite(offset)) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
    const descriptor = track ? parsePropertyTrack(track)?.descriptor : null;
    if (!track || !descriptor) {
        return false;
    }

    let changed = false;
    for (const curve of queryTargetCurves(track, descriptor, operation.channel)) {
        changed = moveCurveKeys(clip, curve, frames, offset) || changed;
    }
    return changed;
}

export function replacePropertyCurves(clip: AnimationClip, curves: IAnimationCurveDump[]): boolean {
    removeSupportedPropertyTracks(clip);

    for (const curve of curves) {
        const descriptor = createPropertyDescriptorFromDump(curve);
        if (!descriptor) {
            continue;
        }

        const keyframes = Array.isArray(curve.keyframes) ? [...curve.keyframes].sort((a, b) => a.frame - b.frame) : [];
        const channelDumps = Array.isArray(curve.channels) ? curve.channels : [];
        if (keyframes.length === 0 && channelDumps.length === 0) {
            continue;
        }

        const track = createPropertyTrack(clip, curve.nodePath, descriptor);
        applyTrackExtrapolation(track, curve.preExtrap, curve.postExtrap);
        if (!restoreTrackKeyframes(clip, track, descriptor, keyframes, channelDumps)) {
            return false;
        }
    }

    return true;
}

function resolvePropertyTarget(context: IPropertyCurveOperationContext, operation: IPropertyTarget): IResolvedPropertyTarget | null {
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
