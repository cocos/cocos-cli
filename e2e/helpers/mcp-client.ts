import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { E2E_TIMEOUTS } from '../config';

export interface MCPServerOptions {
    projectPath: string;
    port?: number; // 可选，不传则由服务器自动选择端口
    startTimeout?: number; // 启动超时时间（毫秒），默认使用 E2E_TIMEOUTS.SERVER_START
}

export interface MCPToolResult {
    code: number;
    data?: any;
    reason?: string;
}

/**
 * MCP 客户端封装
 * 用于测试 MCP 服务器 API
 * 
 * CLI 路径来源：
 * 1. 内部环境变量 __E2E_CLI_PATH__（由 setup.ts 设置）
 * 2. 默认路径 ../../dist/cli.js
 */
export class MCPTestClient {
    private client: Client | null = null;
    private transport: StreamableHTTPClientTransport | null = null;
    private serverProcess: ChildProcess | null = null;
    private forceKillTimer: NodeJS.Timeout | null = null;
    private projectPath: string;
    private port: number;
    private cliPath: string;
    private startTimeout: number;

    constructor(options: MCPServerOptions) {
        this.projectPath = options.projectPath;
        this.port = options.port || 0; // 0 表示自动选择端口
        this.startTimeout = options.startTimeout || E2E_TIMEOUTS.SERVER_START;

        // 从内部环境变量读取 CLI 路径（由 globalSetup 设置）
        if (process.env.__E2E_CLI_PATH__) {
            this.cliPath = process.env.__E2E_CLI_PATH__;
        } else {
            // Fallback 到默认路径
            this.cliPath = resolve(__dirname, '../../dist/cli.js');
        }

        // 验证路径
        if (!existsSync(this.cliPath)) {
            throw new Error(
                `CLI not found: ${this.cliPath}\n` +
                `Please build the project first: npm run build\n` +
                `Or specify CLI path: npm run test:e2e -- --cli /path/to/cli.js`
            );
        }
    }

    /**
     * 获取当前使用的 CLI 路径
     */
    getCliPath(): string {
        return this.cliPath;
    }

    /**
     * 获取服务器实际使用的端口号
     * （如果是自动分配的端口，需要在 start() 后调用）
     */
    getPort(): number {
        return this.port;
    }

    /**
     * 启动 MCP 服务器并连接客户端
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`🚀 Starting MCP server for project: ${this.projectPath}`);

            const args = [
                this.cliPath,
                'start-mcp-server',
                '--project',
                this.projectPath,
            ];

            // 只在显式指定端口时才传递 --port 参数
            if (this.port > 0) {
                args.push('--port', this.port.toString());
                console.log(`   Using specified port: ${this.port}`);
            } else {
                console.log(`   Using auto-assigned port`);
            }

            // 启动服务器进程
            this.serverProcess = spawn('node', args, {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let serverReady = false;
            const timeout = setTimeout(() => {
                if (!serverReady) {
                    reject(new Error(`MCP server start timeout after ${this.startTimeout}ms`));
                }
            }, this.startTimeout);

            // 监听服务器输出，判断是否启动成功
            this.serverProcess.stdout?.on('data', (data) => {
                const output = data.toString();

                // 🔍 DEBUG: 输出所有服务器日志
                console.log('[MCP Server stdout]:', output);

                // 从日志中解析端口号："Server is running on: http://localhost:PORT"
                const portMatch = output.match(/Server is running on:.*:(\d+)/);
                if (portMatch) {
                    const actualPort = parseInt(portMatch[1], 10);
                    if (this.port === 0) {
                        // 如果是自动选择端口，更新端口号
                        this.port = actualPort;
                        console.log(`✅ MCP server started on auto-assigned port: ${actualPort}`);
                    }
                }

                // 检查服务器启动成功的标志
                if (output.includes('MCP Server started') || output.includes('Server listening') || output.includes('Server is running on:')) {
                    serverReady = true;
                    clearTimeout(timeout);

                    // 等待一小段时间确保服务器完全就绪，然后连接客户端
                    setTimeout(() => {
                        this.connectClient()
                            .then(() => resolve())
                            .catch(reject);
                    }, 1000);
                }
            });

            this.serverProcess.stderr?.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Debugger')) {
                    return;
                }
                // 🔍 DEBUG: 输出所有错误日志（包括调试信息和警告）
                console.error('[MCP Server stderr]:', output);
            });

            this.serverProcess.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            this.serverProcess.on('exit', (code) => {
                if (!serverReady) {
                    clearTimeout(timeout);
                    reject(new Error(`Server exited with code ${code} before ready`));
                }
            });
        });
    }

    /**
     * 连接客户端到服务器（通过 HTTP）
     */
    private async connectClient(): Promise<void> {
        console.log(`📡 Connecting MCP client via HTTP to port ${this.port}...`);

        // 创建 HTTP 传输层（构造函数接受 URL 对象）
        const mcpUrl = new URL(`http://localhost:${this.port}/mcp`);
        this.transport = new StreamableHTTPClientTransport(mcpUrl);

        // 创建客户端
        this.client = new Client({
            name: 'e2e-test-client',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });

        // 连接客户端到服务器
        await this.client.connect(this.transport);

        console.log(`✅ MCP client connected successfully!`);
    }

    /**
     * 调用工具
     * @param name 工具名称
     * @param args 工具参数
     * @param timeout 请求超时时间（毫秒），默认使用 E2E_TIMEOUTS.MCP_REQUEST
     */
    async callTool(
        name: string,
        args: Record<string, any> = {},
        timeout: number = E2E_TIMEOUTS.MCP_REQUEST
    ): Promise<MCPToolResult> {
        if (!this.client) {
            throw new Error('Client not connected. Call start() first.');
        }

        try {
            console.log(`[MCP callTool] ${name} with timeout=${timeout}ms, args:`, JSON.stringify(args, null, 2));

            // 注意：callTool 的参数顺序是 (params, resultSchema, options)
            const result = await this.client.callTool(
                {
                    name,
                    arguments: args,
                },
                undefined, // resultSchema - 使用默认的
                {
                    timeout, // ✅ 设置请求超时
                }
            );

            console.log(`[MCP callTool] ${name} response:`, JSON.stringify(result, null, 2));

            // 解析结果
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const content = result.content[0];
                if (content.type === 'text') {
                    const data = JSON.parse(content.text);

                    // ✅ MCP 中间件会将结果包装在 { result: ... } 中
                    // 如果存在 result 字段，解包它
                    if (data && typeof data === 'object' && 'result' in data) {
                        return data.result;
                    }

                    return data;
                }
            }

            return {
                code: 500,
                reason: 'Invalid response format',
            };
        } catch (error) {
            console.error(`[MCP callTool] ${name} error:`, error);
            return {
                code: 500,
                reason: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 列出可用工具
     * @param timeout 请求超时时间（毫秒），默认使用 E2E_TIMEOUTS.MCP_LIST
     */
    async listTools(timeout: number = E2E_TIMEOUTS.MCP_LIST): Promise<any[]> {
        if (!this.client) {
            throw new Error('Client not connected. Call start() first.');
        }

        const result = await this.client.listTools({}, {
            timeout, // 设置请求超时
        });
        return result.tools;
    }

    /**
     * 关闭客户端和服务器
     */
    async close(): Promise<void> {
        console.log(`🛑 Closing MCP client...`);

        if (this.client) {
            try {
                await this.client.close();
                console.log(`   Client closed`);
            } catch (error) {
                console.error(`   Error closing client:`, error);
            }
            this.client = null;
        }

        if (this.transport) {
            try {
                await this.transport.close();
                console.log(`   Transport closed`);
            } catch (error) {
                console.error(`   Error closing transport:`, error);
            }
            this.transport = null;
        }

        if (this.serverProcess) {
            return new Promise((resolve) => {
                this.serverProcess!.on('exit', () => {
                    // 清理强制杀死定时器
                    if (this.forceKillTimer) {
                        clearTimeout(this.forceKillTimer);
                        this.forceKillTimer = null;
                    }
                    console.log(`   Server process exited`);
                    resolve();
                });

                // 发送 SIGTERM
                this.serverProcess!.kill('SIGTERM');

                // 超时后如果还没退出，强制杀死
                this.forceKillTimer = setTimeout(() => {
                    if (this.serverProcess && this.serverProcess.exitCode === null) {
                        console.log(`   Force killing server process`);
                        this.serverProcess.kill('SIGKILL');
                    }
                    this.forceKillTimer = null;
                }, E2E_TIMEOUTS.FORCE_KILL);
            });
        }

        console.log(`✅ MCP client closed`);
    }
}

