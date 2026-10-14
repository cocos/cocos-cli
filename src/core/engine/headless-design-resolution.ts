import { readFile } from 'fs/promises';
import { join } from 'path';
import { deepMerge } from '../configuration/script/utils';
import { type DesignResolution, fetchDesignResolution, validateDesignResolution } from './editor-design-resolution';

async function readOptionalJSON(path: string): Promise<any | undefined> {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}

/** Worker config registries have not loaded the host project configuration. */
export async function loadHeadlessDesignResolution(
    projectPath: string,
    serverURL: string | undefined,
    defaults: DesignResolution,
): Promise<DesignResolution> {
    if (serverURL) {
        // A failed host request must stop startup, never silently switch to defaults.
        return fetchDesignResolution(serverURL);
    }
    const modern = await readOptionalJSON(join(projectPath, 'settings', 'cocos.config.json'));
    const root = await readOptionalJSON(join(projectPath, 'cocos.config.json'));
    let project;
    if (modern !== undefined || root !== undefined) {
        // Match configuration migration: settings/ overrides the old root config.
        project = deepMerge(root?.engine?.designResolution, modern?.engine?.designResolution);
    } else {
        const legacy = await readOptionalJSON(join(projectPath, 'settings', 'v2', 'packages', 'project.json'));
        project = legacy?.general?.designResolution;
    }
    const local = await readOptionalJSON(join(projectPath, 'profiles', 'cocos.config.json'));
    // Config files store overrides, not complete values. Match BaseConfiguration.get:
    // defaults <- project <- local, without running migrations or writing project files.
    return validateDesignResolution(deepMerge(deepMerge(defaults, project), local?.engine?.designResolution));
}
