import { createHash, randomUUID } from 'node:crypto';
import type { ISceneCommandProvider, SceneCommandRequestOptions } from '../main-process/scene-command-provider';
import { SceneSessionError, type SceneVersion, type SceneSessionCommand, type SceneSessionEvent, type SceneEventBatch, type SceneCommandResult } from './protocol';

/** One queue for MCP, SDK and editor commands. Only the owner holds an engine instance. */
export class SceneSessionCoordinator {
    private epoch = randomUUID();
    private revision = 0;
    private sequence = 0;
    private tail: Promise<unknown> = Promise.resolve();
    private active: { source?: string; operationId?: string; events: Set<string> } | null = null;
    private history: SceneSessionEvent[] = [];
    private operations = new Map<string, { fingerprint: string; promise: Promise<SceneCommandResult>; settled: boolean }>();
    private listeners = new Set<() => void>();
    constructor(private readonly provider: () => ISceneCommandProvider | null) {}
    get version(): SceneVersion { return { epoch: this.epoch, revision: this.revision }; }
    get cursor(): number { return this.sequence; }

    reset(): void {
        this.epoch = randomUUID();
        this.revision = 0;
        this.operations.clear();
        this.publish(['session:reset']);
    }

    /** Events carry invalidations, never live engine objects or a second authoritative state. */
    invalidate(event: string): void {
        if (this.active) { this.active.events.add(event); return; }
        this.revision++;
        this.publish([event]);
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    events(epoch: string, after: number): SceneEventBatch {
        const oldest = this.history[0]?.sequence ?? this.sequence + 1;
        const resync = epoch !== this.epoch || after < oldest - 1 || after > this.sequence;
        return { version: this.version, sequence: this.sequence, resync,
            events: resync ? [] : this.history.filter(event => event.sequence > after) };
    }

    /** Reads share the queue so a snapshot cannot observe half of an editor command. */
    read<T>(read: (provider: ISceneCommandProvider) => Promise<T>): Promise<T> {
        const epoch = this.epoch;
        return this.enqueue(async () => {
            this.assertEpoch(epoch);
            const revision = this.revision;
            const value = await read(this.getProvider());
            this.assertEpoch(epoch);
            if (revision !== this.revision) throw new SceneSessionError('CONFLICT', 'Scene changed during the read; request a fresh snapshot');
            return value;
        });
    }

    request(module: string, method: string, args: any[], options?: SceneCommandRequestOptions): Promise<any> {
        // Bake jobs may wait for a renderer. Their status/cancel must remain reachable.
        if (/^(LightmapBake|LightProbeBake|ReflectionProbe)$/.test(module)
            && /^(cancel|query|get)/.test(method)) {
            return this.getProvider().request(module, method, args, options);
        }
        return this.execute(module, method, args, options).then(result => result.value);
    }

    command(command: SceneSessionCommand): Promise<SceneCommandResult> {
        if (!command.source || !command.operationId || command.source.length > 128 || command.operationId.length > 128) {
            return Promise.reject(new SceneSessionError('INVALID_COMMAND', 'source and operationId are required (max 128 characters)'));
        }
        const key = JSON.stringify([command.source, command.operationId]);
        const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
        const existing = this.operations.get(key);
        if (existing) {
            return existing.fingerprint === fingerprint ? existing.promise
                : Promise.reject(new SceneSessionError('OPERATION_REUSED', 'An operationId cannot identify different commands'));
        }
        if (this.operations.size >= 1024) {
            const expired = [...this.operations].find(([, entry]) => entry.settled);
            if (!expired) return Promise.reject(new SceneSessionError('BUSY', 'Too many outstanding commands'));
            this.operations.delete(expired[0]);
        }
        const promise = this.execute(command.module, command.method, command.args ?? [], undefined, command);
        const entry = { fingerprint, promise, settled: false };
        this.operations.set(key, entry);
        void promise.then(() => { entry.settled = true; }, () => { entry.settled = true; });
        return promise;
    }

    private execute(module: string, method: string, args: any[], options?: SceneCommandRequestOptions, command?: SceneSessionCommand): Promise<SceneCommandResult> {
        const epoch = this.epoch;
        return this.enqueue(async () => {
            this.assertEpoch(epoch);
            if (command && (command.expected?.epoch !== this.epoch || command.expected?.revision !== this.revision)) {
                throw new SceneSessionError('CONFLICT', 'Scene changed; refresh before submitting a new operation');
            }
            const provider = this.getProvider();
            const active = { source: command?.source, operationId: command?.operationId, events: new Set<string>() };
            this.active = active;
            // Unknown methods are conservatively considered writes. Public network methods use a separate allowlist.
            const mutation = !/^(query|get|has|is|can)/.test(method);
            try {
                const value = await provider.request(module, method, args, options);
                this.assertEpoch(epoch);
                return { value, version: { epoch, revision: this.revision + (mutation || active.events.size ? 1 : 0) } };
            } finally {
                this.active = null;
                // Failed engine commands may have made partial changes: invalidate even on failure.
                if (epoch === this.epoch && (mutation || active.events.size)) {
                    this.revision++;
                    this.publish([...active.events, `${module}:${method}`], active);
                }
            }
        });
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.tail.then(operation);
        this.tail = result.catch(() => undefined);
        return result;
    }
    private getProvider(): ISceneCommandProvider {
        const provider = this.provider();
        if (!provider) throw new SceneSessionError('UNAVAILABLE', 'Scene backend is not running');
        return provider;
    }
    private assertEpoch(epoch: string): void {
        if (epoch !== this.epoch) throw new SceneSessionError('SESSION_REPLACED', 'Scene backend was replaced; reconnect and refresh');
    }
    private publish(events: string[], origin?: { source?: string; operationId?: string }): void {
        this.history.push({ sequence: ++this.sequence, version: this.version, ...origin, events });
        if (this.history.length > 256) this.history.shift();
        for (const listener of this.listeners) { try { listener(); } catch { /* A subscriber cannot stop the owner. */ } }
    }
}
