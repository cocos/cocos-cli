import { init as sceneInit, Scene } from '../../core/scene';
import { GlobalPaths } from '../../global';
import { Rpc } from '../../core/scene/main-process/rpc';
import type {
    ISceneCommandProvider,
    SceneCommandProviderRegistration,
} from '../../core/scene/main-process/rpc';

export type {
    ISceneCommandProvider,
    SceneCommandProviderRegistration,
    SceneCommandRequestOptions,
} from '../../core/scene/main-process/rpc';
export { WorkerSceneCommandProvider } from '../../core/scene/main-process/rpc';
export { SceneSessionClient } from '../../core/scene/session/client';
export * from '../../core/scene/session/protocol';
export type { SceneSessionServerOptions, SceneSessionServer } from '../../core/scene/session/server';

/** Call after startupWorker/CocosAPI.startup. The descriptor can be passed to another process over IDE IPC. */
export async function startSessionServer(options: import('../../core/scene/session/server').SceneSessionServerOptions) {
    if (!Rpc.isConnect()) throw new Error('Start the authoritative scene worker before starting a shared scene session');
    const { ensureOwnedSceneSession } = await import('../../core/project-backend/runtime');
    const server = await ensureOwnedSceneSession(options);
    const { currentProjectOwnership } = await import('../../core/project-backend/ownership');
    await (await currentProjectOwnership())?.publish({ state: 'ready' });
    return server;
}

/**
 * Initialize the scene module.
 * Registers the scene middleware and initializes scene config.
 */
export async function init(): Promise<void> {
    await sceneInit();
}

/**
 * Start the scene worker process.
 *
 * @param projectPath Path to the project directory
 */
export async function startupWorker(projectPath: string): Promise<void> {
    const { ensureProjectOwnership } = await import('../../core/project-backend/ownership');
    await ensureProjectOwnership(projectPath);
    const { sceneWorker } = await import('../../core/scene/main-process/scene-worker');
    if (!await sceneWorker.start(GlobalPaths.enginePath, projectPath)) throw new Error('Scene worker startup failed');
}

/** Installs a Scene command provider and returns an ownership-bound registration. */
export function setCommandProvider(
    provider: ISceneCommandProvider,
): SceneCommandProviderRegistration {
    return Rpc.setCommandProvider(provider);
}

/** Clears and disposes the active Scene command provider. */
export function resetCommandProvider(): void {
    Rpc.resetCommandProvider();
}
