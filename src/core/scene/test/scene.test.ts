import * as fse from 'fs-extra';
import { SceneTestEnv } from './scene-test-env';

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
import './node-proxy.testcase';
import './component-proxy.testcase';
import './scene-exit.testcase';



