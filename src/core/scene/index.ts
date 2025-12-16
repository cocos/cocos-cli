import { sceneConfigInstance } from './scene-configs';
// Interface types
export * from './common';
// Main process
export * from './main-process';
export { sceneConfigInstance };

/**
 * Startup scene
 * @param enginePath Engine directory
 * @param projectPath Project directory
 */
export async function startupScene(enginePath: string, projectPath: string) {
    // Scene config initialization
    await sceneConfigInstance.init();
    // Startup scene process
    const { sceneWorker } = await import('./main-process/scene-worker');
    await sceneWorker.start(enginePath, projectPath);
}
