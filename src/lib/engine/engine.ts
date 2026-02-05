import { GlobalPaths } from '../../global';
import scripting from '../../core/scripting';

export class Engine {
    static async init(projectPath: string): Promise<void> {
        const { initEngine } = await import('../../core/engine');
        return await initEngine(GlobalPaths.enginePath, projectPath);
    }
    static async initScripting(projectPath: string): Promise<void> {
        const { Engine } = await import('../../core/engine');
        return await scripting.initialize(
            projectPath,
            GlobalPaths.enginePath,
            Engine.getConfig().includeModules);
    }
}
