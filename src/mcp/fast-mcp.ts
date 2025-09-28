import { FastMCP, type Tool, type Context } from 'fastmcp';
import { toolRegistry, ToolMetaData } from '../api/decorator/decorator';
import { z } from 'zod';
import { CocosAPI } from '../api';
import { join } from 'path';

/**
 * FastMCP 服务器类，用于自动从装饰器收集工具信息并注册到 MCP 服务器
 */
export class FastMcpServer {
    private server: FastMCP;

    constructor() {
        this.server = new FastMCP({
            name: 'cocos-cli-mcp-server',
            version: '1.0.0',
            instructions: 'MCP server for Cocos CLI tools'
        });

    }

    /**
     * 初始化工具，从装饰器注册表中收集工具信息
     */
    private async initializeTools(projectPath: string): Promise<void> {
        const tempProjectPath = projectPath;
        const tempEnginePath = join(__dirname, '../../bin/engine');
        const cocosAPI = new CocosAPI(tempProjectPath, tempEnginePath);

        await cocosAPI.startup();
        const tools = this.getRegisteredTools();

        for (const tool of tools) {
            this.registerTool(tool);
        }
    }

    /**
     * 从装饰器注册表中获取已注册的工具
     */
    private getRegisteredTools(): Array<{ toolName: string; target: any; meta: ToolMetaData }> {
        const tools: Array<{ toolName: string; target: any; meta: ToolMetaData }> = [];

        for (const [toolName, toolInfo] of toolRegistry.entries()) {
            tools.push({
                toolName,
                target: toolInfo.target,
                meta: toolInfo.meta
            });
        }

        return tools;
    }

    /**
     * 注册单个工具到 FastMCP 服务器
     */
    private registerTool(toolInfo: { toolName: string; target: any; meta: ToolMetaData }): void {
        const { toolName, target, meta } = toolInfo;
        const parameters = this.buildInputSchema(meta);
        console.log(`Registering tool: ${toolName}`);
        const mcpTool: Tool<any> = {
            name: toolName,
            description: meta.description || meta.title || `Tool: ${toolName}`,
            parameters,
            execute: async (args: any, context: Context<any>) => {
                try {
                    // 准备方法参数
                    const methodArgs = this.prepareMethodArguments(meta, args);

                    // 调用实际的工具方法
                    const result = await this.callToolMethod(target, meta, methodArgs);

                    // 格式化返回结果
                    return this.formatToolResult(meta, result);
                } catch (error) {
                    throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        };

        this.server.addTool(mcpTool);
    }

    /**
     * 构建工具的输入模式
     */
    private buildInputSchema(meta: ToolMetaData): z.ZodType | undefined {
        if (!meta.paramSchemas || meta.paramSchemas.length === 0) {
            return undefined;
        }

        const schemaObject: Record<string, z.ZodType> = {};

        // 按参数索引排序
        const sortedParams = meta.paramSchemas.sort((a, b) => a.index - b.index);

        for (const param of sortedParams) {
            const paramName = `param${param.index}`;
            schemaObject[paramName] = param.schema;
        }

        return z.object(schemaObject);
    }

    /**
     * 准备方法参数
     */
    private prepareMethodArguments(meta: ToolMetaData, args: any): any[] {
        if (!meta.paramSchemas || meta.paramSchemas.length === 0) {
            return [];
        }

        const methodArgs: any[] = [];
        const sortedParams = meta.paramSchemas.sort((a, b) => a.index - b.index);

        for (const param of sortedParams) {
            const paramName = `param${param.index}`;
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
    private async callToolMethod(target: any, meta: ToolMetaData, args: any[]): Promise<any> {
        // 获取或创建实例
        const instance = await this.getToolInstance(target);

        // 获取方法
        const method = instance[meta.methodName];
        if (typeof method !== 'function') {
            throw new Error(`Method ${String(meta.methodName)} not found on instance`);
        }

        // 调用方法
        console.log(`Calling method ${String(meta.methodName)} with args:`, args);
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

        // 如果 target 是构造函数，创建实例
        if (typeof target === 'function') {
            return new target();
        }

        // 如果 target 是原型，尝试创建实例
        if (target.constructor && typeof target.constructor === 'function') {
            return new target.constructor();
        }

        throw new Error('Unable to create tool instance');
    }

    /**
     * 格式化工具结果
     */
    private formatToolResult(meta: ToolMetaData, result: any): string {
        if (meta.returnSchema) {
            // 验证结果是否符合预期的 schema
            try {
                const validatedResult = meta.returnSchema.parse(result);
                return JSON.stringify(validatedResult, null, 2);
            } catch (error) {
                throw new Error(`Tool result validation failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    }

    /**
     * 启动 MCP 服务器
     */
    async start(projectPath: string, port: number = 7456): Promise<void> {
        await this.initializeTools(projectPath);
        await this.server.start({
            transportType: 'httpStream',
            httpStream: {
                port: port,
            },
        });
    }

    /**
     * 停止 MCP 服务器
     */
    async stop(): Promise<void> {
        await this.server.stop();
    }
}

// 创建并导出服务器实例
export const fastMcpServer = new FastMcpServer();