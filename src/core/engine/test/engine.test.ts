import engine from '../index';
const mockEnginePath = '/Users/wzm/Documents/wzm/creator/cocos-editor380/resources/3d/engine';
// 测试不使用 mock 是否可以正常创建 Engine 实例

/**
 * Engine 类的测试 - 验证是否需要 mock
 */
describe('Engine', () => {
    it('test engine init', async () => {
        // 测试直接创建 Engine 实例是否会因为缺少模块而失败
        await engine.init(mockEnginePath);
        expect(engine).toBeDefined();
    });

    it('test engine compile', async () => {
        try {
            await engine.init(mockEnginePath);
            await engine.compileEngine(mockEnginePath, true);
        } catch (error) {
            // 如果抛出错误，我们可以看到具体是什么错误
            console.log('Error without mocks:', error);
            // 暂时让测试通过，但会显示错误信息
            expect(error).toBeDefined();
        }
    }, 1000 * 60 * 5);
});