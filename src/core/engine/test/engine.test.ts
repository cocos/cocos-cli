import Engine, { IEngine } from '../index';
import { join } from 'path';
import { engine as EnginPath } from '../../../../.user.json';
import { EngineLoader } from 'cc/loader.js';

const ProjectPath = join(__dirname, '../../../../test-project');

jest.mock('cc', () => {
    return EngineLoader.getEngineModuleById('cc');
}, { virtual: true });

/**
 * Engine 类的测试 - 验证是否需要 mock
 */
describe('Engine', () => {
    let engine: IEngine;

    beforeEach(async () => {
        // 在每个测试用例之前初始化engine
        engine = await Engine.init(EnginPath);
    });

    // it('test engine compile', async () => {
    //     // 测试引擎编译功能
    //     try {
    //         await engine.getCompiler().clear();
    //         await engine.getCompiler().compileEngine(EnginPath, true);
    //         // 如果编译成功，测试通过
    //         expect(true).toBe(true);
    //     } catch (error) {
    //         // 如果编译失败，检查错误类型
    //         expect(error).toBeInstanceOf(Error);
    //         console.log('Compilation error:', error);
    //     }
    // }, 1000 * 60 * 50);

    it('test engine initEngine', async () => {
        await engine.initEngine({
            importBase: join(ProjectPath, 'library'),
            nativeBase: join(ProjectPath, 'library'),
        });
        // @ts-ignore
        expect(cc).toBeDefined();
        // @ts-ignore
        expect(ccm).toBeDefined();
    },  1000 * 60 * 50);
});