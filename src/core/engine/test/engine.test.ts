import { Engine, IEngine } from '../index';
import { join } from 'path';
import { EngineLoader } from 'cc/loader.js';

const ProjectPath = join(__dirname, '../../../../test-project');

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

/**
 * Engine 类的测试 - 验证是否需要 mock
 */
describe('Engine', () => {
    let engine: IEngine;

    beforeEach(async () => {
        // 在每个测试用例之前初始化 engine
        engine = await Engine.init(require('../../../../.user.json').engine);
    });

    it('test engine initEngine', async () => {
        await engine.initEngine({
            importBase: join(ProjectPath, 'library'),
            nativeBase: join(ProjectPath, 'library'),
            writablePath: join(ProjectPath, 'temp'),
        });
        // @ts-ignore
        expect(cc).toBeDefined();
        // @ts-ignore
        expect(ccm).toBeDefined();
    }, 1000 * 60 * 50);
});