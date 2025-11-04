import { setupMCPTestEnvironment, teardownMCPTestEnvironment, MCPTestContext } from '../helpers/test-utils';
import { MCPTestClient } from '../helpers/mcp-client';
import { E2E_PORTS } from '../config';

describe('MCP Server', () => {
    let context: MCPTestContext;

    beforeAll(async () => {
        // 使用共享的 MCP 服务器
        context = await setupMCPTestEnvironment();
    });

    afterAll(async () => {
        // 注意：不关闭共享的 MCP 服务器，由全局 teardown 统一清理
        await teardownMCPTestEnvironment(context);
    });

    test('should start MCP server successfully', async () => {
        // 服务器启动在 beforeAll 中，如果到这里说明启动成功
        expect(context.mcpClient).toBeDefined();
    });

    test('should list available tools', async () => {
        const tools = await context.mcpClient.listTools();

        expect(tools).toBeDefined();
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);

        // 验证必要的工具存在
        const toolNames = tools.map((t: any) => t.name);
        expect(toolNames).toContain('builder-build');
        expect(toolNames).toContain('builder-query-default-build-config');
    });

    test('should handle client connection', async () => {
        // 测试客户端连接
        const tools = await context.mcpClient.listTools();
        expect(tools).toBeDefined();
    });

    test('should start server on specified port', async () => {
        // 使用配置的测试端口
        const customPort = E2E_PORTS.TEST_PORT;

        // 创建新的客户端实例，指定端口（用于测试自定义端口功能）
        const customClient = new MCPTestClient({
            projectPath: context.testProject.path,
            port: customPort,
        });

        try {
            await customClient.start();

            // 验证服务器在指定端口上启动
            expect(customClient.getPort()).toBe(customPort);

            // 验证服务器功能正常
            const tools = await customClient.listTools();
            expect(tools).toBeDefined();
            expect(Array.isArray(tools)).toBe(true);
            expect(tools.length).toBeGreaterThan(0);
        } finally {
            // 清理：关闭自定义端口的服务器（这是独立的测试服务器，需要关闭）
            await customClient.close();
        }
    });
});
