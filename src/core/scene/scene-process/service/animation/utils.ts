import type { AnimationClip } from 'cc';

export function cloneDump<T>(dump: T): T {
    return JSON.parse(JSON.stringify(dump)) as T;
}

export function cloneValue<T>(value: T): T {
    if (value === null || value === undefined) {
        return value;
    }
    if (typeof value !== 'object') {
        return value;
    }
    return cloneDump(value);
}

export function clipUuid(clip: AnimationClip | null | undefined): string {
    return ((clip as any)?._uuid || (clip as any)?.uuid || '') as string;
}

export function getClipSample(clip: AnimationClip): number {
    const sample = Number((clip as any).sample);
    return Number.isFinite(sample) && sample > 0 ? sample : 1;
}

export function queryClipEvents(clip: AnimationClip): any[] | null {
    const events = (clip as any).events;
    return Array.isArray(events) ? events : null;
}

export function ensureClipEvents(clip: AnimationClip): any[] {
    if (!Array.isArray((clip as any).events)) {
        (clip as any).events = [];
    }
    return (clip as any).events;
}

export function normalizeFrames(value: unknown): number[] {
    const values = Array.isArray(value) ? value : [value];
    return values
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item))
        .map((item) => Math.round(item));
}

export function updateClipEventData(clip: AnimationClip): void {
    if (typeof (clip as any).updateEventDatas === 'function') {
        (clip as any).updateEventDatas();
    }
}

export function normalizeAuxiliaryCurveValue(value: unknown): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
}
