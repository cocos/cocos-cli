import { Engine, IEngine } from '../index';
import { join } from 'path';
import { EngineLoader } from 'cc/loader.js';
import { TestGlobalEnv } from '../../../../tests/global-env';

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
    'cc/editor/new-gen-anim',
    'cc/editor/offline-mappings',
    'cc/editor/embedded-player',
    'cc/editor/color-utils',
].forEach((module) => {
    jest.mock(module, () => {
        return EngineLoader.getEngineModuleById(module);
    }, { virtual: true });
});

/**
 * Engine 类的测试 - 验证是否需要 mock
 */
describe('Engine', () => {
    let engine: IEngine;

    beforeEach(async () => {
        // 在每个测试用例之前初始化 engine
        engine = await Engine.init(TestGlobalEnv.engineRoot);
    });

    it('test engine initEngine', async () => {
        await engine.initEngine({
            importBase: join(TestGlobalEnv.projectRoot, 'library'),
            nativeBase: join(TestGlobalEnv.projectRoot, 'library'),
            writablePath: join(TestGlobalEnv.projectRoot, 'temp'),
        });
        // @ts-ignore
        expect(cc).toBeDefined();
        // @ts-ignore
        expect(ccm).toBeDefined();
    }, 1000 * 60 * 50);
});