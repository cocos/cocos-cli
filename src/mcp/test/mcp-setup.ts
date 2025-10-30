import { join } from 'path';
import { CocosAPI } from '../../api';
import { getServerUrl, register } from '../../server';
import { McpMiddleware } from '../mcp.middleware';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { EngineLoader } from 'cc/loader';
import { TestGlobalEnv } from '../../tests/global-env';

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
// MCP Server 启动函数
export async function startMCPServer(folder: string) {
    const cocosAPI = new CocosAPI();
    await cocosAPI.startup(folder);

    const middleware = new McpMiddleware();
    register('mcp', middleware.getMiddlewareContribution());
    const url = getServerUrl();
    return { cocosAPI, middleware, url };
}

// MCP Client 类
export class MCPClient {
    private mcp: Client;
    private transport: StreamableHTTPClientTransport | null = null;
    private tools: any[] = [];
    private isConnected: boolean = false;

    constructor() {
        this.mcp = new Client({ name: 'mcp-client-test', version: '1.0.0' });
    }

    /**
     * 连接到 MCP 服务器
     * @param port MCP 服务器端口
     **/
    async connect(url: string): Promise<void> {
        try {
            // 创建 HTTP 传输
            this.transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`));
            // 连接到服务器
            await this.mcp.connect(this.transport);
            this.isConnected = true;

            // 获取可用工具
            const toolsResult = await this.mcp.listTools();
            this.tools = toolsResult.tools || [];

            console.log(`Connected to MCP server. Available tools: ${this.tools.length}`);
        } catch (error) {
            console.error('Failed to connect to MCP server:', error);
            throw error;
        }
    }

    /**
     * 断开连接
     */
    async disconnect(): Promise<void> {
        if (this.transport) {
            await this.transport.close();
            this.transport = null;
        }
        this.isConnected = false;
    }

    /**
     * 获取可用工具列表
     */
    getTools(): any[] {
        return this.tools;
    }

    /**
     * 调用工具
     * @param toolName 工具名称
     * @param args 工具参数
     */
    async callTool(toolName: string, args: any = {}): Promise<any> {
        if (!this.isConnected) {
            throw new Error('Not connected to MCP server');
        }

        try {
            const result = await this.mcp.callTool({
                name: toolName,
                arguments: args,
            });
            return result;
        } catch (error) {
            console.error(`Failed to call tool ${toolName}:`, error);
            throw error;
        }
    }

    /**
     * 获取连接状态
     */
    isClientConnected(): boolean {
        return this.isConnected;
    }

    /**
     * 获取 MCP 客户端实例
     */
    getClient(): Client {
        return this.mcp;
    }
}

// 测试辅助函数
export class MCPTestHelper {
    private server: { cocosAPI: CocosAPI; middleware: McpMiddleware } | null = null;
    private client: MCPClient | null = null;

    /**
     * 设置测试环境
     * @param projectPath 项目路径
     * @param port 端口号（可选）
     */
    async setupTest(projectPath: string): Promise<{ url: string; server: any; client: MCPClient }> {
        try {
            // 启动 MCP 服务器
            const { cocosAPI, middleware, url } = await startMCPServer(projectPath);
            this.server = { cocosAPI, middleware };

            // 创建并连接客户端
            this.client = new MCPClient();

            // 注意：这里需要根据实际的服务器启动方式来调整连接参数
            // 如果服务器是通过 stdio 启动的，需要提供正确的命令和参数

            return {
                url,
                server: this.server,
                client: this.client
            };
        } catch (error) {
            console.error('Failed to setup MCP test environment:', error);
            throw error;
        }
    }

    /**
     * 清理测试环境
     */
    async teardownTest(): Promise<void> {
        try {
            if (this.client) {
                await this.client.disconnect();
                this.client = null;
            }

            if (this.server) {
                // 这里可以添加服务器清理逻辑
                this.server = null;
            }
        } catch (error) {
            console.error('Failed to teardown MCP test environment:', error);
        }
    }

    /**
     * 获取客户端实例
     */
    getClient(): MCPClient | null {
        return this.client;
    }

    /**
     * 获取服务器实例
     */
    getServer(): any {
        return this.server;
    }
}

// 导出默认实例
const mcpTestHelper = new MCPTestHelper();

export async function getClient(): Promise<MCPClient | null> {
    let client = mcpTestHelper.getClient();
    if (!client) {
        const { url, client: cli } = await mcpTestHelper.setupTest(TestGlobalEnv.projectRoot);
        // 连接客户端
        await cli.connect(url);
        client = cli;
    }
    return client;
}
