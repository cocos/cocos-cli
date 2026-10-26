// Spawned by Project.ensureProjectBackend. No editor/private-package dependency.
import { startServer } from '../../mcp/start-server';
import { ProjectBackendError, currentProjectOwnership } from './ownership';

async function main() {
    const project = process.argv[2];
    if (!project) throw new Error('Project path is required');
    const options = JSON.parse(process.argv[3] ?? '{}');
    const backend = await startServer(project, options.port, { sceneSessionOrigins: options.allowedOrigins });
    let closing = false;
    const close = async () => {
        if (closing) return;
        closing = true;
        try { await backend.close(); process.exit(0); }
        catch (error) { console.error(error); throw error; }
    };
    process.once('SIGINT', () => { void close().catch(() => undefined); });
    process.once('SIGTERM', () => { void close().catch(() => undefined); });
    (await currentProjectOwnership())?.onShutdown(close);
}
void main().catch(async error => {
    console.error(error);
    // Failed cleanup may leave writers alive. Keep ownership until the process is
    // explicitly terminated, rather than letting another backend start alongside it.
    if ((await currentProjectOwnership())?.descriptor.state === 'failed') return;
    process.exit(error instanceof ProjectBackendError && error.code === 'ALREADY_RUNNING' ? 73 : 1);
});
