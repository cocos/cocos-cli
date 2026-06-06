export interface IUndoScope {
    assetUuid?: string;
    assetUrl?: string;
    editorType?: 'scene' | 'prefab' | 'animation' | string;
    mode?: 'general' | 'prefab' | 'animation' | 'preview' | string;
}

export interface IUndoCommandMeta {
    id: string;
    label: string;
    type: string;
    scope: IUndoScope;
    timestamp: number;
}

export interface IUndoRedoResult {
    success: boolean;
    commandId?: string;
    label?: string;
    reason?: string;
}

export interface IUndoCommand {
    meta: IUndoCommandMeta;
    undo(): Promise<IUndoRedoResult>;
    redo(): Promise<IUndoRedoResult>;
}

export interface IUndoGroupOptions {
    label?: string;
}

/** Options for beginRecording. */
export interface IUndoBeginOptions {
    /** Human-readable label shown in undo history UI. */
    label?: string;
    /** Legacy alias kept while existing call sites migrate to label. */
    tag?: string;
    /**
     * Custom undo/redo command with its own undo()/redo() logic.
     * When provided, the default property-snapshot mode is skipped in favor of this command.
     */
    customCommand?: IUndoCommand;
}

export interface IUndoService {
    /**
     * Start recording property snapshots for the given uuids.
     * Returns a commandId to pass to endRecording / cancelRecording.
     */
    beginRecording(uuids: string[], options?: IUndoBeginOptions): string;

    /**
     * Commit the recording identified by commandId onto the undo stack.
     * Triggers dirty:changed if dirty state changed.
     */
    endRecording(commandId: string): Promise<void>;

    /**
     * Discard the recording identified by commandId without pushing to the stack.
     */
    cancelRecording(commandId: string): void;

    /** Undo the most recent command. */
    undo(): Promise<IUndoRedoResult>;

    /** Redo the most recently undone command. */
    redo(): Promise<IUndoRedoResult>;

    beginGroup(options?: IUndoGroupOptions): string;

    endGroup(groupId: string): IUndoRedoResult;

    cancelGroup(groupId: string): IUndoRedoResult;

    isGroupActive(): boolean;

    /** Internal entry for business services to push explicit commands. */
    push(command: IUndoCommand): void;

    /** Clear the entire undo/redo stack. Internal lifecycle API. */
    reset(): void;

    /** Clear the entire undo/redo stack. */
    clearHistory(): void;

    /** Return true when the scene has unsaved changes. */
    isDirty(): boolean;

    /** Return true when there is at least one command available to undo. */
    canUndo(): boolean;

    /** Return true when there is at least one command available to redo. */
    canRedo(): boolean;

    /**
     * Mark the current stack position as the saved baseline.
     * isDirty() returns false immediately after this call.
     */
    markSaved(): void;

    /**
     * Return true when there is an active recording in progress.
     * When uuid is provided, return true only if a recording covers that uuid.
     */
    hasActiveRecording(uuid?: string): boolean;

    /** Return true while undo/redo is applying a command. */
    isApplying(): boolean;
}

export interface IRedoService {
    /** Redo the most recently undone command. */
    redo(): Promise<IUndoRedoResult>;

    /** Return true when there is at least one command available to redo. */
    canRedo(): boolean;
}

/** Public service surface used by external proxy filters. Internal mutation helpers are intentionally omitted. */
export type IPublicUndoService = Omit<
    IUndoService,
    | 'reset'
    | 'push'
    | 'isApplying'
    | 'redo'
    | 'canRedo'
    | 'beginRecording'
    | 'endRecording'
    | 'cancelRecording'
    | 'hasActiveRecording'
>;

/** Public redo namespace used by external proxy filters. */
export type IPublicRedoService = IRedoService;

export interface IUndoEvents {
    'undo:changed': [];
    /** Fires whenever isDirty() flips. Payload is the new dirty value. */
    'dirty:changed': [dirty: boolean];
}
