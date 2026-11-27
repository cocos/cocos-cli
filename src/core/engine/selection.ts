import { resolve, relative } from 'path';
import { activateEngine, EngineSelection, getEnginePathOverride, GlobalPaths } from '../../global';

export interface EngineSdkConfiguration {
    path?: string;
    version?: string;
}

const { resolveEngineSelection } = require('../../../workflow/engine-path') as {
    resolveEngineSelection: (root: string, options: { explicitPath?: string; projectRoot?: string; projectConfig?: EngineSdkConfiguration }) => EngineSelection;
};

const { checkEngineCompatibility, describePolicy, readPolicy } = require('../../../workflow/engine-compatibility');
const warned = new Set<string>();

function checkSelection(selection: EngineSelection) {
    const result = checkEngineCompatibility(selection, GlobalPaths.workspace);
    if (result.experimental && !warned.has(selection.path)) {
        console.warn(`[Engine compatibility] Experimental successor engine ${selection.version} at ${selection.path}. Supported: ${describePolicy(readPolicy(GlobalPaths.workspace))}`);
        warned.add(selection.path);
    }
    return activateEngine(selection);
}

export function selectEnginePath(enginePath: string) {
    return checkSelection(resolveEngineSelection(GlobalPaths.workspace, { explicitPath: enginePath }));
}

/** Prepare the project's settings and select the process engine before loading it. */
export async function selectProjectEngine(projectPath?: string, enginePath?: string) {
    const projectRoot = projectPath === undefined ? undefined : resolve(projectPath);
    let projectConfig: EngineSdkConfiguration | undefined;
    if (projectRoot) {
        const { configurationManager, configurationRegistry } = await import('../configuration');
        await configurationManager.initialize(projectRoot);
        if (relative(resolve(projectRoot, 'settings/cocos.config.json'), await configurationManager.getConfigPath()) !== '') {
            throw new Error('A different project is already initialized in this process; start a new process.');
        }
        const instance = configurationRegistry.getInstances().engineSdk ?? await configurationRegistry.register('engineSdk', { defaults: {} });
        projectConfig = instance.getAll('project');
    }
    return checkSelection(resolveEngineSelection(GlobalPaths.workspace, {
        explicitPath: enginePath ?? getEnginePathOverride(), projectRoot, projectConfig,
    }));
}
