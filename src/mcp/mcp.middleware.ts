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
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
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
                // --- 步骤 A: 构建 Zod Shape ---
                const inputSchemaFields: Record<string, z.ZodTypeAny> = {};
                meta.paramSchemas
                    .sort((a, b) => a.index - b.index)
                    .forEach(param => {
                        if (param.name) {
                            inputSchemaFields[param.name] = param.schema;
                        }
                    });
                
                // --- 步骤 B: 注册工具 ---
                // 使用 this.server.tool 注册，传入 Zod Shape 以便 SDK 进行验证
                this.server.tool(
                    toolName,
                    meta.description || `Tool: ${toolName}`,
                    inputSchemaFields,
                    async (args) => {
                        // args 已经是验证过的参数对象
                        try {
                            // 这里的 prepareMethodArguments 主要是为了按顺序排列参数给 apply 使用
                            // 注意：args 是对象，prepareMethodArguments 需要处理对象
                            const methodArgs = this.prepareMethodArguments(meta, args);
                            const result = await this.callToolMethod(target, meta, methodArgs);
                            
                            const formattedResult = this.formatToolResult(meta, result);
                            
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
                                content: [{ type: 'text' as const, text: formattedResult }],
                                structuredContent: structuredContent
                             };

                        } catch (error) {
                             const errorMessage = error instanceof Error ? error.message : String(error);
                             const errorStack = error instanceof Error ? error.stack : undefined;
                             
                             let detailedReason = `Tool execution failed (${toolName}): ${errorMessage}`;
                             if (errorStack && process.env.NODE_ENV === 'development') {
                                 detailedReason += `\n\nStack trace:\n${errorStack}`;
                             }
                             detailedReason += `\n\nParameters passed:\n${JSON.stringify(args, null, 2)}`;
                             
                             console.error(`[MCP] ${detailedReason}`);
                             
                             const errorResult: { code: HttpStatusCode; data?: any; reason?: string } = {
                                 code: HTTP_STATUS.INTERNAL_SERVER_ERROR,
                                 data: undefined,
                                 reason: detailedReason,
                             };
                             
                             const formattedResult = JSON.stringify({ result: errorResult }, null, 2);
                             return {
                                 content: [{ type: 'text' as const, text: formattedResult }],
                                 structuredContent: { result: errorResult },
                                 isError: true
                             };
                        }
                    }
                );
            } catch (error) {
                console.error(`Failed to register tool ${toolName}:`, error);
            }
        });

        // --- 步骤 C: 覆盖 tools/list 处理程序 ---
        // 为了支持 Gemini (不支持 $ref)，我们需要手动生成并返回 Gemini 兼容的 JSON Schema
        this.server.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = Array.from(toolRegistry.entries()).map(([toolName, { meta }]) => {
                const inputSchemaFields: Record<string, z.ZodTypeAny> = {};
                meta.paramSchemas
                    .sort((a, b) => a.index - b.index)
                    .forEach(param => {
                        if (param.name) {
                            inputSchemaFields[param.name] = param.schema;
                        }
                    });
                
                const fullInputZodSchema = z.object(inputSchemaFields);
                const geminiInputSchema = this.zodToJSONSchema7(fullInputZodSchema);

                // 构建输出 schema
                const outputSchemaFields = meta.returnSchema ? { result: meta.returnSchema } : { result: z.any() };
                const fullOutputZodSchema = z.object(outputSchemaFields);
                const geminiOutputSchema = this.zodToJSONSchema7(fullOutputZodSchema);

                return {
                    name: toolName,
                    title: meta.title || toolName,
                    description: meta.description || `Tool: ${toolName}`,
                    inputSchema: geminiInputSchema,
                    outputSchema: geminiOutputSchema
                };
            });

            return { tools };
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
                // 尝试处理 Gemini 传回的 string 类型数字 (针对 numeric enum)
                if (typeof value === 'string' && !isNaN(Number(value))) {
                    try {
                        const numValue = Number(value);
                        const validatedValue = param.schema.parse(numValue);
                        methodArgs[param.index] = validatedValue;
                        continue;
                    } catch (innerError) {
                        // 忽略内部错误，继续抛出原始错误
                    }
                }
                
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
    /**
     * 将 Zod Schema 转换为兼容性高的 jsonSchema7 格式
     */
    private zodToJSONSchema7(zodObj: z.ZodTypeAny): any {
        return zodToJsonSchema(zodObj, {
            target: 'jsonSchema7',
            $refStrategy: 'none',
        }) as any;
    }
}
