import { GlobalPaths } from '../../global';

export async function init(projectPath: string): Promise<void> {
    const { initEngine } = await import('../../core/engine');
    return await initEngine(GlobalPaths.enginePath, projectPath);
}

