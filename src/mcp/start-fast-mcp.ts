#!/usr/bin/env node

import { fastMcpServer } from './fast-mcp';

/**
 * 启动 FastMCP 服务器的脚本
 *
 * 使用方式：
 * 1. 直接运行: node dist/mcp/start-fast-mcp.js
 * 2. 在 MCP 客户端配置中使用:
 *    {
 *      "command": "node",
 *      "args": ["dist/mcp/start-fast-mcp.js"],
 *      "cwd": "/path/to/project"
 *    }
 */

export async function startServer(projectPath:string) {
    try {
        console.log('Starting FastMCP Server...');

        // 启动服务器
        await fastMcpServer.start(projectPath);

        console.log('FastMCP Server started successfully');

        // 设置优雅关闭
        process.on('SIGINT', async () => {
            console.error('Received SIGINT, shutting down gracefully...');
            await fastMcpServer.stop();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.error('Received SIGTERM, shutting down gracefully...');
            await fastMcpServer.stop();
            process.exit(0);
        });

    } catch (error) {
        console.error('Failed to start FastMCP Server:', error);
        process.exit(1);
    }
}

// 错误处理
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// 如果直接运行此文件，启动服务器
if (require.main === module) {
    startServer('/Users/wzm/Documents/wzm/myself/projects/384');
}
