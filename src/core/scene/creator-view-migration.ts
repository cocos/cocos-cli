import path from 'path';
import fse from 'fs-extra';
import type { IBaseConfiguration } from '../configuration';

const migrationKey = 'creatorViewMigrationVersion';
const isRecord = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

function fillMissing(current: Record<string, any>, incoming: Record<string, any>): Record<string, any> {
    const result = { ...current };
    for (const [key, value] of Object.entries(incoming)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = value;
        else if (isRecord(result[key]) && isRecord(value)) result[key] = fillMissing(result[key], value);
    }
    return result;
}

/** Import personal Creator view state once, including projects already opened in CLI. */
export async function migrateCreatorSceneView(config: IBaseConfiguration, localConfigPath: string): Promise<void> {
    const current = config.getAll('local') || {};
    if (current[migrationKey] >= 1 || !localConfigPath) return;
    const source = path.join(path.dirname(localConfigPath), 'v2', 'packages', 'scene.json');
    if (!await fse.pathExists(source)) return;
    const legacy = await fse.readJSON(source);
    if (!isRecord(legacy)) return;

    const incoming: Record<string, any> = {};
    const defaults = config.getDefaultConfig() || {};
    for (const [target, sourceKey] of [['camera', 'camera'], ['gizmo', 'gizmos-infos']]) {
        if (!isRecord(legacy[sourceKey])) continue;
        incoming[target] = {};
        const keys = target === 'camera'
            ? [...Object.keys(defaults.camera || {}), 'far2D', 'near2D', 'wheelSpeed2D']
            : Object.keys(defaults.gizmo || {});
        for (const key of keys) {
            if (legacy[sourceKey][key] !== undefined) incoming[target][key] = legacy[sourceKey][key];
        }
    }
    for (const key of ['originAxis2D', 'originAxis3D']) {
        const axes = incoming.gizmo?.[key];
        if (isRecord(axes)) {
            incoming.gizmo[key] = {};
            for (const axis of ['x', 'y', 'z']) {
                if (typeof axes[`${axis}_visible`] === 'boolean') incoming.gizmo[key][axis] = axes[`${axis}_visible`];
            }
        }
    }
    for (const [target, sourceKey] of [['snapConfigs', 'snap-configs'], ['rectSnapConfig', 'rect-snap-configs']]) {
        if (isRecord(legacy[sourceKey])) {
            incoming.gizmo ??= {};
            incoming.gizmo[target] = legacy[sourceKey];
        }
    }
    for (const key of ['camera', 'gizmo']) {
        if (incoming[key]) await config.set(key, fillMissing(current[key] || {}, incoming[key]), 'local');
    }

    if (isRecord(legacy['camera-infos'])) {
        // A CLI view record is authoritative as a whole; do not mix two camera poses.
        const views = { ...legacy['camera-infos'], ...current['camera-infos'] };
        const currentIds = Array.isArray(current['camera-uuids']) ? current['camera-uuids'] : [];
        const ids = [...new Set([
            ...(Array.isArray(legacy['camera-uuids']) ? legacy['camera-uuids'] : []),
            ...Object.keys(views),
        ].filter(id => !currentIds.includes(id)).concat(currentIds))]
            .filter(id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(views, id));
        await config.set('camera-infos', views, 'local');
        await config.set('camera-uuids', ids, 'local');
    }
    await config.set(migrationKey, 1, 'local');
}
