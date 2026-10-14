/** Identity of one working copy. Versions are meaningful only within this identity. */
export interface IPrefabRuntimeIdentity {
    runtimeId: string;
    generation: number;
}

/** Host-issued registration. Never reuse it after close, disconnect or Host reset. */
export interface IPrefabRuntimeRegistration extends IPrefabRuntimeIdentity {
    registrationId: string;
}

export interface IRegisterPrefabRuntimeOptions {
    runtime: IPrefabRuntimeIdentity;
    /** The resource edited by a Prefab tab; omit for an ordinary Scene with instances. */
    prefabUuid?: string;
    /** Non-negative safe integer; save and undo must not rewind this counter. */
    editVersion: number;
    /** An unavailable working copy is never assumed to be clean. */
    state: { status: 'ready'; dirty: boolean } | { status: 'unavailable' };
}

export interface IBeginPrefabEditOptions {
    registration: IPrefabRuntimeRegistration;
    expectedEditVersion: number;
}

/** Reserve before mutating, including Inspector recording and gizmo edits. */
export interface IPrefabEditLease {
    registration: IPrefabRuntimeRegistration;
    editId: string;
    editVersion: number;
}

export interface IFinishPrefabEditOptions {
    lease: IPrefabEditLease;
    /** Authoritative Undo state after the edit/save/discard, not inferred from events. */
    dirty: boolean;
}

export interface IPrefabWorkingCopyState {
    registration: IPrefabRuntimeRegistration;
    prefabUuid?: string;
    editVersion: number;
    status: 'ready' | 'editing' | 'unavailable';
    dirty: boolean | null;
}

export interface IPrefabSourceSnapshot {
    assetUuid: string;
    content: string;
    /** SHA-256 of the actual source bytes; stored in memory, never in asset metadata. */
    fingerprint: string;
}

export interface ICommitPrefabWriteOptions {
    /** Must remain held until the caller has reconciled its working copy. */
    source: IPrefabEditLease;
    assetUuid: string;
    /** Fingerprint of the source version actually loaded by the caller. */
    expectedFingerprint: string;
    content: string;
}

/** Durable source publication completed; working-copy synchronization is a later operation. */
export interface IPrefabWriteReceipt {
    commitId: string;
    source: IPrefabRuntimeRegistration;
    before: IPrefabSourceSnapshot;
    after: IPrefabSourceSnapshot;
}

const PREFAB_WRITE_ERROR_CODES = [
    'PREFAB_DOCUMENT_DIRTY',
    'PREFAB_SOURCE_CHANGED',
    'PREFAB_SESSION_CHANGED',
    'PREFAB_BUSY',
    'PREFAB_INVALID_REQUEST',
    'PREFAB_SOURCE_UNAVAILABLE',
    'PREFAB_WRITE_FAILED',
] as const;

export type PrefabWriteErrorCode = (typeof PREFAB_WRITE_ERROR_CODES)[number];

const PREFAB_WRITE_COMMIT_STATES = ['not-committed', 'unknown', 'committed'] as const;

export type PrefabWriteCommitState = (typeof PREFAB_WRITE_COMMIT_STATES)[number];

const prefabWriteErrorCodes: ReadonlySet<string> = new Set(PREFAB_WRITE_ERROR_CODES);
const prefabWriteCommitStates: ReadonlySet<string> = new Set(PREFAB_WRITE_COMMIT_STATES);

export interface IPrefabWriteError {
    code: PrefabWriteErrorCode;
    message: string;
    /** A failed write/import can have changed the file. Never blindly retry an uncertain write. */
    commitState: PrefabWriteCommitState;
    assetUuid?: string;
    runtime?: IPrefabRuntimeIdentity;
}

/** Preserve domain errors through existing RPC transports that otherwise flatten Error fields. */
export type PrefabWriteResult<T> =
    | {
          ok: true;
          value: T;
      }
    | {
          ok: false;
          error: IPrefabWriteError;
      };

/** Recognize the complete error structure across local errors and RPC payloads. */
export function isPrefabWriteError(error: unknown): error is IPrefabWriteError {
    if (!error || typeof error !== 'object' || Array.isArray(error)) {
        return false;
    }
    const value = error as Record<string, unknown>;
    if (
        typeof value.code !== 'string' ||
        !prefabWriteErrorCodes.has(value.code) ||
        typeof value.message !== 'string' ||
        typeof value.commitState !== 'string' ||
        !prefabWriteCommitStates.has(value.commitState) ||
        (value.assetUuid !== undefined && typeof value.assetUuid !== 'string')
    ) {
        return false;
    }
    if (value.runtime === undefined) return true;
    if (!value.runtime || typeof value.runtime !== 'object' || Array.isArray(value.runtime)) return false;
    const runtime = value.runtime as Record<string, unknown>;
    return (
        typeof runtime.runtimeId === 'string' && runtime.runtimeId.length > 0 &&
        typeof runtime.generation === 'number' && Number.isSafeInteger(runtime.generation) && runtime.generation >= 0
    );
}

/** Only transport the documented conflict fields, never arbitrary Error properties. */
export function serializePrefabWriteError(error: unknown): IPrefabWriteError | undefined {
    if (!isPrefabWriteError(error)) return undefined;
    return {
        code: error.code,
        message: error.message,
        commitState: error.commitState,
        assetUuid: error.assetUuid,
        runtime: error.runtime
            ? { runtimeId: error.runtime.runtimeId, generation: error.runtime.generation }
            : undefined,
    };
}

/** Internal Host Interface shared by Webview and worker runtimes; not an MCP tool. */
export interface IPrefabWriteHost {
    registerRuntime(options: IRegisterPrefabRuntimeOptions): Promise<PrefabWriteResult<IPrefabRuntimeRegistration>>;
    queryRuntime(registration: IPrefabRuntimeRegistration): Promise<PrefabWriteResult<IPrefabWorkingCopyState>>;
    beginEdit(options: IBeginPrefabEditOptions): Promise<PrefabWriteResult<IPrefabEditLease>>;
    finishEdit(options: IFinishPrefabEditOptions): Promise<PrefabWriteResult<null>>;
    markRuntimeUnavailable(registration: IPrefabRuntimeRegistration): Promise<PrefabWriteResult<null>>;
    /**
     * Only after confirmed local closure. A missing or superseded ownership token is
     * already closed; retrying must never unregister its replacement. Lost contact
     * with a still-open working copy must use markRuntimeUnavailable instead.
     */
    unregisterRuntime(registration: IPrefabRuntimeRegistration): Promise<PrefabWriteResult<null>>;
    readSource(assetUuid: string): Promise<PrefabWriteResult<IPrefabSourceSnapshot>>;
    commit(options: ICommitPrefabWriteOptions): Promise<PrefabWriteResult<IPrefabWriteReceipt>>;
}
