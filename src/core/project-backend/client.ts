import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { canonicalProject, discoverProjectBackend, ProjectBackendError, type ProjectBackendDescriptor } from './ownership';

export interface StartProjectBackendOptions {
    port?: number;
    allowedOrigins?: string[];
    /** Node executable; IDEs hosted in Electron may supply a bundled Node executable. */
    executable?: string;
    startupTimeoutMs?: number;
    /** Defaults to true. Existing owners without MCP are not silently replaced. */
    requireMcp?: boolean;
}
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 100));

async function waitReady(project: string, options: StartProjectBackendOptions, exited?: () => Error | undefined): Promise<ProjectBackendDescriptor> {
    const deadline = Date.now() + (options.startupTimeoutMs ?? 180000);
    let observed: ProjectBackendDescriptor | null = null;
    while (Date.now() < deadline) {
        try { observed = await discoverProjectBackend(project); }
        catch (error) {
            if (!(error instanceof ProjectBackendError) || !['BACKEND_INITIALIZING', 'BACKEND_UNREACHABLE'].includes(error.code)) throw error;
            const failure = exited?.();
            if (failure) throw failure;
            await pause();
            continue;
        }
        if (!observed && !exited) throw new ProjectBackendError('OWNER_EXITED', 'The previous owner exited before it became ready');
        if (observed?.state === 'ready' && observed.sceneSession) {
            if (options.requireMcp !== false && !observed.mcpUrl) {
                throw new ProjectBackendError('CAPABILITY_MISSING', 'The existing owner has no MCP endpoint; register MCP in that owner instead of starting another backend', observed);
            }
            return observed;
        }
        if (observed?.state === 'failed') throw new ProjectBackendError('BACKEND_FAILED', 'Existing backend failed; ownership remains held until it exits', observed);
        const failure = exited?.();
        if (failure) throw failure;
        await pause();
    }
    throw new ProjectBackendError('STARTUP_TIMEOUT', 'Backend did not become ready; an initializing owner is not terminated or replaced automatically', observed ?? undefined);
}

/** Start a separate CLI owner process. A concurrent winner causes ALREADY_RUNNING, never duplicate initialization. */
export async function startProjectBackend(project: string, options: StartProjectBackendOptions = {}): Promise<ProjectBackendDescriptor> {
    project = await canonicalProject(project);
    const existing = await discoverProjectBackend(project);
    if (existing) throw new ProjectBackendError('ALREADY_RUNNING', 'This project already has a backend', existing);
    // Launch the built entry even when the SDK caller itself is running TypeScript sources.
    const entry = join(__dirname, '../../../dist/core/project-backend/entry.js');
    const child = spawn(options.executable ?? process.execPath, [entry, project, JSON.stringify({ port: options.port, allowedOrigins: options.allowedOrigins })], {
        detached: true, windowsHide: true, stdio: 'ignore',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    let failure: Error | undefined;
    const onError = (error: Error) => { failure = error; };
    const onExit = (code: number | null) => { failure = new ProjectBackendError(code === 73 ? 'ALREADY_RUNNING' : 'STARTUP_FAILED', `Backend process exited before ready (code ${code}); inspect temp/logs/cocos.log`); };
    child.on('error', onError);
    child.on('exit', onExit);
    child.unref();
    try {
        const ready = await waitReady(project, options, () => failure);
        if (ready.pid !== child.pid) throw new ProjectBackendError('ALREADY_RUNNING', 'Another process won project ownership', ready);
        return ready;
    } finally { child.off('error', onError); child.off('exit', onExit); }
}

/** IDE entry point: discover/connect, or race safely to start exactly one owner. */
export async function ensureProjectBackend(project: string, options: StartProjectBackendOptions = {}): Promise<ProjectBackendDescriptor> {
    project = await canonicalProject(project);
    const deadline = Date.now() + (options.startupTimeoutMs ?? 180000);
    while (Date.now() < deadline) {
        try {
            const remaining = { ...options, startupTimeoutMs: Math.max(1, deadline - Date.now()) };
            const existing = await discoverProjectBackend(project);
            if (existing) return await waitReady(project, remaining);
            return await startProjectBackend(project, remaining);
        } catch (error) {
            if (!(error instanceof ProjectBackendError) || !['ALREADY_RUNNING', 'BACKEND_INITIALIZING', 'BACKEND_UNREACHABLE', 'OWNER_EXITED'].includes(error.code)) throw error;
            await pause();
        }
    }
    throw new ProjectBackendError('STARTUP_TIMEOUT', 'No ready backend was available within the startup deadline');
}

/** Explicit owner shutdown, not an editor/view disconnect operation. */
export async function stopProjectBackend(backend: ProjectBackendDescriptor): Promise<void> {
    const current = await discoverProjectBackend(backend.project);
    if (!current) return;
    if (current.ownerId !== backend.ownerId || current.token !== backend.token) throw new ProjectBackendError('OWNER_CHANGED', 'Refusing to stop a replacement backend');
    if (current.state === 'failed') throw new ProjectBackendError('SHUTDOWN_FAILED', 'Backend cleanup previously failed; ownership is retained', current);
    if (current.state !== 'stopping') {
        const response = await fetch(`${current.url}/shutdown`, { method: 'POST', headers: { authorization: `Bearer ${backend.token}` }, signal: AbortSignal.timeout(5000), redirect: 'error' });
        if (response.status !== 202) throw new ProjectBackendError('SHUTDOWN_REFUSED', 'The owner cannot accept shutdown', current);
    }
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        let observed: ProjectBackendDescriptor | null;
        try { observed = await discoverProjectBackend(backend.project); }
        catch (error) {
            if (error instanceof ProjectBackendError && ['BACKEND_INITIALIZING', 'BACKEND_UNREACHABLE'].includes(error.code)) { await pause(); continue; }
            throw error;
        }
        if (!observed || observed.ownerId !== backend.ownerId) return;
        if (observed.state === 'failed') throw new ProjectBackendError('SHUTDOWN_FAILED', 'Project cleanup failed; ownership was retained', observed);
        await pause();
    }
    throw new ProjectBackendError('SHUTDOWN_TIMEOUT', 'The backend is still stopping; ownership has not been stolen');
}
