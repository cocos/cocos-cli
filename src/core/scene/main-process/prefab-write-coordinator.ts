import { createHash, randomUUID } from 'crypto';
import type {
    IBeginPrefabEditOptions,
    ICommitPrefabWriteOptions,
    IFinishPrefabEditOptions,
    IPrefabEditLease,
    IPrefabRuntimeIdentity,
    IPrefabRuntimeRegistration,
    IPrefabSourceSnapshot,
    IPrefabWorkingCopyState,
    IPrefabWriteError,
    IPrefabWriteReceipt,
    IRegisterPrefabRuntimeOptions,
    PrefabWriteErrorCode,
} from '../common/prefab-write';

/** Production uses Asset DB + disk; tests use a controllable source store at the same Seam. */
export interface IPrefabSourceStore {
    read(assetUuid: string): Promise<Buffer>;
    /** Resolves after persistence and import. Rejection does not imply rollback. */
    write(assetUuid: string, content: string): Promise<void>;
}

export class PrefabWriteError extends Error implements IPrefabWriteError {
    readonly runtime?: IPrefabRuntimeIdentity;

    constructor(
        readonly code: PrefabWriteErrorCode,
        message: string,
        readonly commitState: IPrefabWriteError['commitState'] = 'not-committed',
        readonly assetUuid?: string,
        runtime?: IPrefabRuntimeIdentity,
    ) {
        super(message);
        this.name = 'PrefabWriteError';
        this.runtime = runtime ? { runtimeId: runtime.runtimeId, generation: runtime.generation } : undefined;
    }
}

interface RuntimeRecord {
    registration: IPrefabRuntimeRegistration;
    prefabUuid?: string;
    editVersion: number;
    dirty: boolean | null;
    available: boolean;
    editId?: string;
    pendingWrite: boolean;
    reservation?: string;
}

/**
 * Project-local arbitration. Every registered editor must acquire beginEdit before mutation.
 * This Module publishes source content only; it never changes a runtime's Undo state or baseline.
 */
export class PrefabWriteCoordinator {
    private readonly runtimes = new Map<string, RuntimeRecord>();
    private readonly lastGenerations = new Map<string, number>();
    private readonly queues = new Map<string, Promise<void>>();
    private readonly writingAssets = new Set<string>();
    private resetting: Promise<void> | null = null;

    constructor(private readonly store: IPrefabSourceStore) {}

    registerRuntime(options: IRegisterPrefabRuntimeOptions): IPrefabRuntimeRegistration {
        this.assertRunning();
        this.assertIdentity(options?.runtime);
        this.assertVersion(options.editVersion);
        if (options.prefabUuid !== undefined) this.assertText(options.prefabUuid, 'prefabUuid');
        if (!options.state || (options.state.status !== 'unavailable'
            && (options.state.status !== 'ready' || typeof options.state.dirty !== 'boolean'))) {
            throw new PrefabWriteError('PREFAB_INVALID_REQUEST', 'A known runtime state is required.');
        }
        const lastGeneration = this.lastGenerations.get(options.runtime.runtimeId);
        if (this.runtimes.has(options.runtime.runtimeId)
            || (lastGeneration !== undefined && options.runtime.generation <= lastGeneration)) {
            throw new PrefabWriteError('PREFAB_SESSION_CHANGED', 'Close the previous runtime registration before replacing it.');
        }
        if (options.prefabUuid && this.writingAssets.has(options.prefabUuid)) {
            throw new PrefabWriteError('PREFAB_BUSY', 'The Prefab source is being written.', 'not-committed', options.prefabUuid);
        }
        const registration = { ...options.runtime, registrationId: randomUUID() };
        this.lastGenerations.set(registration.runtimeId, registration.generation);
        this.runtimes.set(registration.runtimeId, {
            registration,
            prefabUuid: options.prefabUuid,
            editVersion: options.editVersion,
            dirty: options.state.status === 'ready' ? options.state.dirty : null,
            available: options.state.status === 'ready',
            pendingWrite: false,
        });
        return { ...registration };
    }

    queryRuntime(registration: IPrefabRuntimeRegistration): IPrefabWorkingCopyState {
        const record = this.getRuntime(registration);
        return {
            registration: { ...record.registration },
            prefabUuid: record.prefabUuid,
            editVersion: record.editVersion,
            status: !record.available ? 'unavailable' : record.editId ? 'editing' : 'ready',
            dirty: record.dirty,
        };
    }

    beginEdit(options: IBeginPrefabEditOptions): IPrefabEditLease {
        const record = this.getRuntime(options?.registration);
        this.assertAvailable(record);
        this.assertVersion(options.expectedEditVersion);
        if (record.editVersion !== options.expectedEditVersion) {
            throw new PrefabWriteError('PREFAB_SESSION_CHANGED', 'The working copy changed before the edit began.');
        }
        if (record.editId || record.reservation) {
            throw new PrefabWriteError('PREFAB_BUSY', 'The working copy is already reserved.');
        }
        if (record.editVersion === Number.MAX_SAFE_INTEGER) {
            throw new PrefabWriteError('PREFAB_SESSION_CHANGED', 'The edit version is exhausted; reopen with a new runtime identity.');
        }
        // Reserve before local mutations, including long recordings where dirty has not changed yet.
        record.editVersion++;
        record.editId = randomUUID();
        return { registration: { ...record.registration }, editId: record.editId, editVersion: record.editVersion };
    }

    finishEdit(options: IFinishPrefabEditOptions): void {
        const record = this.getEdit(options?.lease);
        if (record.pendingWrite) throw new PrefabWriteError('PREFAB_BUSY', 'Wait for the pending source write before finishing the edit.');
        if (typeof options.dirty !== 'boolean') throw new PrefabWriteError('PREFAB_INVALID_REQUEST', 'An authoritative dirty state is required.');
        record.dirty = options.dirty;
        record.editId = undefined;
    }

    markRuntimeUnavailable(registration: IPrefabRuntimeRegistration): void {
        const record = this.getRuntime(registration);
        record.available = false;
        record.dirty = null;
    }

    unregisterRuntime(registration: IPrefabRuntimeRegistration): void {
        const record = this.getRuntime(registration);
        this.runtimes.delete(record.registration.runtimeId);
    }

    async readSource(assetUuid: string): Promise<IPrefabSourceSnapshot> {
        this.assertRunning();
        this.assertText(assetUuid, 'assetUuid');
        return this.enqueue(assetUuid, async () => {
            this.assertRunning();
            return this.readSnapshot(assetUuid);
        });
    }

    private async readSnapshot(assetUuid: string): Promise<IPrefabSourceSnapshot> {
        try {
            const content = await this.store.read(assetUuid);
            return {
                assetUuid,
                content: content.toString('utf8'),
                fingerprint: createHash('sha256').update(content).digest('hex'),
            };
        } catch (error) {
            if (error instanceof PrefabWriteError) throw error;
            throw new PrefabWriteError('PREFAB_SOURCE_UNAVAILABLE', this.message(error), 'not-committed', assetUuid);
        }
    }

    async commit(options: ICommitPrefabWriteOptions): Promise<IPrefabWriteReceipt> {
        this.assertText(options?.assetUuid, 'assetUuid');
        if (!/^[a-f0-9]{64}$/.test(options.expectedFingerprint) || typeof options.content !== 'string') {
            throw new PrefabWriteError('PREFAB_INVALID_REQUEST', 'Source content and a SHA-256 baseline are required.');
        }
        const source = this.getEdit(options.source);
        if (source.pendingWrite) throw new PrefabWriteError('PREFAB_BUSY', 'This edit already has a pending source write.');
        source.pendingWrite = true;
        // Snapshot caller-owned input before queuing or awaiting I/O.
        const request = { ...options, source: { ...options.source, registration: { ...options.source.registration } } };
        try {
            return await this.enqueue(request.assetUuid, () => this.publish(request));
        } finally {
            source.pendingWrite = false;
        }
    }

    /** Invalidate old ownership immediately; drain in-progress publications before accepting a new epoch. */
    reset(): Promise<void> {
        if (this.resetting) return this.resetting;
        this.runtimes.clear();
        this.resetting = Promise.all(Array.from(this.queues.values())).then(() => {
            this.lastGenerations.clear();
            this.resetting = null;
        });
        return this.resetting;
    }

    private async enqueue<T>(assetUuid: string, task: () => Promise<T>): Promise<T> {
        const previous = this.queues.get(assetUuid) ?? Promise.resolve();
        const operation = previous.then(task);
        const settled = operation.then(() => undefined, () => undefined);
        this.queues.set(assetUuid, settled);
        try {
            return await operation;
        } finally {
            if (this.queues.get(assetUuid) === settled) this.queues.delete(assetUuid);
        }
    }

    private async publish(options: ICommitPrefabWriteOptions): Promise<IPrefabWriteReceipt> {
        const source = this.getEdit(options.source);
        const participants = Array.from(this.runtimes.values()).filter(record => record === source || record.prefabUuid === options.assetUuid);
        for (const record of participants) {
            this.assertAvailable(record);
            if (record.reservation || (record !== source && record.editId)) {
                throw new PrefabWriteError('PREFAB_BUSY', 'A participating working copy is being edited.', 'not-committed', options.assetUuid, record.registration);
            }
            if (record !== source && record.dirty) {
                throw new PrefabWriteError('PREFAB_DOCUMENT_DIRTY', 'The Prefab has another unsaved working copy.', 'not-committed', options.assetUuid, record.registration);
            }
        }
        const commitId = randomUUID();
        for (const record of participants) record.reservation = commitId;
        this.writingAssets.add(options.assetUuid);
        try {
            const before = await this.readSnapshot(options.assetUuid);
            this.getEdit(options.source);
            for (const record of participants) {
                if (this.getRuntime(record.registration) !== record) throw new PrefabWriteError('PREFAB_SESSION_CHANGED', 'A participating working copy was replaced.');
                this.assertAvailable(record);
            }
            if (before.fingerprint !== options.expectedFingerprint) {
                throw new PrefabWriteError('PREFAB_SOURCE_CHANGED', 'The Prefab source changed after the caller loaded it.', 'not-committed', options.assetUuid);
            }
            try {
                await this.store.write(options.assetUuid, options.content);
            } catch (error) {
                throw new PrefabWriteError('PREFAB_WRITE_FAILED', this.message(error), 'unknown', options.assetUuid);
            }
            // Publication is now committed, even if the caller closed or the final read fails.
            let after: IPrefabSourceSnapshot;
            try {
                after = await this.readSnapshot(options.assetUuid);
            } catch (error) {
                throw new PrefabWriteError('PREFAB_WRITE_FAILED', this.message(error), 'committed', options.assetUuid);
            }
            return { commitId, source: { ...options.source.registration }, before, after };
        } finally {
            for (const record of participants) {
                if (record.reservation === commitId) record.reservation = undefined;
            }
            this.writingAssets.delete(options.assetUuid);
        }
    }

    private getRuntime(registration: IPrefabRuntimeRegistration): RuntimeRecord {
        this.assertRunning();
        this.assertIdentity(registration);
        const record = this.runtimes.get(registration.runtimeId);
        if (!record || record.registration.generation !== registration.generation
            || record.registration.registrationId !== registration.registrationId) {
            throw new PrefabWriteError('PREFAB_SESSION_CHANGED', 'The runtime registration is no longer current.');
        }
        return record;
    }

    private getEdit(lease: IPrefabEditLease): RuntimeRecord {
        const record = this.getRuntime(lease?.registration);
        this.assertAvailable(record);
        if (!record.editId || record.editId !== lease.editId || record.editVersion !== lease.editVersion) {
            throw new PrefabWriteError('PREFAB_SESSION_CHANGED', 'The edit reservation is no longer current.');
        }
        return record;
    }

    private assertAvailable(record: RuntimeRecord): void {
        if (!record.available) throw new PrefabWriteError('PREFAB_SESSION_CHANGED', 'A participating runtime is unavailable.', 'not-committed', record.prefabUuid, record.registration);
    }

    private assertRunning(): void {
        if (this.resetting) throw new PrefabWriteError('PREFAB_SESSION_CHANGED', 'The Prefab write Host is resetting.');
    }

    private assertIdentity(runtime: IPrefabRuntimeIdentity): void {
        this.assertText(runtime?.runtimeId, 'runtimeId');
        this.assertVersion(runtime.generation);
    }

    private assertVersion(version: number): void {
        if (!Number.isSafeInteger(version) || version < 0) throw new PrefabWriteError('PREFAB_INVALID_REQUEST', 'Versions must be non-negative safe integers.');
    }

    private assertText(value: string, name: string): void {
        if (typeof value !== 'string' || value.length === 0) throw new PrefabWriteError('PREFAB_INVALID_REQUEST', `${name} must be a non-empty string.`);
    }

    private message(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
