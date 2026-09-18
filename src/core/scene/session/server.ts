import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { SceneSessionCoordinator } from './coordinator';
import { sceneSessionMethods } from './methods';
import { SceneSessionError, type SceneSessionDescriptor, type SceneSessionSnapshot, type SceneSessionCommand } from './protocol';

export interface SceneSessionServerOptions { project: string; port?: number; allowedOrigins?: string[] }
export interface SceneSessionServer {
    descriptor: SceneSessionDescriptor;
    close(): Promise<void>;
}

function send(response: ServerResponse, status: number, data: unknown): void {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(data));
}

async function body(request: IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) throw new SceneSessionError('INVALID_COMMAND', 'Request exceeds 8 MiB');
        chunks.push(Buffer.from(chunk));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new SceneSessionError('INVALID_COMMAND', 'Expected a JSON request'); }
}

function validate(command: SceneSessionCommand): void {
    if (!command || typeof command.module !== 'string' || typeof command.method !== 'string'
        || !Object.hasOwn(sceneSessionMethods, command.module) || !sceneSessionMethods[command.module].includes(command.method)) {
        throw new SceneSessionError('METHOD_NOT_ALLOWED', 'This method is not part of the shared scene contract');
    }
    if (typeof command.source !== 'string' || typeof command.operationId !== 'string'
        || !command.expected || typeof command.expected.epoch !== 'string'
        || !Number.isSafeInteger(command.expected.revision) || command.expected.revision < 0
        || (command.args !== undefined && !Array.isArray(command.args))) {
        throw new SceneSessionError('INVALID_COMMAND', 'Invalid command envelope');
    }
    if ((command.module === 'Node' || command.module === 'Component') && command.method === 'setProperty') {
        const property = command.args?.[0] as any;
        if (property?.record === false) throw new SceneSessionError('INVALID_COMMAND', 'Shared property edits must enter the owner undo history');
    }
}

/** Starts an explicit, authenticated loopback endpoint. Does not initialize a project or a second worker. */
export async function createSceneSessionServer(session: SceneSessionCoordinator, options: SceneSessionServerOptions): Promise<SceneSessionServer> {
    const token = randomBytes(32).toString('hex');
    const authorization = Buffer.from(`Bearer ${token}`);
    const pending = new Set<() => void>();
    const server = createServer(async (request, response) => {
        const origin = request.headers.origin;
        if (origin) {
            if (!options.allowedOrigins?.includes(origin)) { send(response, 403, { code: 'ORIGIN_DENIED' }); return; }
            response.setHeader('access-control-allow-origin', origin);
            response.setHeader('vary', 'Origin');
            if (request.method === 'OPTIONS') {
                response.setHeader('access-control-allow-methods', 'GET, POST');
                response.setHeader('access-control-allow-headers', 'authorization, content-type');
                response.writeHead(204); response.end(); return;
            }
        }
        const supplied = Buffer.from(request.headers.authorization ?? '');
        if (supplied.length !== authorization.length || !timingSafeEqual(supplied, authorization)) {
            send(response, 401, { code: 'UNAUTHORIZED', message: 'A scene session token is required' }); return;
        }
        try {
            const url = new URL(request.url ?? '/', 'http://localhost');
            if (request.method === 'GET' && url.pathname === '/snapshot') {
                const snapshot = await session.read(async provider => {
                    const current = await provider.request('Editor', 'queryCurrent', []);
                    // The render snapshot is built from live state, never reloaded from the asset on disk.
                    const render = current ? await provider.request('Editor', 'queryRenderSnapshot', []) : null;
                    const dirty = await provider.request('Undo', 'isDirty', []);
                    const canUndo = await provider.request('Undo', 'canUndo', []);
                    const canRedo = await provider.request('Redo', 'canRedo', []);
                    return { project: options.project, version: session.version, sequence: session.cursor, current,
                        serializedScene: render?.serializedScene ?? null, render,
                        dirty, canUndo, canRedo } satisfies SceneSessionSnapshot;
                });
                send(response, 200, snapshot);
            } else if (request.method === 'POST' && url.pathname === '/command') {
                const command = await body(request);
                validate(command);
                send(response, 200, await session.command(command));
            } else if (request.method === 'GET' && url.pathname === '/events') {
                const epoch = url.searchParams.get('epoch') ?? '';
                const after = Number(url.searchParams.get('after') ?? -1);
                if (!Number.isSafeInteger(after) || after < 0) throw new SceneSessionError('INVALID_COMMAND', 'Invalid event cursor');
                let batch = session.events(epoch, after);
                if (!batch.resync && !batch.events.length) {
                    await new Promise<void>(resolve => {
                        let timer: ReturnType<typeof setTimeout>;
                        const finish = () => { clearTimeout(timer); unsubscribe(); pending.delete(finish); response.off('close', finish); resolve(); };
                        const unsubscribe = session.subscribe(finish);
                        pending.add(finish);
                        response.once('close', finish);
                        timer = setTimeout(finish, 20000);
                    });
                    batch = session.events(epoch, after);
                }
                if (!response.destroyed) send(response, 200, batch);
            } else { send(response, 404, { code: 'NOT_FOUND', message: 'Unknown scene session endpoint' }); }
        } catch (error) {
            if (response.destroyed) return;
            const code = error instanceof SceneSessionError ? error.code : 'COMMAND_FAILED';
            send(response, code === 'CONFLICT' || code === 'SESSION_REPLACED' ? 409 : code === 'UNAVAILABLE' ? 503 : 400,
                { code, message: error instanceof Error ? error.message : String(error) });
        }
    });
    server.requestTimeout = 30000;
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not bind the scene session');
    return {
        descriptor: { protocol: 1, project: options.project, url: `http://127.0.0.1:${address.port}`, token },
        async close() {
            for (const finish of pending) finish();
            await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
        },
    };
}
