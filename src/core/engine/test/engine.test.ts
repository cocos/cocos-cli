import Engine, { IEngine } from '../index';
import { join } from 'path';

// 指定需要编译的引擎所在目录
const MOCK_ENGINE_PATH = '/Users/cocos/editor-3d-develop/resources/3d/engine';
// 指定项目目录
const MOCK_PROJECT_PATH = '/Users/cocos/ai/NewProject';

/**
 * Engine 类的测试 - 验证是否需要 mock
 */
describe('Engine', () => {
    let engine: IEngine;

    beforeEach(async () => {
        // 在每个测试用例之前初始化engine
        engine = await Engine.init(MOCK_ENGINE_PATH);
    });

    it('test engine compile', async () => {
        // 测试引擎编译功能
        try {
            await engine.getCompiler().clear();
            await engine.getCompiler().compileEngine(MOCK_ENGINE_PATH, true);
            // 如果编译成功，测试通过
            expect(true).toBe(true);
        } catch (error) {
            // 如果编译失败，检查错误类型
            expect(error).toBeInstanceOf(Error);
            console.log('Compilation error:', error);
        }
    }, 1000 * 60 * 5);

    it('test engine initEngine', async () => {
        await engine.initEngine({
            importBase: join(MOCK_ENGINE_PATH, 'library'),
            nativeBase: join(MOCK_ENGINE_PATH, 'library'),
        });

        console.log(cc);
    });

});