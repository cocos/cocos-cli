import { engine as EnginPath } from '../../../.user.json';
import { EngineLoader } from 'cc/loader.js';
import { existsSync, remove } from 'fs-extra';
import { TestGlobalEnv } from './global-env';
import { projectManager } from '../launcher';
let hasInit = false;

export async function globalSetup() {
    // TODO 如果是异步多次调用，需要做队列管理
    if (hasInit) {
        return;
    }
    if (existsSync(TestGlobalEnv.libraryPath)) {
        try {
            await remove(TestGlobalEnv.libraryPath);
            console.log('remove project library cache success');
        } catch (error) {
            console.error(error);
            console.error('remove project library cache fail');
        }
    }
    if (existsSync(TestGlobalEnv.testRoot)) {
        try {
            await remove(TestGlobalEnv.testRoot);
            console.log('remove project test root cache success');
        } catch (error) {
            console.error(error);
            console.error('remove project test root cache fail');
        }
    }
    [
        'cc',
        'cc/editor/populate-internal-constants',
        'cc/editor/serialization',
        'cc/editor/new-gen-anim',
        'cc/editor/embedded-player',
        'cc/editor/reflection-probe',
        'cc/editor/lod-group-utils',
        'cc/editor/material',
        'cc/editor/2d-misc',
        'cc/editor/offline-mappings',
        'cc/editor/custom-pipeline',
        'cc/editor/animation-clip-migration',
        'cc/editor/exotic-animation',
        'cc/editor/color-utils',
    ].forEach((module) => {
        jest.mock(module, () => {
            return EngineLoader.getEngineModuleById(module);
        }, { virtual: true });
    });
    await projectManager.open(TestGlobalEnv.projectRoot);

    hasInit = true;
}

