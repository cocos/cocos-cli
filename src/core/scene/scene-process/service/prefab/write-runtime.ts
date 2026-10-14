import type {
    IPrefabEditLease,
    IPrefabRuntimeRegistration,
    IPrefabSourceSnapshot,
    IPrefabWriteError,
    IPrefabWriteHost,
    IPrefabWriteReceipt,
    PrefabWriteResult,
} from '../../../common/prefab-write';
import { serializePrefabWriteError } from '../../../common/prefab-write';

export class PrefabWriteConflict extends Error implements IPrefabWriteError {
    readonly code: IPrefabWriteError['code'];
    readonly commitState: IPrefabWriteError['commitState'];
    readonly assetUuid?: string;
    readonly runtime?: IPrefabWriteError['runtime'];

    constructor(error: IPrefabWriteError) {
        super(error.message);
        this.name = 'PrefabWriteConflict';
        this.code = error.code;
        this.commitState = error.commitState;
        this.assetUuid = error.assetUuid;
        this.runtime = error.runtime;
    }
}

function unwrap<T>(result: PrefabWriteResult<T>): T {
    if (!result.ok) throw new PrefabWriteConflict(result.error);
    return result.value;
}

interface PublicationState {
    assetUuid: string;
    commitState: 'unknown' | 'committed';
}

function publicationFailure(error: unknown, publication: PublicationState): PrefabWriteConflict {
    const details = serializePrefabWriteError(error);
    return new PrefabWriteConflict({
        code: 'PREFAB_WRITE_FAILED',
        message: error instanceof Error ? error.message : (details?.message ?? String(error)),
        ...publication,
        runtime: details?.runtime,
    });
}

/** A successful receipt fixes the publication outcome, even if later reconciliation fails. */
export async function reconcilePrefabWrite<T>(receipt: IPrefabWriteReceipt, operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        throw publicationFailure(error, { assetUuid: receipt.after.assetUuid, commitState: 'committed' });
    }
}

/** Owns one runtime's lease and the source versions that its content actually loaded. */
export class PrefabWriteRuntime {
    private registration?: IPrefabRuntimeRegistration;
    private lease?: IPrefabEditLease;
    private references = 0;
    private exclusive = false;
    private unavailable = false;
    private closing = false;
    private discarded = false;
    private publication?: PublicationState;
    private editVersion = 0;
    private transition: Promise<void> = Promise.resolve();
    private readonly sources = new Map<string, IPrefabSourceSnapshot>();
    private readonly idleCallbacks = new Set<() => void>();
    private readonly cleanCallbacks = new Map<string, () => void>();

    constructor(
        private readonly host: IPrefabWriteHost,
        private readonly dirty: () => boolean,
    ) {}

    get active(): boolean {
        return !!this.registration;
    }
    get editing(): boolean {
        return this.references > 0;
    }

    async open(runtimeId: string, generation: number, prefabUuid?: string): Promise<void> {
        this.assertNotClosing();
        if (this.registration) throw new Error('Close the current Prefab write registration first.');
        this.registration = unwrap(
            await this.host.registerRuntime({
                runtime: { runtimeId, generation },
                prefabUuid,
                editVersion: 0,
                state: { status: 'ready', dirty: this.dirty() },
            }),
        );
        this.editVersion = 0;
        this.unavailable = false;
        this.sources.clear();
    }

    async close(): Promise<void> {
        await this.transition;
        if (this.references) throw new Error('Cannot close a working copy during an edit.');
        if (this.registration) unwrap(await this.host.unregisterRuntime(this.registration));
        this.registration = undefined;
        this.unavailable = false;
        this.discarded = false;
        this.sources.clear();
        this.idleCallbacks.clear();
        this.cleanCallbacks.clear();
    }

    /** Explicit discard can destroy an unavailable working copy without requesting edit permission. */
    async discard(closeEditor: () => Promise<boolean>): Promise<boolean> {
        let release: (() => Promise<void>) | undefined;
        await this.serializeTransition(async () => {
            this.assertNotClosing();
            if (this.references)
                throw new PrefabWriteConflict({
                    code: 'PREFAB_BUSY',
                    message: 'Finish the current edit before closing.',
                    commitState: 'not-committed',
                });
            // Healthy documents still reserve the Host while their local content is disposed.
            if (this.registration && !this.unavailable) {
                await this.acquireWithinTransition(true);
                release = this.releaseOnce();
            }
            this.closing = true;
        });
        try {
            let closed: boolean;
            try {
                closed = this.discarded || (await closeEditor());
            } catch (error) {
                await this.markUnavailable();
                throw error;
            }
            // A destroyed tree has no dirty state to publish. Keep the Host lease reserved
            // until unregister confirms its closure, rather than sending finishEdit.
            if (closed) {
                this.discarded = true;
                this.unavailable = true;
            }
            await release?.();
            release = undefined;
            if (closed) await this.close();
            return closed;
        } finally {
            try {
                await release?.();
            } finally {
                this.closing = false;
            }
        }
    }

    /** Nested editor operations and recordings share an occupancy until the last one ends. */
    async acquire(exclusive = false): Promise<() => Promise<void>> {
        this.assertEditable();
        if (!this.registration) return async () => {};
        await this.serializeTransition(() => this.acquireWithinTransition(exclusive));
        return this.releaseOnce();
    }

    private async acquireWithinTransition(exclusive: boolean): Promise<void> {
        this.assertEditable();
        if (!this.registration) throw new Error('The working copy closed before the edit began.');
        if (this.exclusive || (exclusive && this.references))
            throw new PrefabWriteConflict({
                code: 'PREFAB_BUSY',
                message: 'The working copy is being edited.',
                commitState: 'not-committed',
            });
        if (!this.lease) {
            try {
                const lease = unwrap(await this.host.beginEdit({
                    registration: this.registration,
                    expectedEditVersion: this.editVersion,
                }));
                this.editVersion = lease.editVersion;
                this.lease = lease;
            } catch (error) {
                const details = serializePrefabWriteError(error);
                // A missing reply may leave a Host lease that this runtime cannot finish.
                // Isolate that state until explicit discard; confirmed busy rejections remain retryable.
                if (!details || details.commitState !== 'not-committed' || details.code === 'PREFAB_SESSION_CHANGED') {
                    await this.markUnavailable();
                }
                throw error;
            }
            this.publication = undefined;
        }
        this.references++;
        this.exclusive = exclusive;
    }

    /** Synchronous gizmo callbacks run inside an already acquired input occupancy. */
    retain(): () => Promise<void> {
        this.assertEditable();
        if (!this.registration) return async () => {};
        if (!this.lease || !this.references)
            throw new PrefabWriteConflict({
                code: 'PREFAB_BUSY',
                message: 'Use the asynchronous entry or acquire an editor occupancy before synchronous mutation.',
                commitState: 'not-committed',
            });
        this.references++;
        return this.releaseOnce();
    }

    async edit<T>(operation: () => Promise<T>, exclusive = false): Promise<T> {
        const release = await this.acquire(exclusive);
        let result: T;
        try {
            result = await operation();
        } catch (error) {
            const failure = this.publication ? publicationFailure(error, this.publication) : error;
            // Completion errors must not replace the original publication outcome.
            try {
                await release();
            } catch (releaseError) {
                console.warn('[Prefab write] Failed to finish an unsuccessful operation:', releaseError);
            }
            throw failure;
        }
        await release();
        return result;
    }

    /** Block locally first; losing contact with the Host must not re-enable editing. */
    async markUnavailable(): Promise<void> {
        this.unavailable = true;
        if (!this.registration) return;
        try {
            unwrap(await this.host.markRuntimeUnavailable(this.registration));
        } catch (error) {
            console.warn('[Prefab write] Failed to report an unavailable working copy:', error);
        }
    }

    private assertNotClosing(): void {
        if (this.closing) {
            throw new PrefabWriteConflict({
                code: 'PREFAB_BUSY',
                message: 'The working copy is closing.',
                commitState: 'not-committed',
            });
        }
    }

    private assertEditable(): void {
        this.assertNotClosing();
        if (this.unavailable) {
            throw new PrefabWriteConflict({
                code: 'PREFAB_SESSION_CHANGED',
                message: 'The working copy is unavailable; discard it and reopen before editing.',
                commitState: 'not-committed',
            });
        }
    }

    whenIdle(callback: () => void): void {
        if (this.editing) this.idleCallbacks.add(callback);
        else callback();
    }

    whenClean(key: string, callback: () => void): void {
        if (this.editing || this.dirty()) this.cleanCallbacks.set(key, callback);
        else callback();
    }

    async synchronize(uuid: string, reload: (source: IPrefabSourceSnapshot) => Promise<void>): Promise<boolean> {
        if (this.editing || this.dirty()) return false;
        // Wait for the notification's source publication to leave the Host queue first.
        const observed = await this.readSource(uuid);
        if (observed.fingerprint === this.baseline(uuid).fingerprint) return false;
        return this.edit(async () => {
            if (this.dirty()) return false;
            const source = await this.readSource(uuid);
            if (source.fingerprint === this.baseline(uuid).fingerprint) return false;
            try {
                await reload(source);
            } catch (error) {
                // The engine may already have disposed the previous tree. Require reopen.
                await this.markUnavailable();
                throw error;
            }
            this.loaded(source);
            return true;
        }, true);
    }

    readSource(uuid: string): Promise<IPrefabSourceSnapshot> {
        return this.host.readSource(uuid).then(unwrap);
    }

    loaded(source: IPrefabSourceSnapshot): void {
        this.sources.set(source.assetUuid, { ...source });
    }

    baseline(uuid: string): IPrefabSourceSnapshot {
        const source = this.sources.get(uuid);
        if (!source)
            throw new PrefabWriteConflict({
                code: 'PREFAB_SOURCE_CHANGED',
                message: 'Reload the Prefab before writing: its loaded source version is unknown.',
                commitState: 'not-committed',
                assetUuid: uuid,
            });
        return source;
    }

    knownBaseline(uuid: string): IPrefabSourceSnapshot | undefined {
        return this.sources.get(uuid);
    }

    async commit(
        uuid: string,
        content: string,
        expectedFingerprint: string = this.baseline(uuid).fingerprint,
    ): Promise<IPrefabWriteReceipt> {
        if (!this.lease) throw new Error('A Prefab source write requires an editor occupancy.');
        // A receipt is not a loaded baseline. The caller must reconcile content first.
        try {
            const receipt = unwrap(
                await this.host.commit({ source: this.lease, assetUuid: uuid, expectedFingerprint, content }),
            );
            this.publication = { assetUuid: uuid, commitState: 'committed' };
            return receipt;
        } catch (error) {
            const details = serializePrefabWriteError(error);
            // A transport failure can arrive after the Host has already persisted the source.
            if (!details || details.commitState !== 'not-committed') {
                this.publication = {
                    assetUuid: uuid,
                    commitState: details?.commitState === 'committed' ? 'committed' : 'unknown',
                };
                throw publicationFailure(error, this.publication);
            }
            throw error;
        }
    }

    private releaseOnce(): () => Promise<void> {
        let released = false;
        return async () => {
            if (released) return;
            released = true;
            await this.serializeTransition(async () => {
                if (--this.references !== 0 || !this.lease) return;
                const lease = this.lease;
                const publication = this.publication;
                try {
                    try {
                        if (!this.unavailable) unwrap(await this.host.finishEdit({ lease, dirty: this.dirty() }));
                    } finally {
                        this.lease = undefined;
                        this.exclusive = false;
                        this.publication = undefined;
                    }
                    if (this.unavailable || this.closing) return;
                    const callbacks = [...this.idleCallbacks];
                    this.idleCallbacks.clear();
                    callbacks.forEach(callback => callback());
                    if (!this.dirty()) {
                        const cleanCallbacks = [...this.cleanCallbacks.values()];
                        this.cleanCallbacks.clear();
                        cleanCallbacks.forEach(callback => callback());
                    }
                } catch (error) {
                    // Never leave an uncertain participant advertised as clean.
                    await this.markUnavailable();
                    throw publication ? publicationFailure(error, publication) : error;
                }
            });
        };
    }

    private serializeTransition(operation: () => Promise<void>): Promise<void> {
        const next = this.transition.then(operation);
        this.transition = next.catch(() => {});
        return next;
    }
}
