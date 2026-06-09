import type { IReloadOptions } from '../../../common';

export const PREFAB_SOFT_RELOAD_DEBOUNCE_MS = 500;

export interface IPrefabSoftReloadOptions {
    changedUuid?: string;
    deletedUuid?: string;
    preserveUndoHistory?: boolean;
    editorUuid?: string | null;
}

type ReloadEditor = (params: IReloadOptions) => Promise<unknown> | unknown;
type EmitAssetReload = (uuid: string) => void;
type GetCurrentEditorUuid = () => string | null;

export class PrefabSoftReloadScheduler {
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _assetUuids = new Set<string>();
    private _preserveUndoHistory = false;
    private _editorUuid: string | null = null;

    constructor(
        private readonly _reloadEditor: ReloadEditor,
        private readonly _emitAssetReload: EmitAssetReload,
        private readonly _getCurrentEditorUuid: GetCurrentEditorUuid,
        private readonly _debounceMs = PREFAB_SOFT_RELOAD_DEBOUNCE_MS,
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

    private async _flush(): Promise<void> {
        const reloadedUuids = [...this._assetUuids];
        const preserveUndoHistory = this._preserveUndoHistory;
        const editorUuid = this._editorUuid;

        this._timer = null;
        this._assetUuids.clear();
        this._preserveUndoHistory = false;
        this._editorUuid = null;

        await this._reloadEditor({
            preserveUndoHistory,
            urlOrUUID: editorUuid ?? undefined,
        });

        reloadedUuids.forEach((uuid) => {
            this._emitAssetReload(uuid);
        });
    }
}
