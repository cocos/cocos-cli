import fse from 'fs-extra';
import { EngineLoader } from 'cc/loader.js';
import { SceneTestEnv } from './scene-test-env';

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

beforeAll(async () => {
    fse.ensureDirSync(SceneTestEnv.CacheDirectory);
    console.log('创建场景测试目录:', SceneTestEnv.CacheDirectory);
    const TestUtils = await import('../../test/global-setup');
    await TestUtils.globalSetup();
});

afterAll(() => {
    try {
        fse.removeSync(SceneTestEnv.CacheDirectory);
        console.log('删除场景测试目录:', SceneTestEnv.CacheDirectory);
    } catch (e) { }
});

import './scene-worker.testcase';
import './scene-proxy.testcase';

import './scene-worker-exit.testcase';

