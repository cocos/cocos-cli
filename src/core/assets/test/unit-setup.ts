import { EngineLoader } from 'cc/loader.js';
import Engine from '../../engine';
import { join } from 'path';
import { engine as EnginPath } from '../../../../.user.json';
import { testInfo } from './utils';

export default async function globalSetup() {

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
    const engine = await Engine.init(EnginPath);
    await engine.initEngine({
        importBase: join(testInfo.projectRoot, 'library'),
        nativeBase: join(testInfo.projectRoot, 'library'),
    });
    const { startupAssetDB } = await import('../index');
    await startupAssetDB({
        root: testInfo.projectRoot,
        assetDBList: [{
            name: 'assets',
            target: join(testInfo.projectRoot, 'assets'),
            readonly: false,
            visible: true,
            library: join(testInfo.projectRoot, 'library'),
        }],
    });
    console.log('startupAssetDB success');
}   