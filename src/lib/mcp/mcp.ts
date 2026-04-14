/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SUD. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP 服务器 Facade 模块
 *
 * 供 cocos-code 的 utility process 调用，在已初始化的环境中启动 MCP 服务器。
 * 前提条件：core 模块（project/engine/assets/scripting/builder）已经通过各自的 lib 模块初始化完毕。
 * 本模块只做 MCP 特有的工作：填充 toolRegistry + 启动 Express + 注册 MCP 路由。
 */

let mcpUrl: string | undefined;
let isRunning = false;

/**
 * 启动 MCP 服务器
 *
 * 注意：不调用 CocosAPI.startup() / Launcher，因为 core 模块已由 utility process 初始化。
 * 仅完成：
 * 1. 导入 API 模块以填充 toolRegistry（@tool 装饰器副作用）
 * 2. 启动 Express HTTP 服务器
 * 3. 创建 McpMiddleware 并注册路由
 *
 * @param port 可选端口号，默认自动选取
 * @returns MCP 服务器 URL（如 http://localhost:9527/mcp）
 */
export async function startServer(port?: number): Promise<string> {
	if (isRunning && mcpUrl) {
		return mcpUrl;
	}

	// 1. 导入 API 模块，触发 @tool 装饰器填充 toolRegistry
	const { CocosAPI } = await import('../../api/index');
	await CocosAPI.create();

	// 2. 启动 Express HTTP 服务器
	const { serverService } = await import('../../server/server');
	await serverService.start(port);

	// 3. 创建 MCP 中间件并注册路由
	const { McpMiddleware } = await import('../../mcp/mcp.middleware');
	const middleware = new McpMiddleware();
	serverService.register('mcp', middleware.getMiddlewareContribution());

	mcpUrl = `${serverService.url}/mcp`;
	isRunning = true;

	console.log(`[MCP] Server started at: ${mcpUrl}`);
	return mcpUrl;
}

/**
 * 停止 MCP 服务器
 */
export async function stopServer(): Promise<void> {
	if (!isRunning) {
		return;
	}

	const { serverService } = await import('../../server/server');
	await serverService.stop();

	isRunning = false;
	mcpUrl = undefined;
	console.log('[MCP] Server stopped');
}

/**
 * 查询 MCP 服务器状态
 */
export function getStatus(): { running: boolean; url?: string } {
	return { running: isRunning, url: mcpUrl };
}
