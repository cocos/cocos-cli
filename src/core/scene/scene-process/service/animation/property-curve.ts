import { AnimationClip, Node } from 'cc';
import type {
    IAnimationCurveDump,
    IAnimationPropertyType,
    IAnimationValue,
} from '../../../common';
import {
    getClipSample,
    normalizeFrames,
} from './utils';
import {
    dumpPropertyTrack,
    copyCurveKeysTo,
    moveCurveKeys,
    queryTargetCurves,
    removeCurveKeys,
    restoreTrackKeyframes,
    setTrackKey,
    updateTrackKey,
} from './property-curve-keyframe';
import type { IDumpRealKeyDataOptions } from './real-curve-key-data';
import {
    applyTrackExtrapolation,
    createPropertyDescriptor,
    createPropertyDescriptorFromDump,
    createPropertyTrack,
    findPropertyTrack,
    getClipTracks,
    normalizePath,
    parsePropertyTrack,
    queryFirstRealCurve,
    removeSupportedPropertyTracks,
} from './property-curve-track';
import type {
    AnyTrack,
    ICopyPropertyKeysOperation,
    ICreatePropertyKeyOperation,
    IMovePropertyKeysOperation,
    IPropertyKeyFramesOperation,
    IPropertyTrackDescriptor,
    PropertyKind,
    IPropertyTarget,
    ISetPropertyCurveExtrapolationOperation,
    IUpdatePropertyKeyDataOperation,
} from './property-curve-types';

interface IResolvedPropertyTarget {
    nodePath: string;
    nodeUuid?: string;
    propKey: string;
}

export interface IAnimationPropertyMetadata {
    type: IAnimationPropertyType;
    valueCtor?: new () => unknown;
}

export interface IPropertyCurveMetadataContext {
    queryPropertyMetadata?: (nodePath: string, propKey: string) => IAnimationPropertyMetadata | null;
}

export interface IPropertyCurveOperationContext extends IPropertyCurveMetadataContext {
    rootNode: Node;
    rootPath: string;
}

export function dumpPropertyCurves(clip: AnimationClip, options: IDumpRealKeyDataOptions & IPropertyCurveMetadataContext = {}): IAnimationCurveDump[] {
    const curves: IAnimationCurveDump[] = [];
    for (const track of getClipTracks(clip)) {
        const parsed = parsePropertyTrack(track);
        if (!parsed) {
            continue;
        }

        const descriptor = applyPropertyMetadata(options, parsed.nodePath, parsed.descriptor, track);
        const curveDump = dumpPropertyTrack(clip, track, descriptor, options);
        if (curveDump) {
            curves.push({
                nodePath: parsed.nodePath,
                nodeUuid: parsed.nodeUuid,
                key: descriptor.propKey,
                ...curveDump,
            });
        }
    }
    return curves;
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

    const existedTrack = findPropertyTrack(clip, target.nodePath, target.propKey, target.nodeUuid);
    const descriptor = existedTrack
        ? queryTrackDescriptor(context, existedTrack)
        : createDescriptor(context, target, operation.value);
    if (!descriptor) {
        return false;
    }

    const track = existedTrack || createPropertyTrack(clip, target.nodePath, descriptor, target.nodeUuid);
    const time = frame / getClipSample(clip);
    return setTrackKey(track, descriptor, time, operation.value, operation.channel, operation.keyData ?? operation.curveData);
}

export function addPropertyCurve(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget & { value?: IAnimationValue },
): boolean {
    const target = resolvePropertyTarget(context, operation);
    if (!target) {
        return false;
    }

    if (findPropertyTrack(clip, target.nodePath, target.propKey, target.nodeUuid)) {
        return true;
    }

    const descriptor = createDescriptor(context, target, operation.value);
    if (!descriptor) {
        return false;
    }

    createPropertyTrack(clip, target.nodePath, descriptor, target.nodeUuid);
    return true;
}

export function updatePropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: ICreatePropertyKeyOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frame = Number(operation.frame);
    if (!target || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey, target.nodeUuid);
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (track && descriptor) {
        return updateTrackKey(track, descriptor, frame / getClipSample(clip), operation.value, operation.channel, operation.keyData ?? operation.curveData);
    }

    return createPropertyKey(clip, context, operation);
}

export function updatePropertyKeyData(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IUpdatePropertyKeyDataOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frame = Number(operation.frame);
    if (!target || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey, target.nodeUuid);
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (!track || !descriptor) {
        return false;
    }

    return updateTrackKey(track, descriptor, frame / getClipSample(clip), undefined, operation.channel, operation.keyData ?? operation.curveData);
}

export function removePropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyKeyFramesOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frames = normalizeFrames(operation.frames);
    if (!target || frames.length === 0) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey, target.nodeUuid);
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (!track || !descriptor) {
        return false;
    }

    let changed = false;
    for (const curve of queryTargetCurves(track, descriptor, operation.channel)) {
        changed = removeCurveKeys(clip, curve, frames) || changed;
    }
    return changed;
}

export function removePropertyKeys(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyKeyFramesOperation,
): boolean {
    return removePropertyKey(clip, context, operation);
}

export function removePropertyCurve(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    if (!target) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey, target.nodeUuid);
    if (!track) {
        return false;
    }

    const tracks = getClipTracks(clip);
    for (let index = tracks.length - 1; index >= 0; index--) {
        if (clip.getTrack(index) === track) {
            clip.removeTrack(index);
            return true;
        }
    }
    return false;
}

export function movePropertyKeys(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IMovePropertyKeysOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frames = normalizeFrames(operation.frames);
    const offset = Number(operation.offset);
    if (!target || frames.length === 0 || !Number.isFinite(offset)) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey, target.nodeUuid);
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (!track || !descriptor) {
        return false;
    }

    let changed = false;
    for (const curve of queryTargetCurves(track, descriptor, operation.channel)) {
        changed = moveCurveKeys(clip, curve, frames, offset) || changed;
    }
    return changed;
}

export function copyPropertyKeysTo(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: ICopyPropertyKeysOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frames = normalizeFrames(operation.frames);
    const dstFrame = Number(operation.dstFrame);
    if (!target || frames.length === 0 || !Number.isFinite(dstFrame)) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey, target.nodeUuid);
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (!track || !descriptor) {
        return false;
    }

    let changed = false;
    for (const curve of queryTargetCurves(track, descriptor, operation.channel)) {
        changed = copyCurveKeysTo(clip, curve, frames, dstFrame) || changed;
    }
    return changed;
}

export function setPropertyCurveExtrapolation(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: ISetPropertyCurveExtrapolationOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    if (!target) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey, target.nodeUuid);
    if (!track || !queryFirstRealCurve(track)) {
        return false;
    }

    applyTrackExtrapolation(track, operation.preExtrap, operation.postExtrap);
    return true;
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
        const track = createPropertyTrack(clip, curve.nodePath, descriptor, curve.nodeUuid);
        applyTrackExtrapolation(track, curve.preExtrap, curve.postExtrap);
        if (!restoreTrackKeyframes(clip, track, descriptor, keyframes, channelDumps)) {
            return false;
        }
    }

    return true;
}

function resolvePropertyTarget(context: IPropertyCurveOperationContext, operation: IPropertyTarget): IResolvedPropertyTarget | null {
    const target = resolveRelativeNodeTarget(context, operation);
    if (!target) {
        return null;
    }

    return {
        ...target,
        propKey: operation.propKey,
    };
}

function createDescriptor(
    context: IPropertyCurveOperationContext,
    target: IResolvedPropertyTarget,
    value?: IAnimationValue,
    trackKind?: PropertyKind,
    track?: AnyTrack,
): IPropertyTrackDescriptor | null {
    const metadata = context.queryPropertyMetadata?.(target.nodePath, target.propKey) || undefined;
    return createPropertyDescriptor(target.propKey, value, trackKind, track, metadata?.type, metadata?.valueCtor);
}

function queryTrackDescriptor(context: IPropertyCurveMetadataContext, track: AnyTrack): IPropertyTrackDescriptor | null {
    const parsed = parsePropertyTrack(track);
    return parsed ? applyPropertyMetadata(context, parsed.nodePath, parsed.descriptor, track) : null;
}

function applyPropertyMetadata(
    context: IPropertyCurveMetadataContext,
    nodePath: string,
    descriptor: IPropertyTrackDescriptor,
    track?: AnyTrack,
): IPropertyTrackDescriptor {
    const metadata = context.queryPropertyMetadata?.(nodePath, descriptor.propKey) || undefined;
    if (!metadata) {
        return descriptor;
    }
    return createPropertyDescriptor(descriptor.propKey, undefined, descriptor.kind, track, metadata.type, metadata.valueCtor) || {
        ...descriptor,
        type: metadata.type,
        valueCtor: metadata.valueCtor,
    };
}

function resolveRelativeNodeTarget(
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget,
): Pick<IResolvedPropertyTarget, 'nodePath' | 'nodeUuid'> | null {
    if (operation.nodeUuid) {
        const nodePath = findRelativeNodePathByUuid(context.rootNode, operation.nodeUuid);
        return nodePath === null ? null : { nodePath, nodeUuid: operation.nodeUuid };
    }

    const requestedPath = normalizePath(operation.nodePath || '');
    const rootPath = normalizePath(context.rootPath);
    const nodePath = !requestedPath || requestedPath === rootPath
        ? ''
        : rootPath && requestedPath.startsWith(`${rootPath}/`)
            ? requestedPath.slice(rootPath.length + 1)
            : requestedPath;
    const node = nodePath ? context.rootNode.getChildByPath(nodePath) : context.rootNode;
    return node ? { nodePath, nodeUuid: node.uuid || undefined } : null;
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
