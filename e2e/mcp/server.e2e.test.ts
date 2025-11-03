import { MCPTestClient } from '../helpers/mcp-client';
import { getSharedTestProject } from '../helpers/test-utils';
import { TestProject } from '../helpers/project-manager';
import { resolve } from 'path';
import { E2E_PORTS } from '../config';

describe('MCP Server', () => {
    let testProject: TestProject;
    let mcpClient: MCPTestClient;

    beforeAll(async () => {
        // 使用共享项目（只读测试，可以与其他测试复用）
        const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/asset-operation');
        testProject = await getSharedTestProject(fixtureProject, 'readonly-common');

        // 创建并启动 MCP 客户端（端口自动分配）
        mcpClient = new MCPTestClient({
            projectPath: testProject.path,
        });

        await mcpClient.start();
    });

    afterAll(async () => {
        // 关闭客户端和服务器
        if (mcpClient) {
            await mcpClient.close();
        }

        // 共享项目不需要立即清理，由测试框架统一清理
        await testProject.cleanup();
    });

    test('should start MCP server successfully', async () => {
        // 服务器启动在 beforeAll 中，如果到这里说明启动成功
        expect(mcpClient).toBeDefined();
    });

    test('should list available tools', async () => {
        const tools = await mcpClient.listTools();

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
        const tools = await mcpClient.listTools();
        expect(tools).toBeDefined();
    });

    test('should start server on specified port', async () => {
        // 使用配置的测试端口
        const customPort = E2E_PORTS.TEST_PORT;

        // 创建新的客户端实例，指定端口
        const customClient = new MCPTestClient({
            projectPath: testProject.path,
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
            // 清理：关闭自定义端口的服务器
            await customClient.close();
        }
    });
});
