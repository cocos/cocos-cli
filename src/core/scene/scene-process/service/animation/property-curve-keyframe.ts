import type { AnimationClip, Asset } from 'cc';
import type {
    IAnimationCurveChannelDump,
    IAnimationCurveDump,
    IAnimationCurveKeyData,
    IAnimationCurveKeyDump,
    IAnimationValue,
} from '../../../common';
import {
    cloneValue,
    getClipSample,
} from './utils';
import type {
    AnyCurve,
    AnyTrack,
    IPropertyTrackDescriptor,
} from './property-curve-types';
import {
    queryFirstRealCurve,
    queryTrackChannels,
} from './property-curve-track';
import {
    copyRealKeyDataInternalMetadata,
    createMergedRealCurveValue,
    createRealCurveValue,
    type IDumpRealKeyDataOptions,
    dumpRealKeyData,
    findRealCurveKey,
    queryRealCurveNumberValue,
} from './real-curve-key-data';
import {
    createAnimationAssetPlaceholder,
    isAnimationAssetValue,
    queryAnimationAssetCtor,
    queryAnimationAssetUuid,
    serializeAnimationAssetValue,
} from './asset-value';

export function dumpPropertyTrack(
    clip: AnimationClip,
    track: AnyTrack,
    descriptor: IPropertyTrackDescriptor,
    options: IDumpRealKeyDataOptions = {},
): Omit<IAnimationCurveDump, 'nodePath' | 'key'> | null {
    const base = {
        displayName: descriptor.displayName,
        name: descriptor.displayName,
        menuName: descriptor.menuName,
        type: descriptor.type,
        comp: descriptor.comp,
        isCurveSupport: descriptor.isCurveSupport,
    };
    switch (descriptor.kind) {
        case 'vector':
        case 'color':
        case 'size':
            return {
                ...base,
                keyframes: dumpCompositeRealTrackKeyframes(clip, track, descriptor),
                channels: dumpCompositeRealTrackChannels(clip, track, descriptor, options),
                partKeys: descriptor.partKeys ? [...descriptor.partKeys] : undefined,
                preExtrap: queryFirstRealCurve(track)?.preExtrapolation ?? 0,
                postExtrap: queryFirstRealCurve(track)?.postExtrapolation ?? 0,
            };
        case 'real':
            return {
                ...base,
                keyframes: dumpRealCurveKeyframes(clip, queryTrackChannels(track)[0].curve, options),
                preExtrap: queryFirstRealCurve(track)?.preExtrapolation ?? 0,
                postExtrap: queryFirstRealCurve(track)?.postExtrapolation ?? 0,
            };
        case 'quat':
            return {
                ...base,
                keyframes: dumpQuatCurveKeyframes(clip, queryTrackChannels(track)[0].curve),
            };
        case 'object':
            return {
                ...base,
                keyframes: dumpObjectCurveKeyframes(clip, queryTrackChannels(track)[0].curve, descriptor),
            };
        default:
            return null;
    }
}

export function restoreTrackKeyframes(
    clip: AnimationClip,
    track: AnyTrack,
    descriptor: IPropertyTrackDescriptor,
    keyframes: IAnimationCurveKeyDump[],
    channelDumps: IAnimationCurveChannelDump[],
): boolean {
    const sample = getClipSample(clip);
    switch (descriptor.kind) {
        case 'vector':
        case 'color':
        case 'size':
            if (channelDumps.length > 0) {
                const channelMap = new Map(channelDumps.map((channel) => [channel.key, channel]));
                const channels = queryTrackChannels(track);
                for (const [index, key] of (descriptor.partKeys || []).entries()) {
                    assignRealCurveKeyframes(channels[index].curve, sample, channelMap.get(key)?.keyframes || []);
                }
                return true;
            }
            for (const keyframe of keyframes) {
                if (!setTrackKey(track, descriptor, keyframe.frame / sample, keyframe.dump.value, undefined, keyframe)) {
                    return false;
                }
            }
            return true;
        case 'real':
            assignRealCurveKeyframes(queryTrackChannels(track)[0].curve, sample, keyframes);
            return true;
        case 'quat':
            assignQuatCurveKeyframes(queryTrackChannels(track)[0].curve, sample, keyframes);
            return true;
        case 'object':
            assignObjectCurveKeyframes(queryTrackChannels(track)[0].curve, sample, keyframes, descriptor);
            return true;
        default:
            return false;
    }
}

export function setTrackKey(
    track: AnyTrack,
    descriptor: IPropertyTrackDescriptor,
    time: number,
    value: IAnimationValue,
    channel?: string,
    keyData?: IAnimationCurveKeyData,
): boolean {
    const channels = queryTrackChannels(track);
    switch (descriptor.kind) {
        case 'vector':
        case 'color':
        case 'size': {
            const partKeys = descriptor.partKeys || [];
            if (channel) {
                const channelIndex = partKeys.indexOf(channel);
                const channelValue = normalizeNumberValue(value);
                if (channelIndex < 0 || channelValue === null) {
                    return false;
                }
                setCurveKey(channels[channelIndex].curve, time, createRealCurveValue(channelValue, keyData));
                return true;
            }

            const compositeValue = normalizeCompositeValue(value, partKeys);
            if (!compositeValue) {
                return false;
            }
            for (let index = 0; index < partKeys.length; index++) {
                setCurveKey(channels[index].curve, time, createRealCurveValue(compositeValue[partKeys[index]], keyData));
            }
            return true;
        }
        case 'real': {
            const numberValue = normalizeNumberValue(value);
            if (numberValue === null) {
                return false;
            }
            setCurveKey(channels[0].curve, time, createRealCurveValue(numberValue, keyData));
            return true;
        }
        case 'quat': {
            const quatValue = normalizeQuatValue(value);
            if (!quatValue) {
                return false;
            }
            setCurveKey(channels[0].curve, time, createQuatCurveValue(quatValue, keyData));
            return true;
        }
        case 'object': {
            const objectValue = normalizeObjectCurveValue(descriptor, value);
            if (objectValue === undefined) {
                return false;
            }
            setCurveKey(channels[0].curve, time, objectValue);
            return true;
        }
        default:
            return false;
    }
}

export function updateTrackKey(
    track: AnyTrack,
    descriptor: IPropertyTrackDescriptor,
    time: number,
    value: IAnimationValue,
    channel?: string,
    keyData?: IAnimationCurveKeyData,
): boolean {
    const channels = queryTrackChannels(track);
    switch (descriptor.kind) {
        case 'vector':
        case 'color':
        case 'size': {
            const partKeys = descriptor.partKeys || [];
            if (channel) {
                const channelIndex = partKeys.indexOf(channel);
                if (channelIndex < 0) {
                    return false;
                }
                const channelValue = value === undefined ? undefined : normalizeNumberValue(value);
                if (value !== undefined && channelValue === null) {
                    return false;
                }
                return updateRealCurveKey(channels[channelIndex].curve, time, channelValue, keyData);
            }

            const compositeValue = value === undefined ? null : normalizeCompositeValue(value, partKeys);
            if (value !== undefined && !compositeValue) {
                return false;
            }
            for (let index = 0; index < partKeys.length; index++) {
                if (!canUpdateRealCurveKey(channels[index].curve, time, compositeValue?.[partKeys[index]])) {
                    return false;
                }
            }
            for (let index = 0; index < partKeys.length; index++) {
                if (!updateRealCurveKey(channels[index].curve, time, compositeValue?.[partKeys[index]], keyData)) {
                    return false;
                }
            }
            return true;
        }
        case 'real': {
            const numberValue = value === undefined ? undefined : normalizeNumberValue(value);
            if (value !== undefined && numberValue === null) {
                return false;
            }
            return updateRealCurveKey(channels[0].curve, time, numberValue, keyData);
        }
        case 'quat':
            return updateQuatCurveKey(channels[0].curve, time, value, keyData);
        case 'object':
            if (value === undefined) {
                return false;
            }
            {
                const objectValue = normalizeObjectCurveValue(descriptor, value);
                if (objectValue === undefined) {
                    return false;
                }
                setCurveKey(channels[0].curve, time, objectValue);
            }
            return true;
        default:
            return false;
    }
}

export function queryTargetCurves(track: AnyTrack, descriptor: IPropertyTrackDescriptor, channel?: string): AnyCurve[] {
    const channels = queryTrackChannels(track);
    if (!channel || !descriptor.partKeys) {
        return channels.map((item) => item.curve);
    }

    const channelIndex = descriptor.partKeys.indexOf(channel);
    return channelIndex >= 0 ? [channels[channelIndex].curve] : [];
}

export function removeCurveKeys(clip: AnimationClip, curve: AnyCurve, frames: number[]): boolean {
    const sample = getClipSample(clip);
    const before = queryCurveKeyframes(curve);
    const after = before.filter(([time]) => !frames.includes(timeToFrame(time, sample)));
    if (after.length === before.length) {
        return false;
    }
    (curve as any).assignSorted(after);
    return true;
}

export function moveCurveKeys(clip: AnimationClip, curve: AnyCurve, frames: number[], offset: number): boolean {
    const sample = getClipSample(clip);
    let changed = false;
    const keyframes = queryCurveKeyframes(curve).map(([time, value]) => {
        const frame = timeToFrame(time, sample);
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
    (curve as any).assignSorted(keyframes.map((keyframe) => [keyframe.frame / sample, keyframe.value] as [number, any]));
    return true;
}

export function copyCurveKeysTo(clip: AnimationClip, curve: AnyCurve, frames: number[], dstFrame: number): boolean {
    const sample = getClipSample(clip);
    const sortedFrames = [...frames].sort((a, b) => a - b);
    if (sortedFrames.length === 0 || !Number.isFinite(dstFrame)) {
        return false;
    }

    const keyframes = queryCurveKeyframes(curve);
    const baseFrame = sortedFrames[0];
    const copied = keyframes
        .filter(([time]) => sortedFrames.includes(timeToFrame(time, sample)))
        .map(([time, value]) => ({
            frame: Math.max(0, timeToFrame(time, sample) - baseFrame + dstFrame),
            value: cloneValue(value),
        }));
    if (copied.length === 0) {
        return false;
    }

    const copiedFrames = copied.map(keyframe => keyframe.frame);
    const retained = keyframes.filter(([time]) => !copiedFrames.includes(timeToFrame(time, sample)));
    const next = retained.concat(copied.map(keyframe => [keyframe.frame / sample, keyframe.value] as [number, any]));
    next.sort(([leftTime], [rightTime]) => leftTime - rightTime);
    (curve as any).assignSorted(next);
    return true;
}

function dumpCompositeRealTrackChannels(
    clip: AnimationClip,
    track: AnyTrack,
    descriptor: IPropertyTrackDescriptor,
    options: IDumpRealKeyDataOptions,
): IAnimationCurveChannelDump[] {
    const partKeys = descriptor.partKeys || [];
    const channels = queryTrackChannels(track);
    return partKeys.map((key, index) => ({
        key,
        displayName: key,
        type: { value: 'cc.Number' },
        keyframes: dumpRealCurveKeyframes(clip, channels[index].curve, options),
    }));
}

function dumpCompositeRealTrackKeyframes(clip: AnimationClip, track: AnyTrack, descriptor: IPropertyTrackDescriptor): IAnimationCurveKeyDump[] {
    const sample = getClipSample(clip);
    const channels = queryTrackChannels(track);
    const partKeys = descriptor.partKeys || [];
    const times = new Set<number>();
    for (let index = 0; index < partKeys.length; index++) {
        for (const time of queryCurveTimes(channels[index].curve)) {
            times.add(time);
        }
    }

    return Array.from(times)
        .sort((a, b) => a - b)
        .map((time) => ({
            frame: timeToFrame(time, sample),
            dump: {
                value: buildCompositeValue(channels, partKeys, time),
                type: descriptor.type.value,
            },
        }));
}

function dumpRealCurveKeyframes(clip: AnimationClip, curve: AnyCurve, options: IDumpRealKeyDataOptions): IAnimationCurveKeyDump[] {
    const sample = getClipSample(clip);
    return queryCurveKeyframes(curve)
        .sort(([leftTime], [rightTime]) => leftTime - rightTime)
        .map(([time, value]) => {
            const keyData = dumpRealKeyData(value, options);
            const keyframe = {
                frame: timeToFrame(time, sample),
                dump: {
                    value: queryRealCurveNumberValue(value),
                    type: 'cc.Number',
                },
                ...keyData,
            };
            copyRealKeyDataInternalMetadata(keyData, keyframe);
            return keyframe;
        });
}

function dumpQuatCurveKeyframes(clip: AnimationClip, curve: AnyCurve): IAnimationCurveKeyDump[] {
    const sample = getClipSample(clip);
    return queryCurveKeyframes(curve)
        .sort(([leftTime], [rightTime]) => leftTime - rightTime)
        .map(([time, value]) => ({
            frame: timeToFrame(time, sample),
            dump: {
                value: cloneValue(normalizeQuatValue(value.value)),
                type: 'cc.Quat',
            },
            ...dumpQuatKeyData(value),
        }));
}

function dumpObjectCurveKeyframes(clip: AnimationClip, curve: AnyCurve, descriptor: IPropertyTrackDescriptor): IAnimationCurveKeyDump[] {
    const sample = getClipSample(clip);
    return queryCurveKeyframes(curve)
        .sort(([leftTime], [rightTime]) => leftTime - rightTime)
        .map(([time, value]) => ({
            frame: timeToFrame(time, sample),
            dump: {
                value: dumpObjectCurveValue(value, descriptor),
                type: descriptor.type.value,
            },
        }));
}

function assignRealCurveKeyframes(curve: AnyCurve, sample: number, keyframes: IAnimationCurveKeyDump[]): void {
    const sorted = [...keyframes].sort((a, b) => a.frame - b.frame).map((keyframe) => [
        keyframe.frame / sample,
        createRealCurveValue(normalizeNumber(keyframe.dump.value), keyframe),
    ]);
    (curve as any).assignSorted(sorted);
}

function assignQuatCurveKeyframes(curve: AnyCurve, sample: number, keyframes: IAnimationCurveKeyDump[]): void {
    const sorted = [...keyframes].sort((a, b) => a.frame - b.frame).map((keyframe) => [
        keyframe.frame / sample,
        {
            value: normalizeQuatValue(keyframe.dump.value),
            interpolationMode: keyframe.interpMode,
            easingMethod: keyframe.easingMethod,
        },
    ]);
    (curve as any).assignSorted(sorted);
}

function assignObjectCurveKeyframes(curve: AnyCurve, sample: number, keyframes: IAnimationCurveKeyDump[], descriptor: IPropertyTrackDescriptor): void {
    const sorted = [...keyframes].sort((a, b) => a.frame - b.frame).map((keyframe) => [
        keyframe.frame / sample,
        normalizeObjectCurveValue({ ...descriptor, type: { value: keyframe.dump.type || descriptor.type.value } }, keyframe.dump.value),
    ]);
    (curve as any).assignSorted(sorted);
}

function setCurveKey(curve: AnyCurve, time: number, value: unknown): void {
    const keyframes = queryCurveKeyframes(curve)
        .filter(([keyTime]) => !isSameTime(keyTime, time))
        .concat([[time, value] as [number, unknown]]);
    keyframes.sort((a, b) => a[0] - b[0]);
    (curve as any).assignSorted(keyframes);
}

function normalizeObjectCurveValue(descriptor: IPropertyTrackDescriptor, value: IAnimationValue): unknown {
    const assetValue = normalizeAssetCurveValue(descriptor, value);
    if (assetValue === INVALID_ASSET_VALUE) {
        return undefined;
    }
    if (assetValue !== NOT_ASSET_TYPE) {
        return assetValue;
    }
    return cloneValue(value);
}

function dumpObjectCurveValue(value: unknown, descriptor: IPropertyTrackDescriptor): IAnimationValue {
    if (isAssetDescriptor(descriptor) || isAnimationAssetValue(value)) {
        if (value === null || value === undefined) {
            return null;
        }
        if (isAnimationAssetValue(value)) {
            return serializeAnimationAssetValue(value);
        }
        const uuid = queryAnimationAssetUuid(value);
        return uuid ? { uuid } : null;
    }
    return cloneValue(value) as IAnimationValue;
}

const NOT_ASSET_TYPE = Symbol('notAssetType');
const INVALID_ASSET_VALUE = Symbol('invalidAssetValue');

function normalizeAssetCurveValue(descriptor: IPropertyTrackDescriptor, value: IAnimationValue): unknown | typeof NOT_ASSET_TYPE | typeof INVALID_ASSET_VALUE {
    const assetCtor = queryAssetCtor(descriptor);
    if (!assetCtor) {
        return NOT_ASSET_TYPE;
    }
    if (value === null) {
        return null;
    }
    if (value instanceof assetCtor) {
        return value;
    }
    const uuid = queryAnimationAssetUuid(value);
    if (!uuid) {
        return INVALID_ASSET_VALUE;
    }
    return createAnimationAssetPlaceholder(assetCtor, uuid);
}

function isAssetDescriptor(descriptor: IPropertyTrackDescriptor): boolean {
    return Boolean(queryAssetCtor(descriptor));
}

function queryAssetCtor(descriptor: IPropertyTrackDescriptor): (new () => Asset) | null {
    return queryAnimationAssetCtor(descriptor);
}

function updateRealCurveKey(curve: AnyCurve, time: number, value: number | undefined | null, keyData?: IAnimationCurveKeyData): boolean {
    const existed = findRealCurveKey(curve as any, time);
    if (!existed) {
        if (value === undefined || value === null) {
            return false;
        }
        setCurveKey(curve, time, createRealCurveValue(value, keyData));
        return true;
    }

    const currentValue = value ?? queryRealCurveNumberValue(existed[1]);
    setCurveKey(curve, time, createMergedRealCurveValue(currentValue, existed[1], keyData));
    return true;
}

function canUpdateRealCurveKey(curve: AnyCurve, time: number, value: number | undefined | null): boolean {
    return Boolean(findRealCurveKey(curve as any, time)) || (value !== undefined && value !== null);
}

function updateQuatCurveKey(curve: AnyCurve, time: number, value: IAnimationValue, keyData?: IAnimationCurveKeyData): boolean {
    const existed = queryCurveKeyframes(curve).find(([keyTime]) => isSameTime(keyTime, time));
    if (!existed) {
        const quatValue = normalizeQuatValue(value);
        if (!quatValue) {
            return false;
        }
        setCurveKey(curve, time, createQuatCurveValue(quatValue, keyData));
        return true;
    }

    const nextValue = value === undefined ? normalizeQuatValue(existed[1]?.value) : normalizeQuatValue(value);
    if (!nextValue) {
        return false;
    }
    setCurveKey(curve, time, {
        value: nextValue,
        interpolationMode: keyData?.interpMode ?? existed[1]?.interpolationMode,
        easingMethod: keyData?.easingMethod ?? existed[1]?.easingMethod,
    });
    return true;
}

function createQuatCurveValue(value: IAnimationValue, keyData?: IAnimationCurveKeyData): Record<string, unknown> {
    return {
        value,
        interpolationMode: keyData?.interpMode,
        easingMethod: keyData?.easingMethod,
    };
}

function dumpQuatKeyData(value: any): IAnimationCurveKeyData {
    const data: IAnimationCurveKeyData = {};
    setNonDefaultNumber(data, 'interpMode', value.interpolationMode);
    setNonDefaultNumber(data, 'easingMethod', value.easingMethod);
    return data;
}

function setNonDefaultNumber(data: IAnimationCurveKeyData, key: keyof IAnimationCurveKeyData, value: unknown): void {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue !== 0) {
        (data as any)[key] = numberValue;
    }
}

function buildCompositeValue(channels: Array<{ curve: any }>, partKeys: readonly string[], time: number): IAnimationValue {
    const value: Record<string, IAnimationValue> = {};
    for (let index = 0; index < partKeys.length; index++) {
        value[partKeys[index]] = normalizeNumber(channels[index].curve.evaluate(time));
    }
    return value;
}

function normalizeCompositeValue(value: IAnimationValue, partKeys: readonly string[]): Record<string, number> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const result: Record<string, number> = {};
    for (const key of partKeys) {
        const numberValue = Number((value as any)[key]);
        if (!Number.isFinite(numberValue)) {
            return null;
        }
        result[key] = numberValue;
    }
    return result;
}

function normalizeQuatValue(value: unknown): IAnimationValue {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const x = Number((value as any).x);
    const y = Number((value as any).y);
    const z = Number((value as any).z);
    const w = Number((value as any).w);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(w)) {
        return null;
    }
    return { x, y, z, w };
}

function normalizeNumberValue(value: IAnimationValue): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeNumber(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
}

function queryCurveKeyframes(curve: AnyCurve): Array<[number, any]> {
    return Array.from((curve as any).keyframes?.() || []) as Array<[number, any]>;
}

function queryCurveTimes(curve: AnyCurve): number[] {
    return Array.from((curve as any).times?.() || []) as number[];
}

function timeToFrame(time: number, sample: number): number {
    return Math.round(time * sample);
}

function isSameTime(left: number, right: number): boolean {
    return Math.abs(left - right) <= 1e-6;
}
