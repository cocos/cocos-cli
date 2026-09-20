import { createServer, type Server } from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, link, unlink, rename, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SceneSessionDescriptor } from '../scene/session/protocol';

export interface ProjectBackendDescriptor {
    protocol: 1;
    project: string;
    projectKey: string;
    ownerId: string;
    pid: number;
    url: string;
    token: string;
    state: 'initializing' | 'ready' | 'stopping' | 'failed';
    sceneSession?: SceneSessionDescriptor;
    mcpUrl?: string;
}
export class ProjectBackendError extends Error {
    constructor(public readonly code: string, message: string, public readonly backend?: ProjectBackendDescriptor) {
        super(message); this.name = 'ProjectBackendError';
        // CLI error logging must not accidentally print the owner's connection tokens.
        Object.defineProperty(this, 'backend', { value: backend, enumerable: false });
    }
}
interface Location { project: string; key: string; directory: string; registry: string; owner: string }
interface Registry { protocol: 1; port: number }

export async function canonicalProject(project: string): Promise<string> {
    const canonical = await realpath(project);
    if (!(await stat(canonical)).isDirectory()) throw new Error('Project must be a directory');
    return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}
async function locate(project: string): Promise<Location> {
    project = await canonicalProject(project);
    const directory = join(project, 'temp', '.cocos-cli-backend');
    return { project, key: createHash('sha256').update(project).digest('hex'), directory,
        registry: join(directory, 'rendezvous.json'), owner: join(directory, 'owner.json') };
}
async function readRegistry(location: Location): Promise<Registry | null> {
    try {
        const registry = JSON.parse(await readFile(location.registry, 'utf8')) as Registry;
        if (registry.protocol !== 1 || !Number.isInteger(registry.port) || registry.port < 1 || registry.port > 65535) throw new Error('Invalid rendezvous');
        return registry;
    } catch (error: any) {
        if (error.code === 'ENOENT') return null;
        throw new ProjectBackendError('INVALID_REGISTRY', `Invalid backend rendezvous: ${location.registry}`);
    }
}
async function atomicWrite(filename: string, value: unknown): Promise<void> {
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await retryFileOperation(() => rename(temporary, filename)); }
    finally { await unlink(temporary).catch(() => undefined); }
}
async function retryFileOperation(operation: () => Promise<void>): Promise<void> {
    for (let attempt = 0; ; attempt++) {
        try { await operation(); return; }
        catch (error: any) {
            if (attempt >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
            await new Promise<void>(resolve => setTimeout(resolve, Math.min(20 * 2 ** attempt, 100)));
        }
    }
}
function isRefused(error: any): boolean { return error?.cause?.code === 'ECONNREFUSED' || error?.code === 'ECONNREFUSED'; }

/** Discovery verifies a live owner. A stale owner.json/PID is never treated as ownership. */
export async function discoverProjectBackend(project: string): Promise<ProjectBackendDescriptor | null> {
    const location = await locate(project);
    const registry = await readRegistry(location);
    if (!registry) return null;
    const url = `http://127.0.0.1:${registry.port}`;
    let identity: any;
    try {
        const response = await fetch(`${url}/identity`, { signal: AbortSignal.timeout(2000), redirect: 'error' });
        if (!response.ok) throw new Error('Unknown listener');
        identity = await response.json();
    } catch (error) {
        if (isRefused(error)) return null;
        throw new ProjectBackendError('BACKEND_UNREACHABLE', `Backend listener is occupied or unresponsive for ${location.project}`);
    }
    if (identity.protocol !== 1 || identity.projectKey !== location.key || typeof identity.ownerId !== 'string') {
        throw new ProjectBackendError('PORT_CONFLICT', 'The project rendezvous port is occupied by another service; no second backend will be started');
    }
    let stored: ProjectBackendDescriptor;
    try { stored = JSON.parse(await readFile(location.owner, 'utf8')); }
    catch { throw new ProjectBackendError('BACKEND_INITIALIZING', 'Backend is acquiring ownership; retry discovery'); }
    if (stored.ownerId !== identity.ownerId || stored.projectKey !== location.key || stored.url !== url) {
        throw new ProjectBackendError('BACKEND_INITIALIZING', 'Backend identity changed; retry discovery');
    }
    let response: Response;
    try {
        response = await fetch(`${url}/status`, { headers: { authorization: `Bearer ${stored.token}` }, signal: AbortSignal.timeout(2000), redirect: 'error' });
    } catch {
        throw new ProjectBackendError('BACKEND_UNREACHABLE', 'Backend status is temporarily unavailable; ownership must not be replaced');
    }
    if (!response.ok) throw new ProjectBackendError('BACKEND_INITIALIZING', 'Backend credentials changed; retry discovery');
    const live = await response.json() as ProjectBackendDescriptor;
    if (live.protocol !== 1 || live.ownerId !== stored.ownerId || live.projectKey !== location.key
        || live.project !== location.project || live.url !== url || live.token !== stored.token) {
        throw new ProjectBackendError('IDENTITY_MISMATCH', 'Backend identity does not match the project');
    }
    return live;
}

/** OS socket ownership is the mutex. The immutable port registry is NOT a PID/timeout lease. */
export class ProjectBackendLease {
    private server: Server;
    private sockets = new Set<import('node:net').Socket>();
    private shutdown?: () => Promise<void>;
    private closing = false;
    private shutdownPromise?: Promise<void>;
    private released = false;
    readonly descriptor: ProjectBackendDescriptor;
    private constructor(private readonly location: Location) {
        this.descriptor = { protocol: 1, project: location.project, projectKey: location.key, ownerId: randomUUID(),
            pid: process.pid, url: '', token: randomBytes(32).toString('hex'), state: 'initializing' };
        const auth = Buffer.from(`Bearer ${this.descriptor.token}`);
        this.server = createServer((request, response) => {
            response.setHeader('content-type', 'application/json');
            response.setHeader('cache-control', 'no-store');
            if (request.method === 'GET' && request.url === '/identity') {
                response.end(JSON.stringify({ protocol: 1, projectKey: location.key, ownerId: this.descriptor.ownerId })); return;
            }
            const supplied = Buffer.from(request.headers.authorization ?? '');
            if (supplied.length !== auth.length || !timingSafeEqual(supplied, auth)) { response.writeHead(401); response.end('{}'); return; }
            if (request.method === 'GET' && request.url === '/status') { response.end(JSON.stringify(this.descriptor)); return; }
            if (request.method === 'POST' && request.url === '/shutdown' && this.shutdown && !this.closing) {
                this.closing = true;
                this.descriptor.state = 'stopping';
                response.writeHead(202); response.end('{}');
                void this.requestShutdown().catch(error => { console.error('[Backend] Shutdown failed; ownership retained:', error); });
                return;
            }
            response.writeHead(409); response.end('{}');
        });
        this.server.on('connection', socket => { this.sockets.add(socket); socket.once('close', () => this.sockets.delete(socket)); });
        this.server.requestTimeout = 5000;
        this.server.headersTimeout = 5000;
    }
    static async acquire(project: string): Promise<ProjectBackendLease> {
        const location = await locate(project);
        await mkdir(location.directory, { recursive: true, mode: 0o700 });
        // Publish the selected port exactly once using an atomic hard link of a complete JSON file.
        // Never unlink/replace this registry on shutdown: all contenders must bind the same OS resource.
        for (;;) {
            const registry = await readRegistry(location);
            const lease = new ProjectBackendLease(location);
            try { await lease.listen(registry?.port ?? 0); }
            catch (error: any) {
                if (error.code !== 'EADDRINUSE') throw error;
                let backend: ProjectBackendDescriptor | null = null;
                try { backend = await discoverProjectBackend(location.project); }
                catch (discoveryError) {
                    if (discoveryError instanceof ProjectBackendError && ['BACKEND_INITIALIZING', 'BACKEND_UNREACHABLE'].includes(discoveryError.code)) {
                        throw new ProjectBackendError('ALREADY_RUNNING', 'Another backend is initializing this project');
                    }
                    throw discoveryError;
                }
                throw new ProjectBackendError('ALREADY_RUNNING', 'This project already has an owner; connect to it instead of initializing another backend', backend ?? undefined);
            }
            const port = (lease.server.address() as import('node:net').AddressInfo).port;
            lease.descriptor.url = `http://127.0.0.1:${port}`;
            if (!registry) {
                const candidate = join(location.directory, `rendezvous.${randomUUID()}.tmp`);
                try {
                    await writeFile(candidate, JSON.stringify({ protocol: 1, port }), { mode: 0o600 });
                    await link(candidate, location.registry);
                } catch (error: any) {
                    await lease.closeListener();
                    if (error.code === 'EEXIST') continue;
                    throw error;
                } finally { await unlink(candidate).catch(() => undefined); }
            }
            try { await atomicWrite(location.owner, lease.descriptor); }
            catch (error) { await lease.closeListener(); throw error; }
            // Do not keep an otherwise finished one-shot CLI invocation alive solely for its ownership endpoint.
            lease.server.unref();
            return lease;
        }
    }
    private listen(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen({ port, host: '127.0.0.1', exclusive: true }, () => { this.server.off('error', reject); resolve(); });
        });
    }
    onShutdown(shutdown: () => Promise<void>): void { this.shutdown = shutdown; }
    requestShutdown(): Promise<void> {
        return this.shutdownPromise ??= (async () => {
            if (!this.shutdown) throw new Error('No backend shutdown handler is installed');
            this.closing = true;
            this.descriptor.state = 'stopping';
            try { await this.shutdown(); }
            catch (error) { this.descriptor.state = 'failed'; this.server.ref(); throw error; }
        })();
    }
    async publish(patch: Partial<Pick<ProjectBackendDescriptor, 'state' | 'sceneSession' | 'mcpUrl'>>): Promise<void> {
        if (this.released) throw new Error('Backend ownership has been released');
        Object.assign(this.descriptor, patch);
        if (patch.state === 'failed') this.server.ref();
        // The file contains boot credentials only. State/endpoints are read from authenticated /status.
        // Replacing a credentials file for every state transition races Windows file readers unnecessarily.
    }
    /** Release only after all project writers have stopped. No PID or stale-timeout takeover. */
    async release(): Promise<void> {
        if (this.released) return;
        this.released = true;
        try {
            const stored = JSON.parse(await readFile(this.location.owner, 'utf8'));
            if (stored.ownerId === this.descriptor.ownerId) await retryFileOperation(() => unlink(this.location.owner));
        } catch (error: any) { if (error.code !== 'ENOENT') { this.released = false; throw error; } }
        await this.closeListener();
    }
    private async closeListener(): Promise<void> {
        const closed = new Promise<void>((resolve, reject) => this.server.close(error => error ? reject(error) : resolve()));
        for (const socket of this.sockets) socket.destroy();
        await closed;
    }
}

let ownership: Promise<ProjectBackendLease> | undefined;
/** Process-wide project ownership for the CLI's singleton engine/asset/script modules. */
export async function ensureProjectOwnership(project: string): Promise<ProjectBackendLease> {
    const canonical = await canonicalProject(project);
    if (!ownership) {
        const pending = ProjectBackendLease.acquire(canonical).then(lease => {
            // Low-level SDK initialization has the same lifetime guarantee as Launcher startup.
            lease.onShutdown(async () => {
                const { shutdownProjectResources } = await import('./runtime');
                await shutdownProjectResources(lease);
            });
            return lease;
        });
        ownership = pending;
        void pending.catch(() => { if (ownership === pending) ownership = undefined; });
    }
    const lease = await ownership;
    if (lease.descriptor.project !== canonical) throw new ProjectBackendError('PROCESS_PROJECT_CONFLICT', 'One CLI process can initialize only one project; use a separate backend process');
    return lease;
}
export async function releaseProjectOwnership(lease: ProjectBackendLease): Promise<void> {
    await lease.release();
    if (ownership && await ownership === lease) ownership = undefined;
}
export async function currentProjectOwnership(): Promise<ProjectBackendLease | undefined> { return ownership; }
