import { join } from 'path';
import { ProgrammingFacet } from './Facet';

let programmingFacet: ProgrammingFacet | null = null;
let createProgrammingFacetPromise: Promise<ProgrammingFacet> | null = null;

export async function createProgrammingFacet(enginePath: string, projectPath: string, features: string[]) {
    if (!programmingFacet) {
        programmingFacet = await ProgrammingFacet.create(
            {
                root: enginePath,
                distRoot: join(enginePath, 'bin', '.cache', 'dev-cli', 'web'),
                baseUrl: '/scripting/engine',
                features,
            },
            projectPath
        );
    }
    return programmingFacet;
}

export async function waitForProgrammingFacet(): Promise<ProgrammingFacet> {
    if (!createProgrammingFacetPromise) {
        const { Engine } = await import('../../engine');
        const { default: scripting } = await import('../');
        const enginePath = Engine.getInfo().typescript.path;
        const features = Engine.getConfig().includeModules || [];
        createProgrammingFacetPromise = createProgrammingFacet(enginePath, scripting.projectPath, features);
        createProgrammingFacetPromise.catch(() => {
            createProgrammingFacetPromise = null;
        });
    }
    await createProgrammingFacetPromise;

    return programmingFacet!;
}

export function getPreviewFacet() {
    if (!programmingFacet) {
        throw new Error('ProgrammingFacet not init, please init firstly.');
    }
    return programmingFacet;
}
