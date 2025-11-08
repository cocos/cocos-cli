import type { IMiddlewareContribution } from '../server/interfaces';
import { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toolRegistry } from '../api/decorator/decorator';
import { z } from 'zod';
import * as pkgJson from '../../package.json';
import { join } from 'path';
import { ResourceManager } from './resources';
import { HTTP_STATUS } from '../api/base/schema-base';
import type { HttpStatusCode } from '../api/base/schema-base';
import stripAnsi from 'strip-ansi';

export class McpMiddleware {
    private server: McpServer;
    private resourceManager: ResourceManager;

    constructor() {
        // 创建 MCP server
        this.server = new McpServer({
            name: 'cocos-cli-mcp-server',
            version: pkgJson.version || '0.0.0',
        }, {
            capabilities: {
                resources: {
                    subscribe: true,
                    listChanged: true,
                    templates: false
                },
                tools: {},
                // 日志能力（调试用）
                logging: {},
            }
        });

        // 初始化资源管理器
        const docsPath = join(__dirname, '../../docs');
        this.resourceManager = new ResourceManager(docsPath);

        // 注册资源和工具
        this.registerDecoratorTools();
        this.registerResourcesList();
    }

    private registerResourcesList() {
        // 使用资源管理器加载所有资源
        const resources = this.resourceManager.loadAllResources();

        // 批量注册资源
        resources.forEach((resource) => {
            this.server.resource(resource.name, resource.uri, {
                title: resource.title,
                mimeType: resource.mimeType
            }, async (_uri: URL, extra) => {
                // 根据客户端地区选择语言
                const preferredLanguage = this.resourceManager.detectClientLanguage(extra);

                // 动态读取文件内容
                const textContent = this.resourceManager.readFileContent(resource, preferredLanguage);

                return {
                    contents: [{
                        uri: resource.uri,
                        text: textContent,
                        mimeType: resource.mimeType
                    }]
                };
            });
        });
    }

    /**
     * 注册 mcp tools
     */
    private registerDecoratorTools() {
        Array.from(toolRegistry.entries()).forEach(([toolName, { target, meta }]) => {
            try {
                // 构建输入 schema
                const inputSchemaFields: Record<string, z.ZodTypeAny> = {};
                meta.paramSchemas
                    .sort((a, b) => a.index - b.index)
                    .forEach(param => {
                        if (param.name) {
                            inputSchemaFields[param.name] = param.schema;
                        }
                    });

                // 构建输出 schema - 如果有返回 schema，使用它，否则使用 any
                const outputSchemaFields = meta.returnSchema ? { result: meta.returnSchema } : { result: z.any() };

                // 注册工具
                this.server.registerTool(
                    toolName,
                    {
                        title: meta.title || toolName,
                        description: meta.description || `Tool: ${toolName}`,
                        inputSchema: inputSchemaFields,
                        outputSchema: outputSchemaFields
                    },
                    async (params: any) => {
                        try {
                            // 注意：参数验证已经由 MCP SDK 在调用回调之前完成
                            // 如果到达这里，说明参数已经通过了 inputSchema 验证
                            
                            // 准备方法参数
                            const methodArgs = this.prepareMethodArguments(meta, params);

                            // 调用实际的工具方法
                            const result = await this.callToolMethod(target, meta, methodArgs);
                            // 格式化返回结果
                            const formattedResult = this.formatToolResult(meta, result);

                            // 构建符合 schema 的 structuredContent
                            let structuredContent: any;
                            if (meta.returnSchema) {
                                try {
                                    const validatedResult = meta.returnSchema.parse(result);
                                    structuredContent = { result: validatedResult };
                                } catch {
                                    structuredContent = { result: result };
                                }
                            } else {
                                structuredContent = { result: result };
                            }
                            console.debug(`call ${toolName} with args:${methodArgs.toString()} result: ${formattedResult}`);
                            return {
                                content: [{ type: 'text', text: formattedResult }],
                                structuredContent: structuredContent
                            };
                        } catch (error) {
                            // 捕获所有错误，返回标准错误格式
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            const errorStack = error instanceof Error ? error.stack : undefined;
                            
                            // 构建详细的错误信息
                            let detailedReason = `Tool execution failed (${toolName}): ${errorMessage}`;
                            if (errorStack && process.env.NODE_ENV === 'development') {
                                detailedReason += `\n\nStack trace:\n${errorStack}`;
                            }
                            detailedReason += `\n\nParameters passed:\n${JSON.stringify(params, null, 2)}`;
                            
                            console.error(`[MCP] ${detailedReason}`);
                            
                            // 返回标准错误格式，使用 500 表示服务器错误
                            const errorResult: { code: HttpStatusCode; data?: any; reason?: string } = {
                                code: HTTP_STATUS.INTERNAL_SERVER_ERROR,
                                data: undefined,
                                reason: detailedReason,
                            };
                            
                            const formattedResult = JSON.stringify({ result: errorResult }, null, 2);
                            return {
                                content: [{ type: 'text', text: formattedResult }],
                                structuredContent: { result: errorResult }
                            };
                        }
                    }
                );
            } catch (error) {
                console.error(`Failed to register tool ${toolName}:`, error);
            }
        });
    }

    /**
     * 准备方法参数
     */
    private prepareMethodArguments(meta: any, args: any): any[] {
        if (!meta.paramSchemas || meta.paramSchemas.length === 0) {
            return [];
        }

        const methodArgs: any[] = [];
        const sortedParams = meta.paramSchemas.sort((a: any, b: any) => a.index - b.index);

        for (const param of sortedParams) {
            const paramName = param.name || `param${param.index}`;
            const value = args[paramName];

            try {
                // 使用 Zod schema 验证和转换参数
                const validatedValue = param.schema.parse(value);
                methodArgs[param.index] = validatedValue;
            } catch (error) {
                console.error(`Parameter validation failed for ${paramName}:`, error);
                // 使用原始值
                methodArgs[param.index] = value;
            }
        }

        return methodArgs;
    }

    /**
     * 调用工具方法
     */
    private async callToolMethod(target: any, meta: any, args: any[]): Promise<any> {
        // 获取或创建实例
        const instance = await this.getToolInstance(target);

        // 获取方法
        const method = instance[meta.methodName];
        if (typeof method !== 'function') {
            throw new Error(`Method ${String(meta.methodName)} not found on instance`);
        }

        // 调用方法
        return await method.apply(instance, args);
    }

    /**
     * 获取工具实例
     */
    private async getToolInstance(target: any): Promise<any> {
        // 如果 target 已经是实例，直接返回
        if (typeof target === 'object' && target !== null) {
            return target;
        }

        throw new Error('Unable to create tool instance');
    }

    /**
     * 格式化工具结果
     */
    private formatToolResult(meta: any, result: any): string {
        // 构建符合 schema 的结果结构，用 result 字段包装
        if (meta.returnSchema) {
            // 验证结果是否符合预期的 schema
            try {
                if (result.reason) {
                    result.reason = stripAnsi(result.reason);
                }
                const validatedResult = meta.returnSchema.parse(result);
                return JSON.stringify({ result: validatedResult }, null, 2);
            } catch (error) {
                throw new Error(`Tool result validation failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return JSON.stringify({ result: result }, null, 2);
    }

    private async handleMcpRequest(req: Request, res: Response): Promise<void> {
        try {
            // 为每个请求创建新的传输层以防止请求 ID 冲突
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true
            });

            res.on('close', () => {
                transport.close();
            });

            await this.server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('MCP request handling error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    private async handleSseRequest(req: Request, res: Response): Promise<void> {
        try {
            // 设置 SSE 响应头
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

            // 为 SSE 连接创建传输层
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: false // SSE 不需要 JSON 响应
            });

            // 处理连接关闭
            res.on('close', () => {
                transport.close();
            });

            req.on('close', () => {
                transport.close();
            });

            // 连接到 MCP 服务器
            await this.server.connect(transport);
            
            // 处理 SSE 请求
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('MCP SSE request handling error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    }

    public getMiddlewareContribution(): IMiddlewareContribution {
        return {
            get: [
                {
                    url: '/mcp',
                    handler: this.handleSseRequest.bind(this)
                }
            ],
            post: [
                {
                    url: '/mcp',
                    handler: this.handleMcpRequest.bind(this)
                }
            ]
        };
    }
}
