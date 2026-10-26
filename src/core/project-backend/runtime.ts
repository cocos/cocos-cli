import { ensureProjectOwnership, currentProjectOwnership, releaseProjectOwnership, type ProjectBackendLease } from './ownership';
import type { SceneSessionServer, SceneSessionServerOptions } from '../scene/session/server';

let session: Promise<SceneSessionServer> | undefined;
let sessionOptions: SceneSessionServerOptions | undefined;

/** One shared scene endpoint per owner, even if several SDK consumers request it concurrently. */
export async function ensureOwnedSceneSession(options: SceneSessionServerOptions): Promise<SceneSessionServer> {
    const lease = await ensureProjectOwnership(options.project);
    if (session) {
        if (options.port && sessionOptions?.port !== options.port) throw new Error('The project already has a shared scene endpoint on another port');
        if (options.allowedOrigins) {
            sessionOptions!.allowedOrigins = [...new Set([...(sessionOptions!.allowedOrigins ?? []), ...options.allowedOrigins])];
        }
        return session;
    }
    sessionOptions = { ...options, project: lease.descriptor.project };
    const pending = (async () => {
        const { Rpc } = await import('../scene/main-process/rpc');
        if (!Rpc.isConnect()) throw new Error('Start the authoritative scene worker before starting a shared scene session');
        const { createSceneSessionServer } = await import('../scene/session/server');
        const server = await createSceneSessionServer(Rpc.getSharedSession(), sessionOptions!);
        const close = server.close.bind(server);
        let closed = false;
        server.close = async () => {
            if (closed) return;
            closed = true;
            await close();
            if (session === pending) { session = undefined; sessionOptions = undefined; }
            await lease.publish({ sceneSession: undefined });
        };
        try { await lease.publish({ sceneSession: server.descriptor }); }
        catch (error) { await close(); throw error; }
        return server;
    })();
    session = pending;
    void pending.catch(() => { if (session === pending) { session = undefined; sessionOptions = undefined; } });
    return pending;
}

export async function closeOwnedSceneSession(): Promise<void> { if (session) await (await session).close(); }
export async function publishMcpEndpoint(mcpUrl: string): Promise<void> {
    const lease = await currentProjectOwnership();
    if (lease) await lease.publish({ mcpUrl, state: 'ready' });
}

/** Cleanup for hosts using the lower-level Project/Assets/Scripting/Scene SDK modules. */
export async function shutdownProjectResources(lease: ProjectBackendLease): Promise<void> {
    const errors: unknown[] = [];
    const attempt = async (action: () => Promise<unknown>) => { try { await action(); } catch (error) { errors.push(error); } };
    await attempt(() => lease.publish({ state: 'stopping' }));
    await attempt(closeOwnedSceneSession);
    await attempt(async () => { const { sceneWorker } = await import('../scene/main-process/scene-worker'); if (!await sceneWorker.stop()) throw new Error('Scene worker did not stop'); });
    await attempt(async () => { const server = await import('../../lib/server/server'); await server.stop(); const { stopServer } = await import('../../server'); await stopServer(); });
    await attempt(async () => { const { stopAssetDB } = await import('../assets'); await stopAssetDB(); });
    await attempt(async () => { const { default: scripting } = await import('../scripting'); await scripting.close(); });
    await attempt(async () => { const { default: project } = await import('../project'); if (project.path) await project.close(); });
    await attempt(async () => { const mcp = await import('../../lib/mcp/mcp'); await mcp.unregister(); });
    if (errors.length) { await lease.publish({ state: 'failed' }).catch(() => undefined); throw new AggregateError(errors, 'Project cleanup failed; ownership retained'); }
    await releaseProjectOwnership(lease);
}
