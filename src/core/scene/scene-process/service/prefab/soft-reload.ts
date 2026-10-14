import { ReloadResult } from '../../../common';
import type { IReloadOptions } from '../../../common';
import type { IEditorSessionSnapshot } from '../core/editor-session';

export const PREFAB_SOFT_RELOAD_DEBOUNCE_MS = 500;
export const PREFAB_SOFT_RELOAD_WAIT_TIMEOUT_MS = 10000;

export interface IPrefabSoftReloadOptions {
    changedUuid?: string;
    deletedUuid?: string;
    preserveUndoHistory?: boolean;
    editorSession?: IEditorSessionSnapshot;
}

type ReloadEditor = (params: IReloadOptions, session?: IEditorSessionSnapshot) => Promise<ReloadResult>;
type EmitAssetReload = (uuid: string) => void;
type GetCurrentEditorSession = () => IEditorSessionSnapshot;

interface IReloadBatch {
    assetUuids: Set<string>;
    deletedUuids: Set<string>;
    preserveUndoHistory: boolean;
    session: IEditorSessionSnapshot;
}

/** Returns true only when retry has been registered for a temporary edit conflict. */
type RetryWhenIdle = (error: unknown, retry: () => void) => boolean;

interface IReloadWaiter {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class PrefabSoftReloadScheduler {
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _pending: IReloadBatch | null = null;
    private _retryToken: object | null = null;
    private _epoch = 0;
    private _reloadWaiters = new Map<string, Set<IReloadWaiter>>();
    private _idleWaiters = new Set<() => void>();
    private _flushPromise: Promise<void> | null = null;

    constructor(
        private readonly _reloadEditor: ReloadEditor,
        private readonly _emitAssetReload: EmitAssetReload,
        private readonly _getCurrentEditorSession: GetCurrentEditorSession,
        private readonly _debounceMs = PREFAB_SOFT_RELOAD_DEBOUNCE_MS,
        private readonly _waitTimeoutMs = PREFAB_SOFT_RELOAD_WAIT_TIMEOUT_MS,
        private readonly _retryWhenIdle?: RetryWhenIdle,
    ) { }

    schedule(options: IPrefabSoftReloadOptions): void {
        const session = options.editorSession ?? this._getCurrentEditorSession();
        if (this._pending && !this._sameSession(this._pending.session, session)) this.invalidate();
        const batch = this._pending ??= {
            assetUuids: new Set(), deletedUuids: new Set(), preserveUndoHistory: false, session: { ...session },
        };
        if (options.changedUuid) {
            batch.assetUuids.add(options.changedUuid);
            batch.deletedUuids.delete(options.changedUuid);
        }
        if (options.deletedUuid) {
            batch.assetUuids.delete(options.deletedUuid);
            batch.deletedUuids.add(options.deletedUuid);
        }
        batch.preserveUndoHistory = batch.assetUuids.size > 0
            && (batch.preserveUndoHistory || !!options.preserveUndoHistory);
        this._scheduleFlush();
    }

    private _scheduleFlush(): void {
        if (!this._pending || this._flushPromise || this._retryToken) return;
        if (this._timer) clearTimeout(this._timer);
        this._timer = setTimeout(() => { void this._flush(); }, this._debounceMs);
    }

    waitForAssetReload(uuid: string): { promise: Promise<void>; cancel: () => void } {
        let waiter: IReloadWaiter | null = null;
        const promise = new Promise<void>((resolve, reject) => {
            waiter = {
                resolve,
                reject,
                timer: setTimeout(() => {
                    this._resolveAssetReloadWaiter(uuid, waiter);
                }, this._waitTimeoutMs),
            };
            let waiters = this._reloadWaiters.get(uuid);
            if (!waiters) {
                waiters = new Set();
                this._reloadWaiters.set(uuid, waiters);
            }
            waiters.add(waiter);
        });

        return {
            promise,
            cancel: () => {
                if (waiter) {
                    this._removeAssetReloadWaiter(uuid, waiter);
                }
            },
        };
    }

    invalidate(reason = 'Editor session changed'): void {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._epoch++;
        this._pending = null;
        this._retryToken = null;
        const error = new Error(reason);
        for (const waiters of this._reloadWaiters.values()) {
            waiters.forEach(waiter => {
                clearTimeout(waiter.timer);
                waiter.reject(error);
            });
        }
        this._reloadWaiters.clear();
        this._resolveIdleWaitersIfIdle();
    }

    waitForIdle(): Promise<void> {
        if (!this._pending && !this._timer && !this._flushPromise) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this._idleWaiters.add(resolve);
        });
    }

    private async _flush(): Promise<void> {
        this._timer = null;
        if (this._flushPromise || this._retryToken || !this._pending) return;
        const batch = this._pending;
        const epoch = this._epoch;
        this._pending = null;
        // Publish the running promise before invoking callbacks that may schedule more work.
        this._flushPromise = Promise.resolve().then(() => this._reloadBatch(batch, epoch));
        try {
            await this._flushPromise;
        } finally {
            this._flushPromise = null;
            this._scheduleFlush();
            this._resolveIdleWaitersIfIdle();
        }
    }

    private async _reloadBatch(batch: IReloadBatch, epoch: number): Promise<void> {
        const uuids = [...batch.assetUuids];
        if (epoch !== this._epoch) return;
        if (!this._sameSession(batch.session, this._getCurrentEditorSession())) {
            this._rejectAssetReloadWaiters(uuids, new Error('Editor session changed before Prefab reload'));
            return;
        }
        let result: ReloadResult;
        try {
            result = await this._reloadEditor({
                preserveUndoHistory: batch.preserveUndoHistory,
                urlOrUUID: batch.session.uuid ?? undefined,
            }, batch.session);
        } catch (error) {
            if (epoch !== this._epoch) return;
            if (this._sameSession(batch.session, this._getCurrentEditorSession())
                && this._deferUntilIdle(batch, error)) return;
            this._rejectAssetReloadWaiters(uuids, error instanceof Error ? error : new Error(String(error)));
            return;
        }
        if (result !== ReloadResult.SUCCESS) {
            this._rejectAssetReloadWaiters(uuids, new Error(`Prefab reload failed: ${String(result)}`));
            return;
        }
        if (epoch !== this._epoch) return;
        if (!this._sameSession(batch.session, this._getCurrentEditorSession())) {
            this._rejectAssetReloadWaiters(uuids, new Error('Editor session changed during Prefab reload'));
            return;
        }
        uuids.forEach(uuid => {
            if (this._pending?.deletedUuids.has(uuid)) return;
            this._emitAssetReload(uuid);
            this._resolveAssetReloadWaiters(uuid);
        });
    }

    private _deferUntilIdle(batch: IReloadBatch, error: unknown): boolean {
        if (!this._retryWhenIdle) return false;
        const pending = this._pending;
        if (pending && !this._sameSession(batch.session, pending.session)) return false;
        // Preserve the failed batch while incorporating notifications received during its attempt.
        const assetUuids = new Set(batch.assetUuids);
        pending?.deletedUuids.forEach(uuid => assetUuids.delete(uuid));
        pending?.assetUuids.forEach(uuid => assetUuids.add(uuid));
        const token = {};
        this._retryToken = token;
        this._pending = {
            assetUuids,
            deletedUuids: new Set([...(batch.deletedUuids), ...(pending?.deletedUuids ?? [])]),
            preserveUndoHistory: assetUuids.size > 0 && (batch.preserveUndoHistory || !!pending?.preserveUndoHistory),
            session: batch.session,
        };
        if (this._retryWhenIdle(error, () => {
            if (this._retryToken !== token) return;
            this._retryToken = null;
            this._scheduleFlush();
        })) return true;
        this._retryToken = null;
        this._pending = pending;
        return false;
    }

    private _sameSession(left: IEditorSessionSnapshot, right: IEditorSessionSnapshot): boolean {
        return left.uuid === right.uuid && left.generation === right.generation;
    }

    private _rejectAssetReloadWaiters(uuids: string[], error: Error): void {
        uuids.forEach(uuid => {
            const waiters = this._reloadWaiters.get(uuid);
            if (!waiters) {
                return;
            }
            this._reloadWaiters.delete(uuid);
            waiters.forEach(waiter => {
                clearTimeout(waiter.timer);
                waiter.reject(error);
            });
        });
    }

    private _resolveAssetReloadWaiters(uuid: string): void {
        const waiters = this._reloadWaiters.get(uuid);
        if (!waiters) {
            return;
        }

        this._reloadWaiters.delete(uuid);
        waiters.forEach((waiter) => {
            clearTimeout(waiter.timer);
            waiter.resolve();
        });
    }

    private _resolveAssetReloadWaiter(uuid: string, waiter: IReloadWaiter | null): void {
        if (!waiter || !this._removeAssetReloadWaiter(uuid, waiter)) {
            return;
        }
        waiter.resolve();
    }

    private _removeAssetReloadWaiter(uuid: string, waiter: IReloadWaiter): boolean {
        const waiters = this._reloadWaiters.get(uuid);
        if (!waiters?.delete(waiter)) {
            return false;
        }
        clearTimeout(waiter.timer);
        if (waiters.size === 0) {
            this._reloadWaiters.delete(uuid);
        }
        return true;
    }

    private _resolveIdleWaitersIfIdle(): void {
        if (this._pending || this._timer || this._flushPromise || this._idleWaiters.size === 0) {
            return;
        }

        const waiters = [...this._idleWaiters];
        this._idleWaiters.clear();
        waiters.forEach((resolve) => resolve());
    }
}
