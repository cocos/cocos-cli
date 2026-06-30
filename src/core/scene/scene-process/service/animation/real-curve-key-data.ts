import { editorExtrasTag } from 'cc';
import type { IAnimationCurveKeyData } from '../../../common';

const EDITOR_EXTRAS_TAG = editorExtrasTag || '__editorExtras__';
const KEY_DATA_KEYS_TAG = 'keyDataKeys';
const EXPLICIT_KEY_DATA_KEYS = Symbol('AnimationRealCurveExplicitKeyDataKeys');
const NUMERIC_KEY_DATA_KEYS: Array<keyof IAnimationCurveKeyData> = [
    'inTangent',
    'outTangent',
    'inTangentWeight',
    'outTangentWeight',
    'interpMode',
    'tangentWeightMode',
    'tangentMode',
    'easingMethod',
];

export interface IDumpRealKeyDataOptions {
    includeDefaults?: boolean;
}

type IInternalAnimationCurveKeyData = IAnimationCurveKeyData & {
    [EXPLICIT_KEY_DATA_KEYS]?: Array<keyof IAnimationCurveKeyData>;
};

export function createRealCurveValue(value: number, keyData?: IAnimationCurveKeyData): number | Record<string, unknown> {
    if (!keyData || !hasRealCurveKeyData(keyData)) {
        return value;
    }
    const curveValue: Record<string, unknown> = {
        value,
        leftTangent: keyData.inTangent,
        rightTangent: keyData.outTangent,
        leftTangentWeight: keyData.inTangentWeight,
        rightTangentWeight: keyData.outTangentWeight,
        interpolationMode: keyData.interpMode,
        tangentWeightMode: keyData.tangentWeightMode,
        easingMethod: keyData.easingMethod,
    };
    const editorExtras = createRealCurveEditorExtras(keyData);
    if (editorExtras) {
        curveValue[EDITOR_EXTRAS_TAG] = editorExtras;
    }
    return curveValue;
}

export function createMergedRealCurveValue(value: number, existed: unknown, keyData?: IAnimationCurveKeyData): number | Record<string, unknown> {
    const existedKeyData = dumpRealKeyData(existed, { includeDefaults: true }) as IInternalAnimationCurveKeyData;
    const explicitKeys = new Set(readMarkedExplicitKeyDataKeys(existedKeyData) || []);
    for (const key of NUMERIC_KEY_DATA_KEYS) {
        const item = keyData?.[key];
        if (item !== undefined && Number.isFinite(Number(item))) {
            explicitKeys.add(key);
        }
    }
    const merged = {
        ...existedKeyData,
        ...keyData,
    } as IInternalAnimationCurveKeyData;
    markExplicitKeyDataKeys(merged, explicitKeys);
    return createRealCurveValue(value, merged);
}

export function dumpRealKeyData(value: any, options: IDumpRealKeyDataOptions = {}): IAnimationCurveKeyData {
    const data: IAnimationCurveKeyData = {};
    const editorExtras = queryRealCurveEditorExtras(value);
    const explicitKeys = queryExplicitKeyDataKeys(editorExtras);
    setKeyDataNumber(data, 'inTangent', value?.leftTangent, explicitKeys, options);
    setKeyDataNumber(data, 'outTangent', value?.rightTangent, explicitKeys, options);
    setKeyDataNumber(data, 'inTangentWeight', value?.leftTangentWeight, explicitKeys, options);
    setKeyDataNumber(data, 'outTangentWeight', value?.rightTangentWeight, explicitKeys, options);
    setKeyDataNumber(data, 'interpMode', value?.interpolationMode, explicitKeys, options);
    setKeyDataNumber(data, 'tangentWeightMode', value?.tangentWeightMode, explicitKeys, options);
    setKeyDataNumber(data, 'easingMethod', value?.easingMethod, explicitKeys, options);
    setKeyDataNumber(data, 'tangentMode', editorExtras?.tangentMode, explicitKeys, options);
    if (typeof editorExtras?.broken === 'boolean') {
        data.broken = editorExtras.broken;
    }
    if (options.includeDefaults) {
        markExplicitKeyDataKeys(data, explicitKeys);
    }
    return data;
}

export function copyRealKeyDataInternalMetadata(source: IAnimationCurveKeyData, target: IAnimationCurveKeyData): void {
    const explicitKeys = readMarkedExplicitKeyDataKeys(source);
    if (explicitKeys) {
        markExplicitKeyDataKeys(target, new Set(explicitKeys));
    }
}

export function queryRealCurveNumberValue(value: any): number {
    return normalizeNumber(value && typeof value === 'object' ? value.value : value);
}

export function queryRealCurveKeyframes(curve: { keyframes(): Iterable<[number, any]> | null | undefined }): Array<[number, any]> {
    return Array.from(curve.keyframes() || []) as Array<[number, any]>;
}

export function findRealCurveKey(curve: { keyframes(): Iterable<[number, any]> }, time: number): [number, any] | undefined {
    return queryRealCurveKeyframes(curve).find(([keyTime]) => isSameTime(keyTime, time));
}

export function setRealCurveKey(curve: { keyframes(): Iterable<[number, any]>; assignSorted(keyframes: Array<[number, unknown]>): void }, time: number, value: unknown): void {
    const keyframes = queryRealCurveKeyframes(curve)
        .filter(([keyTime]) => !isSameTime(keyTime, time))
        .concat([[time, value] as [number, unknown]]);
    keyframes.sort((a, b) => a[0] - b[0]);
    curve.assignSorted(keyframes);
}

export function updateRealCurveKeyData(curve: { keyframes(): Iterable<[number, any]>; assignSorted(keyframes: Array<[number, unknown]>): void }, time: number, keyData?: IAnimationCurveKeyData): boolean {
    const existed = findRealCurveKey(curve, time);
    if (!existed) {
        return false;
    }
    setRealCurveKey(curve, time, createMergedRealCurveValue(queryRealCurveNumberValue(existed[1]), existed[1], keyData));
    return true;
}

export function hasRealCurveKeyData(keyData: IAnimationCurveKeyData): boolean {
    return keyData.inTangent !== undefined
        || keyData.inTangentWeight !== undefined
        || keyData.outTangent !== undefined
        || keyData.outTangentWeight !== undefined
        || keyData.interpMode !== undefined
        || keyData.tangentWeightMode !== undefined
        || keyData.tangentMode !== undefined
        || keyData.easingMethod !== undefined
        || keyData.broken !== undefined;
}

function setKeyDataNumber(
    data: IAnimationCurveKeyData,
    key: keyof IAnimationCurveKeyData,
    value: unknown,
    explicitKeys: Set<keyof IAnimationCurveKeyData>,
    options: IDumpRealKeyDataOptions,
): void {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && (options.includeDefaults || numberValue !== 0 || explicitKeys.has(key))) {
        (data as any)[key] = numberValue;
    }
}

function createRealCurveEditorExtras(keyData: IAnimationCurveKeyData): Record<string, unknown> | null {
    const editorExtras: Record<string, unknown> = {};
    const keyDataKeys = readMarkedExplicitKeyDataKeys(keyData) || queryKeyDataKeys(keyData);
    if (keyDataKeys.length > 0) {
        editorExtras[KEY_DATA_KEYS_TAG] = keyDataKeys;
    }
    if (keyData.tangentMode !== undefined) {
        editorExtras.tangentMode = keyData.tangentMode;
    }
    if (keyData.broken !== undefined) {
        editorExtras.broken = keyData.broken;
    }
    return Object.keys(editorExtras).length > 0 ? editorExtras : null;
}

function queryKeyDataKeys(keyData: IAnimationCurveKeyData): Array<keyof IAnimationCurveKeyData> {
    return NUMERIC_KEY_DATA_KEYS.filter((key) => {
        const value = keyData[key];
        return value !== undefined && Number.isFinite(Number(value));
    });
}

function markExplicitKeyDataKeys(data: IAnimationCurveKeyData, keys: Set<keyof IAnimationCurveKeyData>): void {
    Object.defineProperty(data, EXPLICIT_KEY_DATA_KEYS, {
        value: [...keys],
        enumerable: false,
        configurable: true,
    });
}

function readMarkedExplicitKeyDataKeys(keyData: IAnimationCurveKeyData): Array<keyof IAnimationCurveKeyData> | undefined {
    const keys = (keyData as IInternalAnimationCurveKeyData)[EXPLICIT_KEY_DATA_KEYS];
    return Array.isArray(keys) ? keys : undefined;
}

function queryExplicitKeyDataKeys(editorExtras: any): Set<keyof IAnimationCurveKeyData> {
    const keys = Array.isArray(editorExtras?.[KEY_DATA_KEYS_TAG]) ? editorExtras[KEY_DATA_KEYS_TAG] : [];
    return new Set(keys.filter((key: string): key is keyof IAnimationCurveKeyData => NUMERIC_KEY_DATA_KEYS.includes(key as keyof IAnimationCurveKeyData)));
}

function queryRealCurveEditorExtras(value: unknown): any {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    return (value as any)[EDITOR_EXTRAS_TAG];
}

function normalizeNumber(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
}

function isSameTime(left: number, right: number): boolean {
    return Math.abs(left - right) <= 1e-6;
}
