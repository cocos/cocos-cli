import type { IReloadOptions } from '../../../common';

export const PREFAB_SOFT_RELOAD_DEBOUNCE_MS = 500;
export const PREFAB_SOFT_RELOAD_WAIT_TIMEOUT_MS = 10000;

export interface IPrefabSoftReloadOptions {
    changedUuid?: string;
    deletedUuid?: string;
    preserveUndoHistory?: boolean;
    editorUuid?: string | null;
}

type ReloadEditor = (params: IReloadOptions) => Promise<unknown> | unknown;
type EmitAssetReload = (uuid: string) => void;
type GetCurrentEditorUuid = () => string | null;

interface IReloadWaiter {
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
}

export class PrefabSoftReloadScheduler {
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _assetUuids = new Set<string>();
    private _preserveUndoHistory = false;
    private _editorUuid: string | null = null;
    private _reloadWaiters = new Map<string, Set<IReloadWaiter>>();
    private _idleWaiters = new Set<() => void>();
    private _flushPromise: Promise<void> | null = null;

    constructor(
        private readonly _reloadEditor: ReloadEditor,
        private readonly _emitAssetReload: EmitAssetReload,
        private readonly _getCurrentEditorUuid: GetCurrentEditorUuid,
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

        this._editorUuid ??= options.editorUuid ?? this._getCurrentEditorUuid();

        if (this._timer) {
            clearTimeout(this._timer);
        }
        this._timer = setTimeout(() => {
            void this._flush();
        }, this._debounceMs);
    }

    waitForAssetReload(uuid: string): { promise: Promise<void>; cancel: () => void } {
        let waiter: IReloadWaiter | null = null;
        const promise = new Promise<void>((resolve) => {
            waiter = {
                resolve,
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
        const editorUuid = this._editorUuid;

        this._timer = null;
        this._assetUuids.clear();
        this._preserveUndoHistory = false;
        this._editorUuid = null;

        this._flushPromise = (async () => {
            await this._reloadEditor({
                preserveUndoHistory,
                urlOrUUID: editorUuid ?? undefined,
            });

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
