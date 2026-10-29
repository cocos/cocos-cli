import { AnimationClip, Node } from 'cc';
import type {
    IAnimationCurveDump,
    IAnimationPropertyType,
    IAnimationValue,
} from '../../../common';
import { resolveAnimationRelativeNodePath } from './scene-node';
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
    const target = resolvePropertyCurveTarget(clip, context, operation);
    const frame = Number(operation.frame);
    if (!target || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const existedTrack = findPropertyTrack(clip, target.nodePath, target.propKey);
    const descriptor = existedTrack
        ? queryTrackDescriptor(context, existedTrack)
        : createDescriptor(context, target, operation.value);
    if (!descriptor || !canWritePropertyValue(context, target, descriptor)) {
        return false;
    }

    const track = existedTrack || createPropertyTrack(clip, target.nodePath, descriptor);
    const time = frame / getClipSample(clip);
    return setTrackKey(track, descriptor, time, operation.value, operation.channel, operation.keyData ?? operation.curveData);
}

export function addPropertyCurve(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget & { value?: IAnimationValue },
): boolean {
    const target = resolvePropertyCurveTarget(clip, context, operation);
    if (!target) {
        return false;
    }

    if (findPropertyTrack(clip, target.nodePath, target.propKey)) {
        return true;
    }

    const descriptor = createDescriptor(context, target, operation.value);
    if (!descriptor) {
        return false;
    }

    createPropertyTrack(clip, target.nodePath, descriptor);
    return true;
}

export function updatePropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: ICreatePropertyKeyOperation,
): boolean {
    const target = resolvePropertyCurveTarget(clip, context, operation);
    const frame = Number(operation.frame);
    if (!target || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (track && descriptor) {
        if (!canWritePropertyValue(context, target, descriptor)) {
            return false;
        }
        return updateTrackKey(track, descriptor, frame / getClipSample(clip), operation.value, operation.channel, operation.keyData ?? operation.curveData);
    }

    return createPropertyKey(clip, context, operation);
}

export function updatePropertyKeyData(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IUpdatePropertyKeyDataOperation,
): boolean {
    const target = resolvePropertyCurveTarget(clip, context, operation);
    const frame = Number(operation.frame);
    if (!target || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
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
    const target = resolvePropertyCurveTarget(clip, context, operation);
    const frames = normalizeFrames(operation.frames);
    if (!target || frames.length === 0) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
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
    const target = resolvePropertyCurveTarget(clip, context, operation);
    if (!target) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
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
    const target = resolvePropertyCurveTarget(clip, context, operation);
    const frames = normalizeFrames(operation.frames);
    const offset = Number(operation.offset);
    if (!target || frames.length === 0 || !Number.isFinite(offset)) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
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
    const target = resolvePropertyCurveTarget(clip, context, operation);
    const frames = normalizeFrames(operation.frames);
    const dstFrame = Number(operation.dstFrame);
    if (!target || frames.length === 0 || !Number.isFinite(dstFrame)) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
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
    const target = resolvePropertyCurveTarget(clip, context, operation);
    if (!target) {
        return false;
    }

    const track = findPropertyTrack(clip, target.nodePath, target.propKey);
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
        const track = createPropertyTrack(clip, curve.nodePath, descriptor);
        applyTrackExtrapolation(track, curve.preExtrap, curve.postExtrap);
        if (!restoreTrackKeyframes(clip, track, descriptor, keyframes, channelDumps)) {
            return false;
        }
    }

    return true;
}

/**
 * 解析真实节点或当前剪辑中已有的孤立属性轨道
 *
 * 缺失节点只能操作已有轨道，不能凭路径创建新轨道
 */
export function resolvePropertyCurveTarget(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget,
): IResolvedPropertyTarget | null {
    const nodePath = resolveAnimationRelativeNodePath(context.rootNode, context.rootPath, operation, {
        allowMissingPath: true,
    });
    const hasBoundNode = nodePath === ''
        || (nodePath !== null && Boolean(context.rootNode.getChildByPath(nodePath)));
    if (nodePath === null || (!hasBoundNode && !findPropertyTrack(clip, nodePath, operation.propKey))) {
        const target = operation.nodeUuid
            ? `UUID "${operation.nodeUuid}"`
            : `path "${operation.nodePath || '<root>'}"`;
        console.warn(
            `[Animation] Rejected property operation because target ${target} is not bound by the current animation hierarchy.`,
        );
        return null;
    }

    return {
        nodePath,
        propKey: operation.propKey,
    };
}

/** 缺失对象属性必须具有可恢复的类型，避免将资源 UUID 写成普通对象 */
function canWritePropertyValue(
    context: IPropertyCurveOperationContext,
    target: IResolvedPropertyTarget,
    descriptor: IPropertyTrackDescriptor,
): boolean {
    return descriptor.kind !== 'object'
        || descriptor.type.value !== 'cc.Object'
        || target.nodePath === ''
        || Boolean(context.rootNode.getChildByPath(target.nodePath));
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
