import type { IMiddlewareContribution } from '../server/interfaces';
import { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toolRegistry } from '../api/decorator/decorator';
import { z } from 'zod';

export class McpMiddleware {
    private server: McpServer;
    constructor() {
        // 创建 MCP server
        this.server = new McpServer({
            name: 'cocos-cli-mcp-server',
            version: '1.0.0'
        });
    }

    public registerDecoratorTools() {
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
                            // 使用输入 schema 验证参数（如果存在）
                            if (Object.keys(inputSchemaFields).length > 0) {
                                const inputSchema = z.object(inputSchemaFields);
                                params = inputSchema.parse(params);
                            }

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
                                } catch (error) {
                                    structuredContent = { result: result };
                                }
                            } else {
                                structuredContent = { result: result };
                            }
                            console.debug(`call ${toolName} with args:${methodArgs} result: ${formattedResult}`);
                            return {
                                content: [{ type: 'text', text: formattedResult }],
                                structuredContent: structuredContent
                            };
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            throw new Error(`Tool execution failed: ${errorMessage}`);
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

    public getMiddlewareContribution(): IMiddlewareContribution {
        return {
            post: [
                {
                    url: '/mcp',
                    handler: this.handleMcpRequest.bind(this)
                }
            ]
        };
    }
}
