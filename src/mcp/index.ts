import { Request, Response, Router } from 'express';
import { toolRegistry } from '../api/decorator/decorator.js';
import { ImporterApi } from '../api/importer/importer.js';

// ==================== 公共类型定义 ====================

// JSON-RPC 类型定义
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: any;
    id?: string | number | null;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
    id: string | number | null;
}

// MCP 特定的方法
export interface McpTool {
    name: string;
    description?: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface McpListToolsResult {
    tools: McpTool[];
}

export interface McpCallToolParams {
    name: string;
    arguments?: Record<string, any>;
}

export interface McpCallToolResult {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}

export interface McpInitializeParams {
    protocolVersion: string;
    capabilities: {
        tools?: {};
        logging?: {};
        prompts?: {};
        resources?: {};
    };
    clientInfo: {
        name: string;
        version: string;
    };
}

export interface McpInitializeResult {
    protocolVersion: string;
    capabilities: {
        tools?: {
            listChanged?: boolean;
        };
        logging?: {};
        prompts?: {};
        resources?: {};
    };
    serverInfo: {
        name: string;
        version: string;
    };
}

// ==================== 公共工具管理 ====================

// 工具实例管理
const toolInstances = new Map<string, any>();

// 获取或创建工具实例
async function getToolInstance(target: any): Promise<any> {
    const className = target.constructor.name;
    let instance = toolInstances.get(className);

    if (!instance) {
        const projectPath = process.cwd();
        const enginePath = process.cwd();
        instance = new target.constructor(projectPath, enginePath);

        if (instance.init) {
            await instance.init();
        }

        toolInstances.set(className, instance);
    }

    return instance;
}

// 简单的 JSON Schema 生成
function getSimpleJsonSchema(): any {
    return {
        type: 'string',
        description: 'Parameter value'
    };
}

// 获取所有注册的工具
export function getRegisteredTools(): McpTool[] {
    const tools: McpTool[] = [];

    for (const [toolName, { meta }] of toolRegistry) {
        const inputSchema: any = {
            type: 'object',
            properties: {},
            required: []
        };

        // 简化参数处理，直接使用 param0, param1 等命名
        for (const paramSchema of meta.paramSchemas) {
            const paramName = `param${paramSchema.index}`;
            const jsonSchema = getSimpleJsonSchema();

            inputSchema.properties[paramName] = jsonSchema;
            inputSchema.required.push(paramName);
        }

        tools.push({
            name: toolName,
            description: meta.description || meta.title,
            inputSchema
        });
    }

    return tools;
}

// 调用工具
export async function callTool(name: string, args: Record<string, any> = {}): Promise<McpCallToolResult> {
    try {
        const toolInfo = toolRegistry.get(name);
        if (!toolInfo) {
            return {
                content: [{
                    type: 'text',
                    text: `Tool "${name}" not found`
                }],
                isError: true
            };
        }

        const { target, meta } = toolInfo;

        // 获取工具实例
        const instance = await getToolInstance(target);

        // 准备参数
        const methodArgs: any[] = [];

        for (const paramSchema of meta.paramSchemas.sort((a, b) => a.index - b.index)) {
            const paramName = `param${paramSchema.index}`;
            const value = args[paramName];

            // 使用 Zod 验证参数
            try {
                const validatedValue = paramSchema.schema.parse(value);
                methodArgs[paramSchema.index] = validatedValue;
            } catch (error) {
                return {
                    content: [{
                        type: 'text',
                        text: `Parameter validation failed for ${paramName}: ${error}`
                    }],
                    isError: true
                };
            }
        }

        // 调用方法
        const result = await instance[meta.methodName](...methodArgs);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify(result, null, 2)
            }]
        };
    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: `Error calling tool "${name}": ${error}`
            }],
            isError: true
        };
    }
}

// ==================== 公共 JSON-RPC 处理 ====================

// 处理 JSON-RPC 请求
export async function handleJsonRpcRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const { method, params, id } = request;
    const responseId = id ?? null;

    try {
        switch (method) {
            case 'initialize':
                const initParams = params as McpInitializeParams;
                const initResult: McpInitializeResult = {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {
                            listChanged: false
                        }
                    },
                    serverInfo: {
                        name: 'Trae AI MCP Server',
                        version: '1.0.0'
                    }
                };
                return {
                    jsonrpc: '2.0',
                    result: initResult,
                    id: responseId
                };

            case 'initialized':
                // 这是一个通知，不需要响应
                console.log('MCP client initialized');
                return null;

            case 'tools/list':
                const tools = getRegisteredTools();
                return {
                    jsonrpc: '2.0',
                    result: { tools },
                    id: responseId
                };

            case 'tools/call':
                const { name, arguments: args } = params as McpCallToolParams;
                const result = await callTool(name, args);
                return {
                    jsonrpc: '2.0',
                    result,
                    id: responseId
                };

            default:
                return {
                    jsonrpc: '2.0',
                    error: {
                        code: -32601,
                        message: 'Method not found',
                        data: { method }
                    },
                    id: responseId
                };
        }
    } catch (error) {
        return {
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: 'Internal error',
                data: { error: String(error) }
            },
            id: responseId
        };
    }
}

// ==================== 公共工具初始化 ====================

// 初始化工具注册
export async function initializeTools() {
    try {
        // 创建 ImporterApi 实例以触发装饰器注册
        const projectPath = process.cwd();
        const enginePath = process.cwd();
        const importerApi = new ImporterApi(projectPath, enginePath);
        await importerApi.init();
        toolInstances.set('ImporterApi', importerApi);
        console.log(`Initialized ${toolRegistry.size} tools`);
    } catch (error) {
        console.error('Failed to initialize tools:', error);
    }
}

// ==================== HTTP Middleware 实现 ====================

// 验证 Origin 头以防止 DNS rebinding 攻击
function validateOrigin(req: Request): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // 允许没有 origin 的请求（如 Postman）

    const allowedOrigins = [
        'http://localhost',
        'http://127.0.0.1',
        'https://localhost',
        'https://127.0.0.1'
    ];

    return allowedOrigins.some(allowed => origin.startsWith(allowed));
}

// MCP 中间件
export const mcpMiddleware = Router();

// 启动时初始化工具
initializeTools();



// POST 处理 - 发送消息到服务器
mcpMiddleware.post('/', async (req: Request, res: Response) => {
    // 安全检查
    if (!validateOrigin(req)) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Invalid origin'
        });
    }

    // 检查 Accept 头
    const acceptHeader = req.headers.accept || '';
    const supportsJson = acceptHeader.includes('application/json');
    const supportsSSE = acceptHeader.includes('text/event-stream');

    if (!supportsJson && !supportsSSE) {
        return res.status(406).json({
            error: 'Not Acceptable',
            message: 'Must accept application/json or text/event-stream'
        });
    }

    try {
        const body = req.body;
        let messages: JsonRpcRequest[];

        // 处理单个消息或批量消息
        if (Array.isArray(body)) {
            messages = body;
        } else {
            messages = [body];
        }

        // 检查是否包含请求
        const hasRequests = messages.some(msg => 'id' in msg && msg.id !== undefined);

        if (!hasRequests) {
            // 只有通知或响应，返回 202 Accepted
            return res.status(202).send();
        }

        // 处理请求
        const responses: JsonRpcResponse[] = [];
        for (const message of messages) {
            if ('id' in message && message.id !== undefined) {
                const response = await handleJsonRpcRequest(message as JsonRpcRequest);
                if (response) {
                    responses.push(response);
                }
            } else {
                // 处理通知（没有 id 的消息）
                await handleJsonRpcRequest(message as JsonRpcRequest);
            }
        }

        // 根据客户端支持的格式返回响应
        if (supportsSSE && req.headers.accept?.includes('text/event-stream')) {
            // 使用 SSE 流
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': req.headers.origin || '*',
                'Access-Control-Allow-Credentials': 'true'
            });

            // 发送响应
            for (const response of responses) {
                res.write(`data: ${JSON.stringify(response)}\n\n`);
            }

            res.end();
        } else {
            // 使用 JSON 响应
            res.json(responses.length === 1 ? responses[0] : responses);
        }
    } catch (error) {
        console.error('MCP POST error:', error);
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32700,
                message: 'Parse error'
            },
            id: null
        });
    }
});

// GET 处理 - 监听来自服务器的消息
mcpMiddleware.get('/', (req: Request, res: Response) => {
    // 安全检查
    if (!validateOrigin(req)) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Invalid origin'
        });
    }

    // 支持 SSE 连接
    if (req.headers.accept?.includes('text/event-stream')) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': req.headers.origin || '*',
            'Access-Control-Allow-Credentials': 'true'
        });

        // 发送初始连接确认
        res.write('event: connected\n');
        res.write('data: {"jsonrpc":"2.0","method":"connection","params":{"status":"connected"}}\n\n');

        // 保持连接活跃
        const keepAlive = setInterval(() => {
            res.write('event: ping\n');
            res.write('data: {"jsonrpc":"2.0","method":"ping"}\n\n');
        }, 30000);

        req.on('close', () => {
            clearInterval(keepAlive);
            console.log('SSE connection closed');
        });

        req.on('error', () => {
            clearInterval(keepAlive);
        });
    } else {
        res.json({
            name: 'Trae AI MCP Server',
            version: '1.0.0',
            description: 'MCP Server for Trae AI tools',
            endpoints: {
                mcp: '/mcp'
            },
            capabilities: {
                tools: true,
                sse: true
            }
        });
    }
});