/** Scene-local Clear epochs and deleted asset barriers; no persistent or global Undo state. */
export class DeletedLightmapAssets {
    private readonly scenes = new WeakMap<object, Set<string>>();
    private readonly epochs = new WeakMap<object, { value: number }>();
    private readonly snapshots = new WeakMap<object, number>();
    private readonly replacements = new WeakMap<object, Set<object>>();

    constructor(private readonly normalize: (uuid: string) => string = rootLightmapAssetUuid) {}

    /** A soft reload replaces the Scene but can retain its Undo history. */
    transfer(scene: object, replacement: object): void {
        const blocked = this.scenes.get(scene);
        if (blocked) this.scenes.set(replacement, blocked);
        const epoch = this.epochs.get(scene);
        if (epoch) this.epochs.set(replacement, epoch);
    }

    /** Tag the actual history object, without adding fields to scene or asset serialization. */
    capture<T>(scene: object | null | undefined, snapshot: T): T {
        if (scene && snapshot && typeof snapshot === 'object') {
            this.snapshots.set(snapshot, this.epochs.get(scene)?.value ?? 0);
            this.replacements.get(scene)?.add(snapshot);
        }
        return snapshot;
    }

    /** Clear invalidates all older Lightmap results, not ordinary edits or probe coefficients. */
    clearResults(scene: object): void {
        const epoch = this.epochs.get(scene) ?? { value: 0 };
        epoch.value++;
        this.epochs.set(scene, epoch);
    }

    /** Start after the Bake's before snapshot. Commit only after recording/save succeeds. */
    beginReplacement(scene: object): { commit(): void; cancel(): void } {
        if (this.replacements.has(scene)) throw new Error('A Lightmap result replacement is already being recorded.');
        const captured = new Set<object>();
        this.replacements.set(scene, captured);
        let active = true;
        const cancel = (): void => {
            if (!active) return;
            active = false;
            this.replacements.delete(scene);
            captured.clear();
        };
        return {
            commit: () => {
                if (!active) return;
                this.clearResults(scene);
                const epoch = this.epochs.get(scene)!.value;
                // The completed Bake can Redo its current result; earlier snapshots cannot
                // revive replaced results, even when external references kept their pixels.
                for (const snapshot of captured) this.snapshots.set(snapshot, epoch);
                cancel();
            },
            cancel,
        };
    }

    /** Protect in-flight deletes too; an unconfirmed response must not revive possibly deleted assets. */
    begin(scene: object, uuids: readonly string[]): (deleted: readonly string[]) => void {
        const blocked = this.scenes.get(scene) ?? new Set<string>();
        this.scenes.set(scene, blocked);
        const added = uuids.map(this.normalize).filter(uuid => !blocked.has(uuid));
        added.forEach(uuid => blocked.add(uuid));
        return deleted => {
            const confirmed = new Set(deleted.map(this.normalize));
            added.forEach(uuid => { if (!confirmed.has(uuid)) blocked.delete(uuid); });
            if (blocked.size === 0) this.scenes.delete(scene);
        };
    }

    /** Copy on write: clear stale baked fields and deleted references, preserving unrelated history. */
    filter<T>(scene: object | null | undefined, snapshot: T, format: 'dump' | 'serialized', history: object = snapshot as object): T {
        const blocked = scene && this.scenes.get(scene);
        const stale = (this.snapshots.get(history) ?? 0) < (scene ? this.epochs.get(scene)?.value ?? 0 : 0);
        if (!blocked?.size && !stale) return snapshot;
        const isBlocked = (uuid: unknown): boolean => typeof uuid === 'string' && !!blocked?.has(this.normalize(uuid));
        const visit = (value: unknown): unknown => {
            if (!value || typeof value !== 'object') return value;
            if (Array.isArray(value)) {
                const items = value.map(visit);
                return items.some((item, i) => item !== value[i]) ? items : value;
            }
            const record = value as Record<string, any>;
            if (format === 'serialized' && isBlocked(record.__uuid__)) return null;
            if (format === 'dump' && typeof record.type === 'string' && isBlocked(record.value?.uuid)) {
                return { ...record, value: { ...record.value, uuid: '' } };
            }
            let result = record;
            for (const [key, child] of Object.entries(record)) {
                const filtered = visit(child);
                if (filtered !== child) {
                    if (result === record) result = { ...record };
                    result[key] = filtered;
                }
            }
            const type = format === 'dump' ? record.type : record.__type__;
            const fields = format === 'dump' ? record.value : record;
            const textureUuid = format === 'dump' ? fields?.texture?.value?.uuid : fields?.texture?.__uuid__;
            if ((type === 'cc.ModelBakeSettings' || type === 'cc.TerrainBlockLightmapInfo') && (stale || isBlocked(textureUuid))) {
                const cleared = { ...(format === 'dump' ? result.value : result) };
                if (cleared.texture) {
                    cleared.texture = format === 'dump'
                        ? { ...cleared.texture, value: { ...cleared.texture.value, uuid: '' } } : null;
                }
                if (type === 'cc.ModelBakeSettings' && cleared.uvParam) {
                    cleared.uvParam = format === 'dump'
                        ? { ...cleared.uvParam, value: { ...cleared.uvParam.value, x: 0, y: 0, z: 0, w: 0 } }
                        : { ...cleared.uvParam, x: 0, y: 0, z: 0, w: 0 };
                } else if (type === 'cc.TerrainBlockLightmapInfo') {
                    for (const key of ['UOff', 'VOff', 'UScale', 'VScale']) {
                        if (key in cleared) cleared[key] = format === 'dump' ? { ...cleared[key], value: 0 } : 0;
                    }
                }
                result = format === 'dump' ? { ...result, value: cleared } : cleared;
            }
            if (stale && type === 'cc.SceneGlobals') {
                const cleared = { ...(format === 'dump' ? result.value : result) };
                for (const key of ['bakedWithHighpLightmap', 'bakedWithStationaryMainLight']) {
                    if (key in cleared) cleared[key] = format === 'dump' ? { ...cleared[key], value: false } : false;
                }
                result = format === 'dump' ? { ...result, value: cleared } : cleared;
            }
            return result;
        };
        return visit(snapshot) as T;
    }
}

export function rootLightmapAssetUuid(uuid: string): string {
    const root = uuid.split('@', 1)[0];
    const decompress = (globalThis as any).EditorExtends?.UuidUtils?.decompressUUID;
    return typeof decompress === 'function' ? decompress(root) : root;
}

export const deletedLightmapAssets = new DeletedLightmapAssets();
