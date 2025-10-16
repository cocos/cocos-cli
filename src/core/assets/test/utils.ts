import { engine as EnginPath } from '../../../../.user.json';
import { join } from 'path';

import { EngineLoader } from 'cc/loader.js';
import { Engine } from '../../engine';
import { existsSync, remove } from 'fs-extra';
import utils from '../../base/utils';

const projectRoot = join(__dirname, '../../../../tests/fixtures/projects/asset-operation');

export const testInfo = {
    projectRoot,
    engineRoot: EnginPath,
    hasInit: false,
    libraryPath: join(projectRoot, 'library'),
    testRootUrl: 'db://assets/__asset_test__',
    testRoot: join(projectRoot, 'assets/__asset_test__'),
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
    /**
     * 初始化一些基础模块信息
     */
    utils.Path.register('project', {
        label: '项目',
        path: testInfo.projectRoot,
    });
    const { configurationManager } = await import('../../configuration');
    await configurationManager.initialize(testInfo.projectRoot);
    // 初始化项目信息
    const { default: Project } = await import('../../project');
    await Project.open(testInfo.projectRoot);
    const engine = await Engine.init(EnginPath);
    await engine.initEngine({
        importBase: testInfo.libraryPath,
        nativeBase: testInfo.libraryPath,
        writablePath: join(testInfo.projectRoot, 'temp'),
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
    if (existsSync(testInfo.testRoot)) {
        try {
            await remove(testInfo.testRoot);
            console.log('remove project test root cache success');
        } catch (error) {
            console.error(error);
            console.error('remove project test root cache fail');
        }
    }
    const { startupAssetDB } = await import('../index');
    await startupAssetDB();
    testInfo.hasInit = true;
    console.log('startupAssetDB success');
}

