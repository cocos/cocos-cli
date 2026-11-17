/** Serialized, property-scoped previews. Engine operations are supplied by the owner service. */
export interface PropertyPreviewTarget { uuid: string; path: string; previewId: string }
export interface PropertyPreviewAdapter<T> {
    read(target: PropertyPreviewTarget, hint: T): T | undefined;
    write(target: PropertyPreviewTarget, value: T, restoring: boolean): Promise<boolean>;
    commit(target: PropertyPreviewTarget, before: T, after: T): void;
}
export class PropertyPreviewError extends Error {
    constructor(public readonly code: string) { super(code); this.name = 'PropertyPreviewError'; }
}
export class PropertyPreviewStore<T> {
    private entries = new Map<string, { id: string; before: T; hint: T }>();
    private completed = new Set<string>();
    private pending: Promise<unknown> = Promise.resolve();
    private generation = 0;
    constructor(private readonly adapter: PropertyPreviewAdapter<T>) {}
    private key(target: PropertyPreviewTarget) { return JSON.stringify([target.uuid, target.path]); }
    private identity(target: PropertyPreviewTarget) { return JSON.stringify([target.uuid, target.path, target.previewId]); }
    private validate(target: PropertyPreviewTarget) {
        if (![target.uuid, target.path, target.previewId].every(value => typeof value === 'string' && value.trim())) {
            throw new PropertyPreviewError('INVALID_PREVIEW_TARGET');
        }
        if (!/^[_a-zA-Z][_a-zA-Z0-9]*(?:\.[_a-zA-Z0-9]+)*$/.test(target.path) || /(^|\.)(__proto__|prototype|constructor|uuid|_id|parent|children|_components|__comps__)(\.|$)/.test(target.path)) {
            throw new PropertyPreviewError('UNSUPPORTED_PREVIEW_PROPERTY');
        }
    }
    private run<R>(operation: () => Promise<R>): Promise<R> {
        const generation = this.generation;
        const result = this.pending.then(() => {
            if (generation !== this.generation) throw new PropertyPreviewError('PREVIEW_SCENE_CLOSED');
            return operation();
        });
        this.pending = result.catch(() => undefined);
        return result;
    }
    assertAvailable(uuid: string, path: string) {
        for (const key of this.entries.keys()) {
            const [owner, property] = JSON.parse(key) as [string, string];
            if (owner === uuid && (property === path || property.startsWith(path + '.') || path.startsWith(property + '.'))) {
                throw new PropertyPreviewError('PREVIEW_CONFLICT');
            }
        }
    }
    private entry(target: PropertyPreviewTarget) {
        this.validate(target);
        const entry = this.entries.get(this.key(target));
        if (!entry) this.assertAvailable(target.uuid, target.path);
        if (entry && entry.id !== target.previewId) throw new PropertyPreviewError('PREVIEW_CONFLICT');
        if (this.completed.has(this.identity(target))) throw new PropertyPreviewError('PREVIEW_FINISHED');
        return entry;
    }
    preview(target: PropertyPreviewTarget, value: T): Promise<boolean> {
        return this.run(async () => {
            let entry = this.entry(target);
            if (!entry) {
                const before = this.adapter.read(target, value);
                if (before === undefined) return false;
                entry = { id: target.previewId, before, hint: value };
                this.entries.set(this.key(target), entry);
            }
            const result = await this.adapter.write(target, value, false);
            if (this.entries.get(this.key(target)) !== entry) throw new PropertyPreviewError('PREVIEW_SCENE_CLOSED');
            if (result) entry.hint = value;
            return result;
        });
    }
    cancel(target: PropertyPreviewTarget): Promise<boolean> {
        return this.run(async () => {
            const entry = this.entry(target);
            if (!entry) return false;
            if (!await this.adapter.write(target, entry.before, true)) return false;
            if (this.entries.get(this.key(target)) !== entry) throw new PropertyPreviewError('PREVIEW_SCENE_CLOSED');
            this.finish(target);
            return true;
        });
    }
    commit(target: PropertyPreviewTarget): Promise<boolean> {
        return this.run(async () => {
            const entry = this.entry(target);
            if (!entry) return false;
            const after = this.adapter.read(target, entry.hint);
            if (after === undefined) return false;
            this.adapter.commit(target, entry.before, after);
            this.finish(target);
            return true;
        });
    }
    private finish(target: PropertyPreviewTarget) {
        this.entries.delete(this.key(target));
        this.completed.add(this.identity(target));
    }
    clear() { this.generation++; this.entries.clear(); this.completed.clear(); }
}
