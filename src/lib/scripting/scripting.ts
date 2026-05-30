import { GlobalPaths } from '../../global';
import scripting from '../../core/scripting';
import type { AssetChangeInfo } from '../../core/scripting';
import type { ProgrammingFacet } from '../../core/scripting/programming/Facet';

export type * from '../../core/scripting/interface';

export async function init(projectPath: string): Promise<void> {
    const { Engine } = await import('../../core/engine');
    return await scripting.initialize(
        projectPath,
        GlobalPaths.enginePath,
        Engine.getConfig().includeModules);
}

export async function initProgrammingFacet(): Promise<ProgrammingFacet> {
    const { Engine } = await import('../../core/engine');
    const features = Engine.getConfig().includeModules || [];
    const enginePath = GlobalPaths.enginePath;

    const { createProgrammingFacet } = await import('../../core/scripting/programming/FacetInstance');
    return await createProgrammingFacet(enginePath, scripting.projectPath, features);
}

export async function getProgrammingFacet(): Promise<ProgrammingFacet> {
    const { getPreviewFacet } = await import('../../core/scripting/programming/FacetInstance');
    return getPreviewFacet();
}

/**
 * 在独立的子进程中运行项目脚本编译
 * 以避免阻塞主进程
 */
export async function startCompileScript(assetChanges?: AssetChangeInfo[]) {
    const { Engine } = await import('../../core/engine');
    const features = Engine.getConfig().includeModules;

    const { startCompileScriptProcess } = await import('../../core/scripting/compile-process');
    const facet = await getProgrammingFacet();
    await startCompileScriptProcess({
        projectPath: scripting.projectPath,
        enginePath: GlobalPaths.enginePath,
        features,
        assetChanges
    }, () => {
        if (facet) {
            facet.notifyPackDriverUpdated();
        }
    });
}

export function onCompileStart(listener: (e: { scope: string; taskId?: string }) => void): () => void {
    const wrapped = (scope: string, taskId?: string) => listener({ scope, taskId });
    scripting.on('compile-start', wrapped);
    return () => { scripting.off('compile-start', wrapped); };
}

export function onCompiled(listener: (e: { scope: string }) => void): () => void {
    const wrapped = (scope: string) => listener({ scope });
    scripting.on('compiled', wrapped);
    return () => { scripting.off('compiled', wrapped); };
}

export function onPackBuildStart(listener: (e: { targetName: string }) => void): () => void {
    const wrapped = (targetName: string) => listener({ targetName });
    scripting.on('pack-build-start', wrapped);
    return () => { scripting.off('pack-build-start', wrapped); };
}

export function onPackBuildEnd(listener: (e: { targetName: string }) => void): () => void {
    const wrapped = (targetName: string) => listener({ targetName });
    scripting.on('pack-build-end', wrapped);
    return () => { scripting.off('pack-build-end', wrapped); };
}

