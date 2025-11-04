import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { E2E_TIMEOUTS, E2E_DEBUG } from '../config';
import type { MCPToolsMap, MCPResponse } from '../types/mcp-tools.generated';

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
    private startTimeoutTimer: NodeJS.Timeout | null = null;
    private connectTimer: NodeJS.Timeout | null = null;
    private projectPath: string;
    private port: number;
    private cliPath: string;
    private startTimeout: number;
    private serverReady: boolean = false;

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
            if (E2E_DEBUG) {
                console.log(`🚀 Starting MCP server for project: ${this.projectPath}`);
            }

            const args = [
                this.cliPath,
                'start-mcp-server',
                '--project',
                this.projectPath,
            ];

            // 只在显式指定端口时才传递 --port 参数
            if (this.port > 0) {
                args.push('--port', this.port.toString());
                if (E2E_DEBUG) {
                    console.log(`   Using specified port: ${this.port}`);
                }
            } else {
                if (E2E_DEBUG) {
                    console.log(`   Using auto-assigned port`);
                }
            }

            // 启动服务器进程
            this.serverProcess = spawn('node', args, {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            this.serverReady = false;
            this.startTimeoutTimer = setTimeout(() => {
                if (!this.serverReady) {
                    this.startTimeoutTimer = null;
                    reject(new Error(`MCP server start timeout after ${this.startTimeout}ms`));
                }
            }, this.startTimeout);

            // 监听服务器输出，判断是否启动成功
            this.serverProcess.stdout?.on('data', (data) => {
                const output = data.toString();

                if (E2E_DEBUG) {
                    console.log('[MCP Server stdout]:', output);
                }

                // 从日志中解析端口号："Server is running on: http://localhost:PORT"
                const portMatch = output.match(/Server is running on:.*:(\d+)/);
                if (portMatch) {
                    const actualPort = parseInt(portMatch[1], 10);
                    if (this.port === 0) {
                        // 如果是自动选择端口，更新端口号
                        this.port = actualPort;
                        if (E2E_DEBUG) {
                            console.log(`✅ MCP server started on auto-assigned port: ${actualPort}`);
                        }
                    }
                }

                // 检查服务器启动成功的标志
                if (output.includes('MCP Server started') || output.includes('Server listening') || output.includes('Server is running on:')) {
                    if (!this.serverReady) {
                        this.serverReady = true;
                        if (this.startTimeoutTimer) {
                            clearTimeout(this.startTimeoutTimer);
                            this.startTimeoutTimer = null;
                        }

                        // 等待一小段时间确保服务器完全就绪，然后连接客户端
                        this.connectTimer = setTimeout(() => {
                            this.connectTimer = null;
                            this.connectClient()
                                .then(() => resolve())
                                .catch(reject);
                        }, 1000);
                    }
                }
            });

            this.serverProcess.stderr?.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Debugger')) {
                    return;
                }
                if (E2E_DEBUG) {
                    console.error('[MCP Server stderr]:', output);
                }
            });

            this.serverProcess.on('error', (error) => {
                if (this.startTimeoutTimer) {
                    clearTimeout(this.startTimeoutTimer);
                    this.startTimeoutTimer = null;
                }
                if (this.connectTimer) {
                    clearTimeout(this.connectTimer);
                    this.connectTimer = null;
                }
                reject(error);
            });

            this.serverProcess.on('exit', (code) => {
                if (!this.serverReady) {
                    if (this.startTimeoutTimer) {
                        clearTimeout(this.startTimeoutTimer);
                        this.startTimeoutTimer = null;
                    }
                    if (this.connectTimer) {
                        clearTimeout(this.connectTimer);
                        this.connectTimer = null;
                    }
                    reject(new Error(`Server exited with code ${code} before ready`));
                }
            });
        });
    }

    /**
     * 连接客户端到服务器（通过 HTTP）
     */
    private async connectClient(): Promise<void> {
        if (E2E_DEBUG) {
            console.log(`📡 Connecting MCP client via HTTP to port ${this.port}...`);
        }

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

        if (E2E_DEBUG) {
            console.log(`✅ MCP client connected successfully!`);
        }
    }

    /**
     * 调用工具（类型安全版本）
     * 
     * @example
     * ```typescript
     * // ✅ 自动推断参数类型和返回值类型
     * const result = await mcpClient.callTool('assets-create-asset', {
     *   options: { target: 'db://assets/test.txt', content: 'hello' }
     * });
     * // result 的类型会自动推断为 MCPResponse<TCreatedAssetResult>
     * ```
     */
    async callTool<TName extends keyof MCPToolsMap>(
        name: TName,
        args: MCPToolsMap[TName]['params'],
        timeout?: number
    ): Promise<MCPResponse<MCPToolsMap[TName]['result']>> {
        timeout = timeout ?? E2E_TIMEOUTS.MCP_REQUEST;
        if (!this.client) {
            throw new Error('Client not connected. Call start() first.');
        }

        try {
            if (E2E_DEBUG) {
                console.log(`[MCP callTool] ${name} with timeout=${timeout}ms, args:`, JSON.stringify(args, null, 2));
            }

            // 注意：callTool 的参数顺序是 (params, resultSchema, options)
            const result = await this.client.callTool(
                {
                    name,
                    arguments: args as Record<string, unknown>,
                },
                undefined, // resultSchema - 使用默认的
                {
                    timeout, // ✅ 设置请求超时
                }
            );

            if (E2E_DEBUG) {
                console.log(`[MCP callTool] ${name} raw response:`, JSON.stringify(result, null, 2));
            }

            // MCP 服务器返回格式：{ content: [{ type: 'text', text: '...' }] }
            // text 内容是序列化的 JSON: { result: { code, data?, reason? } }
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const content = result.content[0];
                if (content.type === 'text') {
                    try {
                        // 解析 JSON 字符串
                        const parsed = JSON.parse(content.text);
                        if (E2E_DEBUG) {
                            console.log(`[MCP callTool] ${name} parsed response:`, JSON.stringify(parsed, null, 2));
                        }

                        // MCP 中间件用 { result: ... } 包装了 API 返回值
                        if (parsed && typeof parsed === 'object' && 'result' in parsed) {
                            const apiResult = parsed.result;

                            // 验证 API 返回值格式 { code, data?, reason? }
                            if (apiResult && typeof apiResult === 'object' && typeof apiResult.code === 'number') {
                                return apiResult as MCPResponse<MCPToolsMap[TName]['result']>;
                            }
                        }

                        // 如果格式不对，返回错误
                        if (E2E_DEBUG) {
                            console.warn(`[MCP callTool] ${name} unexpected response format:`, parsed);
                        }
                        return {
                            code: 500,
                            data: undefined,
                            reason: 'Unexpected response format from MCP server',
                        } as any;
                    } catch {
                        // JSON 解析失败
                        if (E2E_DEBUG) {
                            console.error(`[MCP callTool] ${name} failed to parse response:`, content.text);
                        }
                        return {
                            code: 500,
                            data: undefined,
                            reason: `Failed to parse response: ${content.text}`,
                        } as any;
                    }
                }
            }

            // 返回格式不符合预期
            return {
                code: 500,
                data: undefined,
                reason: 'Invalid MCP response format',
            } as any;
        } catch (error) {
            // 处理错误，提供更详细的错误信息
            if (E2E_DEBUG) {
                console.error(`[MCP callTool] ${name} error:`, error);
            }

            // 尝试从错误中提取有用信息
            let errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            // 处理常见的网络错误，提供更友好的提示
            if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
                // 检查是否是参数验证错误导致的
                // 如果参数验证失败，服务器可能返回 400 或 500，导致 fetch failed
                const paramsStr = JSON.stringify(args, null, 2);
                errorMessage = `网络请求失败 (${name}):\n` +
                    `可能的原因：\n` +
                    `  1. 参数验证失败：请检查传入的参数是否与 inputSchema 匹配\n` +
                    `  2. 服务器连接失败：请确保 MCP 服务器正在运行\n` +
                    `  3. 参数格式错误：请检查参数类型和必需字段\n` +
                    `\n传入的参数:\n${paramsStr}\n` +
                    `\n原始错误: ${errorMessage}`;
                
                if (errorStack) {
                    errorMessage += `\n\n堆栈跟踪:\n${errorStack}`;
                }
            }

            // 如果错误信息已经包含详细的验证错误，直接使用
            if (errorMessage.includes('参数验证失败')) {
                // 保持原有的详细错误信息
            }

            return {
                code: 500,
                data: undefined,
                reason: errorMessage,
            } as any;
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
        // 清理所有定时器
        if (this.startTimeoutTimer) {
            clearTimeout(this.startTimeoutTimer);
            this.startTimeoutTimer = null;
        }
        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }

        if (this.client) {
            try {
                await this.client.close();
                if (E2E_DEBUG) {
                    console.log(`   Client closed`);
                }
            } catch (error) {
                if (E2E_DEBUG) {
                    console.error(`   Error closing client:`, error);
                }
            }
            this.client = null;
        }

        if (this.transport) {
            try {
                await this.transport.close();
                if (E2E_DEBUG) {
                    console.log(`   Transport closed`);
                }
            } catch (error) {
                if (E2E_DEBUG) {
                    console.error(`   Error closing transport:`, error);
                }
            }
            this.transport = null;
        }

        if (this.serverProcess) {
            // 移除所有事件监听器，避免内存泄漏
            this.serverProcess.stdout?.removeAllListeners();
            this.serverProcess.stderr?.removeAllListeners();
            this.serverProcess.removeAllListeners();

            return new Promise((resolve) => {
                const onExit = () => {
                    // 清理强制杀死定时器
                    if (this.forceKillTimer) {
                        clearTimeout(this.forceKillTimer);
                        this.forceKillTimer = null;
                    }
                    if (E2E_DEBUG) {
                        console.log(`   Server process exited`);
                    }
                    this.serverProcess = null;
                    resolve();
                };

                this.serverProcess!.once('exit', onExit);

                // 发送 SIGTERM
                this.serverProcess!.kill('SIGTERM');

                // 超时后如果还没退出，强制杀死
                this.forceKillTimer = setTimeout(() => {
                    if (this.serverProcess && this.serverProcess.exitCode === null) {
                        if (E2E_DEBUG) {
                            console.log(`   Force killing server process`);
                        }
                        this.serverProcess.kill('SIGKILL');
                        // 强制杀死后，等待进程退出
                        setTimeout(() => {
                            if (this.forceKillTimer) {
                                clearTimeout(this.forceKillTimer);
                                this.forceKillTimer = null;
                            }
                            this.serverProcess = null;
                            resolve();
                        }, 100);
                    } else {
                        if (this.forceKillTimer) {
                            clearTimeout(this.forceKillTimer);
                            this.forceKillTimer = null;
                        }
                    }
                }, E2E_TIMEOUTS.FORCE_KILL);
            });
        }

        this.serverReady = false;

        if (E2E_DEBUG) {
            console.log(`✅ MCP client closed`);
        }
    }
}

