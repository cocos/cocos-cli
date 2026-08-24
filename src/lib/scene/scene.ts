import { init as sceneInit } from '../../core/scene';
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
    const { sceneWorker } = await import('../../core/scene/main-process/scene-worker');
    await sceneWorker.start(GlobalPaths.enginePath, projectPath);
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
