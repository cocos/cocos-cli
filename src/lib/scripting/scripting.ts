import { GlobalPaths } from '../../global';
import scripting from '../../core/scripting';

export class Scripting {
    static async init(projectPath: string): Promise<void> {
        const { Engine } = await import('../../core/engine');
        return await scripting.initialize(
            projectPath,
            GlobalPaths.enginePath,
            Engine.getConfig().includeModules);
    }
}
