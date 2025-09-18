import { engine as EnginPath } from '../../../../.user.json';
import { join } from 'path';

import { EngineLoader } from 'cc/loader.js';
import Engine from '../../engine';
import { existsSync, remove } from 'fs-extra';
const projectRoot = join(__dirname, '../../../../tests/fixtures/projects/asset-operation');
export const testInfo = {
    projectRoot,
    engineRoot: EnginPath,
    hasInit: false,
    libraryPath: join(projectRoot, 'library'),
};
export async function globalSetup() {
    if (testInfo.hasInit) {
        return;
    }
    [
        'cc',
        'cc/editor/populate-internal-constants',
        'cc/editor/serialization',
        'cc/editor/animation-clip-migration',
        'cc/editor/exotic-animation',
        'cc/editor/new-gen-anim',
        'cc/editor/offline-mappings',
        'cc/editor/embedded-player',
        'cc/editor/color-utils',
        'cc/editor/custom-pipeline',
    ].forEach((module) => {
        jest.mock(module, () => {
            return EngineLoader.getEngineModuleById(module);
        }, { virtual: true });
    });
    console.log('start init engine with project root: ', testInfo.projectRoot);
    const engine = await Engine.init(EnginPath);
    await engine.initEngine({
        importBase: testInfo.libraryPath,
        nativeBase: testInfo.libraryPath,
    });
    if (existsSync(testInfo.libraryPath)) {
        try {
            await remove(testInfo.libraryPath);
            console.log('remove project library cache success');
        } catch (error) {
            console.error(error);
            console.error('remove project library cache fail');
        }
    }
    const { startupAssetDB } = await import('../index');
    await startupAssetDB({
        root: testInfo.projectRoot,
        assetDBList: [{
            name: 'assets',
            target: join(testInfo.projectRoot, 'assets'),
            readonly: false,
            visible: true,
            library: testInfo.libraryPath,
        }],
    });
    testInfo.hasInit = true;
    console.log('startupAssetDB success');
}

