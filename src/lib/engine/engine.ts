import { GlobalPaths } from '../../global';
export type * from '../../core/engine/@types/public';

export async function init(projectPath: string): Promise<void> {
    const { initEngine } = await import('../../core/engine');
    return await initEngine(GlobalPaths.enginePath, projectPath);
}

export async function getInfo() {
    const { Engine } = await import('../../core/engine');
    return Engine.getInfo();
}

export async function getConfig(useDefault?: boolean) {
    const { Engine } = await import('../../core/engine');
    return Engine.getConfig(useDefault);
}

export async function initEngine(enginePath: string, projectPath: string, serverURL?: string) {
    const { initEngine } = await import('../../core/engine');
    return await initEngine(enginePath, projectPath, serverURL);
}

