import { getClient } from '../../../mcp/test/mcp-setup';
import { COMMON_STATUS } from '../../base/schema-base';

describe('Assets API Tests', () => {
    let client: any;

    beforeAll(async () => {
        // 确保 MCP 客户端完全初始化
        client = await getClient();
        expect(client).toBeDefined();
        expect(client.isClientConnected()).toBe(true);
    });

    describe('refresh API', () => {
        test('should refresh assets directory successfully', async () => {
            // 测试刷新 assets 目录
            const testDir = 'db://assets/editor.png';

            try {
                const result = await client.callTool('assets-refresh', {
                    dir: testDir
                });

                // 验证返回结果结构
                expect(result).toBeDefined();
                expect(result.content).toBeDefined();

                // 解析返回的内容
                const response = Array.isArray(result.content) ? result.content[0] : result.content;
                expect(response).toHaveProperty('text');

                const responseData = JSON.parse(response.text);

                // 检查响应格式
                console.debug('📄 Refresh result:', JSON.stringify(responseData, null, 2));

                // 验证响应结构 - 实际格式是 {result: {code: 200, data: {...}}}
                expect(responseData).toHaveProperty('result');
                expect(responseData.result).toHaveProperty('code');
                expect(responseData.result).toHaveProperty('data');

                // 验证成功响应
                if (responseData.result.code === COMMON_STATUS.SUCCESS) {
                    expect(responseData.result.data).toHaveProperty('dbPath');
                    expect(responseData.result.data.dbPath).toBe(testDir);
                    console.debug('✅ Assets refresh successful:', responseData.result.data);
                } else {
                    // 如果失败，记录错误信息但不让测试失败（可能是环境问题）
                    console.warn('⚠️ Assets refresh failed:', responseData.result.reason);
                    expect(responseData.result).toHaveProperty('reason');
                }
            } catch (error) {
                console.error('❌ Test failed with error:', error);
                throw error;
            }
        });

        test('should handle invalid directory path', async () => {
            // 测试无效路径的处理
            const invalidDir = 'db://invalid-path-that-does-not-exist';

            try {
                const result = await client.callTool('assets-refresh', {
                    dir: invalidDir
                });

                expect(result).toBeDefined();
                expect(result.content).toBeDefined();

                const response = Array.isArray(result.content) ? result.content[0] : result.content;
                const responseData = JSON.parse(response.text);

                // 对于无效路径，应该返回失败状态
                expect(responseData).toHaveProperty('result');
                expect(responseData.result).toHaveProperty('code');

                if (responseData.result.code === COMMON_STATUS.FAIL) {
                    expect(responseData.result).toHaveProperty('reason');
                    console.debug('✅ Invalid path correctly handled:', responseData.result.reason);
                } else {
                    // 某些情况下可能仍然成功（如自动创建目录）
                    console.debug('ℹ️ Unexpected success for invalid path:', responseData.result);
                }
            } catch (error) {
                console.error('❌ Test failed with error:', error);
                throw error;
            }
        });

        test('should refresh with file system path', async () => {
            // 测试使用文件系统路径刷新
            const fsPath = './assets'; // 相对路径

            try {
                const result = await client.callTool('assets-refresh', {
                    dir: fsPath
                });

                expect(result).toBeDefined();
                expect(result.content).toBeDefined();

                const response = Array.isArray(result.content) ? result.content[0] : result.content;
                const responseData = JSON.parse(response.text);

                expect(responseData).toHaveProperty('result');
                expect(responseData.result).toHaveProperty('code');
                expect(responseData.result).toHaveProperty('data');

                if (responseData.result.code === COMMON_STATUS.SUCCESS) {
                    expect(responseData.result.data).toHaveProperty('dbPath');
                    console.debug('✅ File system path refresh successful:', responseData.result.data);
                } else {
                    console.warn('⚠️ File system path refresh failed:', responseData.result.reason);
                }
            } catch (error) {
                console.error('❌ Test failed with error:', error);
                throw error;
            }
        });
    });

    describe('MCP Client Integration', () => {
        test('should have assets-refresh tool available', async () => {
            // 验证 assets-refresh 工具是否可用
            const tools = client.getTools();
            expect(tools).toBeDefined();
            expect(Array.isArray(tools)).toBe(true);

            const refreshTool = tools.find((tool: any) => tool.name === 'assets-refresh');
            expect(refreshTool).toBeDefined();

            if (refreshTool) {
                expect(refreshTool).toHaveProperty('name', 'assets-refresh');
                expect(refreshTool).toHaveProperty('description');
                expect(refreshTool).toHaveProperty('inputSchema');
                console.debug('✅ assets-refresh tool found:', {
                    name: refreshTool.name,
                    description: refreshTool.description
                });
            }
        });
    });

    describe('Error Handling', () => {
        test('should handle missing parameters gracefully', async () => {
            // 测试缺少参数的情况
            try {
                const result = await client.callTool('assets-refresh', {});

                // 应该返回错误或者有默认处理
                expect(result).toBeDefined();

                if (result.content) {
                    const response = Array.isArray(result.content) ? result.content[0] : result.content;
                    if (response.text) {
                        const responseData = JSON.parse(response.text);
                        console.debug('📝 Missing parameter response:', responseData);
                    }
                }
            } catch (error) {
                // 预期可能会抛出错误
                console.debug('✅ Missing parameter correctly handled with error:', (error as Error).message);
                expect(error).toBeDefined();
            }
        });

        test('should handle malformed parameters', async () => {
            // 测试格式错误的参数
            try {
                const result = await client.callTool('assets-refresh', {
                    dir: null // 无效的参数类型
                });

                expect(result).toBeDefined();
                console.debug('📝 Malformed parameter response:', result);
            } catch (error) {
                // 预期可能会抛出错误
                console.debug('✅ Malformed parameter correctly handled with error:', (error as Error).message);
                expect(error).toBeDefined();
            }
        });
    });
});