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

interface IReloadWaiter {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class PrefabSoftReloadScheduler {
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _assetUuids = new Set<string>();
    private _preserveUndoHistory = false;
    private _editorSession: IEditorSessionSnapshot | null = null;
    private _reloadWaiters = new Map<string, Set<IReloadWaiter>>();
    private _idleWaiters = new Set<() => void>();
    private _flushPromise: Promise<void> | null = null;

    constructor(
        private readonly _reloadEditor: ReloadEditor,
        private readonly _emitAssetReload: EmitAssetReload,
        private readonly _getCurrentEditorSession: GetCurrentEditorSession,
        private readonly _debounceMs = PREFAB_SOFT_RELOAD_DEBOUNCE_MS,
        private readonly _waitTimeoutMs = PREFAB_SOFT_RELOAD_WAIT_TIMEOUT_MS,
    ) { }

    schedule(options: IPrefabSoftReloadOptions): void {
        if (options.changedUuid) {
            this._assetUuids.add(options.changedUuid);
        }
        if (options.deletedUuid) {
            this._assetUuids.delete(options.deletedUuid);
        }

        if (this._assetUuids.size > 0) {
            this._preserveUndoHistory ||= !!options.preserveUndoHistory;
        } else {
            this._preserveUndoHistory = false;
        }

        const currentSession = this._getCurrentEditorSession();
        this._editorSession ??= options.editorSession ?? currentSession;

        if (this._timer) {
            clearTimeout(this._timer);
        }
        this._timer = setTimeout(() => {
            void this._flush();
        }, this._debounceMs);
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
        this._assetUuids.clear();
        this._preserveUndoHistory = false;
        this._editorSession = null;
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
        if (!this._timer && !this._flushPromise) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this._idleWaiters.add(resolve);
        });
    }

    private async _flush(): Promise<void> {
        const reloadedUuids = [...this._assetUuids];
        const preserveUndoHistory = this._preserveUndoHistory;
        const session = this._editorSession ?? this._getCurrentEditorSession();

        this._timer = null;
        this._assetUuids.clear();
        this._preserveUndoHistory = false;
        this._editorSession = null;

        this._flushPromise = (async () => {
            const currentSession = this._getCurrentEditorSession();
            if (currentSession.uuid !== session.uuid || currentSession.generation !== session.generation) {
                this._rejectAssetReloadWaiters(reloadedUuids, new Error('Editor session changed before Prefab reload'));
                return;
            }

            const reloadParams = {
                preserveUndoHistory,
                urlOrUUID: session.uuid ?? undefined,
            };
            let result: ReloadResult;
            try {
                result = await this._reloadEditor(reloadParams, session);
            } catch (error) {
                this._rejectAssetReloadWaiters(reloadedUuids, error instanceof Error ? error : new Error(String(error)));
                return;
            }
            if (result !== ReloadResult.SUCCESS) {
                this._rejectAssetReloadWaiters(reloadedUuids, new Error(`Prefab reload failed: ${String(result)}`));
                return;
            }

            const reloadedSession = this._getCurrentEditorSession();
            if (reloadedSession.uuid !== session.uuid || reloadedSession.generation !== session.generation) {
                this._rejectAssetReloadWaiters(reloadedUuids, new Error('Editor session changed during Prefab reload'));
                return;
            }

            reloadedUuids.forEach((uuid) => {
                this._emitAssetReload(uuid);
                this._resolveAssetReloadWaiters(uuid);
            });
        })();

        try {
            await this._flushPromise;
        } finally {
            this._flushPromise = null;
            this._resolveIdleWaitersIfIdle();
        }
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
        if (this._timer || this._flushPromise || this._idleWaiters.size === 0) {
            return;
        }

        const waiters = [...this._idleWaiters];
        this._idleWaiters.clear();
        waiters.forEach((resolve) => resolve());
    }
}
