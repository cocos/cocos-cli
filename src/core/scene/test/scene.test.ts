import * as fse from 'fs-extra';
import { SceneTestEnv } from './scene-test-env';

function removeCache() {
    if (fse.existsSync(SceneTestEnv.cacheDirectory)) {
        fse.removeSync(SceneTestEnv.cacheDirectory);
        fse.removeSync(SceneTestEnv.cacheDirectory + '.meta');
        console.log('删除场景测试目录:', SceneTestEnv.cacheDirectory);
    }
}

beforeAll(async () => {
    removeCache();
    fse.ensureDirSync(SceneTestEnv.cacheDirectory);
    console.log('创建场景测试目录:', SceneTestEnv.cacheDirectory);
    const TestUtils = await import('../../test/global-setup');
    await TestUtils.globalSetup();
});

afterAll(async () => {
    removeCache();
});

import './editor-proxy-scene.testcase';
import './editor-proxy-prefab.testcase';
import './node-proxy.testcase';
import './component-proxy.testcase';
import './prefab-proxy.testcase';
import './script-proxy.testcase';
import './engine-proxy.testcase';
import './scene-exit.testcase';
