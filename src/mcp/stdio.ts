#!/usr/bin/env node

import { createReadStream, createWriteStream } from 'fs';
import { createInterface } from 'readline';
import {
    JsonRpcRequest,
    JsonRpcResponse,
    handleJsonRpcRequest,
    initializeTools
} from './index.js';

/**
 * MCP Stdio Server
 * 
 * 这个服务器实现了基于标准输入输出的 MCP 协议，
 * 遵循 MCP 最佳实践，支持 JSON-RPC 2.0 协议。
 * 
 * 使用方式：
 * node dist/mcp/stdio.js
 * 
 * 或者在 MCP 客户端配置中：
 * {
 *   "command": "node",
 *   "args": ["dist/mcp/stdio.js"],
 *   "cwd": "/path/to/project"
 * }
 */

class McpStdioServer {
    private readline: any;
    private isShuttingDown = false;

    constructor() {
        // 创建 readline 接口用于处理标准输入
        this.readline = createInterface({
            input: process.stdin,
            output: process.stdout,
            crlfDelay: Infinity
        });

        // 设置错误处理
        this.setupErrorHandling();

        // 设置优雅关闭
        this.setupGracefulShutdown();
    }

    /**
     * 启动 stdio 服务器
     */
    async start(): Promise<void> {
        try {
            // 初始化工具
            await initializeTools();

            console.error('MCP Stdio Server started'); // 使用 stderr 输出日志

            // 监听标准输入的每一行
            this.readline.on('line', async (line: string) => {
                await this.handleInput(line.trim());
            });

            // 监听输入结束
            this.readline.on('close', () => {
                this.shutdown();
            });

        } catch (error) {
            console.error('Failed to start MCP Stdio Server:', error);
            process.exit(1);
        }
    }

    /**
     * 处理输入的 JSON-RPC 消息
     */
    private async handleInput(input: string): Promise<void> {
        if (!input || this.isShuttingDown) {
            return;
        }

        try {
            // 解析 JSON-RPC 请求
            const request: JsonRpcRequest = JSON.parse(input);

            // 验证 JSON-RPC 格式
            if (!this.isValidJsonRpcRequest(request)) {
                this.sendError(-32600, 'Invalid Request', null);
                return;
            }

            // 处理请求
            const response = await handleJsonRpcRequest(request);

            // 发送响应（如果有的话）
            if (response) {
                this.sendResponse(response);
            }

        } catch (error) {
            console.error('Error processing input:', error);

            // 发送解析错误响应
            this.sendError(-32700, 'Parse error', null);
        }
    }

    /**
     * 验证 JSON-RPC 请求格式
     */
    private isValidJsonRpcRequest(obj: any): obj is JsonRpcRequest {
        return (
            obj &&
            typeof obj === 'object' &&
            obj.jsonrpc === '2.0' &&
            typeof obj.method === 'string' &&
            (obj.id === undefined || obj.id === null || typeof obj.id === 'string' || typeof obj.id === 'number')
        );
    }

    /**
     * 发送 JSON-RPC 响应到标准输出
     */
    private sendResponse(response: JsonRpcResponse): void {
        try {
            const responseStr = JSON.stringify(response);
            process.stdout.write(responseStr + '\n');
        } catch (error) {
            console.error('Error sending response:', error);
        }
    }

    /**
     * 发送错误响应
     */
    private sendError(code: number, message: string, id: string | number | null): void {
        const errorResponse: JsonRpcResponse = {
            jsonrpc: '2.0',
            error: {
                code,
                message
            },
            id
        };

        this.sendResponse(errorResponse);
    }

    /**
     * 设置错误处理
     */
    private setupErrorHandling(): void {
        // 处理未捕获的异常
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            this.shutdown();
        });

        // 处理未处理的 Promise 拒绝
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.shutdown();
        });

        // 处理标准输入错误
        process.stdin.on('error', (error) => {
            console.error('Stdin error:', error);
            this.shutdown();
        });

        // 处理标准输出错误
        process.stdout.on('error', (error) => {
            console.error('Stdout error:', error);
            this.shutdown();
        });
    }

    /**
     * 设置优雅关闭
     */
    private setupGracefulShutdown(): void {
        // 处理 SIGINT (Ctrl+C)
        process.on('SIGINT', () => {
            console.error('Received SIGINT, shutting down gracefully...');
            this.shutdown();
        });

        // 处理 SIGTERM
        process.on('SIGTERM', () => {
            console.error('Received SIGTERM, shutting down gracefully...');
            this.shutdown();
        });

        // 处理 SIGPIPE (当客户端断开连接时)
        process.on('SIGPIPE', () => {
            console.error('Received SIGPIPE, client disconnected');
            this.shutdown();
        });
    }

    /**
     * 优雅关闭服务器
     */
    private shutdown(): void {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        console.error('MCP Stdio Server shutting down...');

        try {
            // 关闭 readline 接口
            if (this.readline) {
                this.readline.close();
            }
        } catch (error) {
            console.error('Error during shutdown:', error);
        }

        // 退出进程
        process.exit(0);
    }
}

// 如果直接运行此文件，启动服务器
if (require.main === module) {
    const server = new McpStdioServer();
    server.start().catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

export { McpStdioServer };