import { SceneSessionError, type SceneSessionDescriptor, type SceneSessionSnapshot, type SceneSessionCommand, type SceneCommandResult, type SceneEventBatch, type SceneVersion } from './protocol';

/** A transport-only client: importing it never initializes the asset database or scene worker. */
export class SceneSessionClient {
    constructor(public readonly descriptor: SceneSessionDescriptor) {
        const url = new URL(descriptor.url);
        if (descriptor.protocol !== 1 || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
            throw new SceneSessionError('INVALID_SESSION', 'Expected a protocol 1 loopback scene session');
        }
    }
    async snapshot(signal?: AbortSignal): Promise<SceneSessionSnapshot> {
        const snapshot = await this.fetch<SceneSessionSnapshot>('/snapshot', undefined, signal);
        if (snapshot.project !== this.descriptor.project) throw new SceneSessionError('PROJECT_MISMATCH', 'The connection descriptor belongs to a different project');
        return snapshot;
    }
    command(command: SceneSessionCommand, signal?: AbortSignal): Promise<SceneCommandResult> {
        return this.fetch('/command', command, signal);
    }
    events(version: SceneVersion, after: number, signal?: AbortSignal): Promise<SceneEventBatch> {
        return this.fetch(`/events?epoch=${encodeURIComponent(version.epoch)}&after=${after}`, undefined, signal);
    }
    private async fetch<T>(path: string, command?: unknown, signal?: AbortSignal): Promise<T> {
        const response = await fetch(`${this.descriptor.url.replace(/\/$/, '')}${path}`, {
            method: command === undefined ? 'GET' : 'POST',
            headers: { authorization: `Bearer ${this.descriptor.token}`, 'content-type': 'application/json' },
            body: command === undefined ? undefined : JSON.stringify(command),
            signal: signal ?? AbortSignal.timeout(120000),
            redirect: 'error',
        });
        const value = await response.json() as any;
        if (!response.ok) throw new SceneSessionError(value.code ?? 'HTTP_ERROR', value.message ?? `HTTP ${response.status}`);
        return value as T;
    }
}
