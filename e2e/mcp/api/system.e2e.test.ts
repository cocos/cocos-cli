import { MCPTestClient } from '../../helpers/mcp-client';
import {
  MCPTestContext,
  setupMCPTestEnvironment,
  teardownMCPTestEnvironment,
} from '../../helpers/test-utils';

describe('MCP System API', () => {
    let context: MCPTestContext;
    let mcpClient: MCPTestClient;

    beforeAll(async () => {
        // 使用共享的 MCP 测试环境
        context = await setupMCPTestEnvironment();
        mcpClient = context.mcpClient;
    });

    afterAll(async () => {
        // 注意：不关闭共享的 MCP 服务器，由全局 teardown 统一清理
        await teardownMCPTestEnvironment(context);
    });

    describe('system-query-logs', () => {
        test('should query recent logs with default level', async () => {
            const result = await mcpClient.callTool('system-query-logs', {
                queryParam: { number: 10 },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
            expect(Array.isArray(result.data)).toBe(true);
            expect(result.data.length).toBeLessThanOrEqual(10);
            if (result.data.length > 0) {
                expect(typeof result.data[0]).toBe('string');
                // 未指定级别时，返回包含类型前缀的日志
                expect(result.data[0]).toMatch(/^\[(LOG|WARN|ERROR|DEBUG|INFO|SUCCESS|READY|START)\]/);
            }
        });

        test('should filter logs by specific level', async () => {
            const result = await mcpClient.callTool('system-query-logs', {
                queryParam: { number: 10, logLevel: 'log' },
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();
            expect(Array.isArray(result.data)).toBe(true);
            expect(result.data.length).toBeLessThanOrEqual(10);
        });
    });
});
