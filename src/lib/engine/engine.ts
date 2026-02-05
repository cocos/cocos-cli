import { GlobalPaths } from '../../global';

export class Engine {
    static async init(projectPath: string): Promise<void> {
        const { initEngine } = await import('../../core/engine');
        return await initEngine(GlobalPaths.enginePath, projectPath);
    }
}
