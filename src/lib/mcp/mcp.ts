/**
 * MCP Facade Module
 *
 * Called by the cocos-code utility process to register MCP middleware
 * in an already-initialized environment.
 * Prerequisite: the Server module must be started before calling this module.
 * This module only handles MCP-specific work: populating the toolRegistry
 * and registering MCP routes on the running server.
 */

let mcpUrl: string | undefined;
let registeringPromise: Promise<string> | undefined;

/**
 * Register MCP middleware on the running server.
 *
 * Note: the Express server must already be started via the Server module.
 * This function only:
 * 1. Imports API modules to populate the toolRegistry (@tool decorator side-effects)
 * 2. Creates McpMiddleware and registers routes on the server
 *
 * @returns MCP endpoint URL (e.g. http://localhost:9527/mcp)
 */
export async function register(): Promise<string> {
	if (mcpUrl) {
		return mcpUrl;
	}

	// Reuse in-flight registration if called concurrently
	registeringPromise ??= doRegisterMcp();
	try {
		return await registeringPromise;
	} finally {
		registeringPromise = undefined;
	}
}

async function doRegisterMcp(): Promise<string> {
	// 1. Import API modules to trigger @tool decorators and populate toolRegistry
	const { CocosAPI } = await import('../../api/index');
	await CocosAPI.create();

	// 2. Create MCP middleware and register routes on the running server
	const { McpMiddleware } = await import('../../mcp/mcp.middleware');
	const { register, getUrl } = await import('../server/server');
	const middleware = new McpMiddleware();
	await register('mcp', middleware.getMiddlewareContribution());

	const serverUrl = getUrl();
	mcpUrl = `${serverUrl}/mcp`;

	console.log(`[MCP] Middleware registered at: ${mcpUrl}`);
	return mcpUrl;
}

/**
 * Clean up MCP state.
 * Note: does NOT stop the Express server — use the Server module for that.
 */
export async function unregister(): Promise<void> {
	if (!mcpUrl) {
		return;
	}

	mcpUrl = undefined;
	console.log('[MCP] Middleware unregistered');
}

/**
 * Get the MCP registration status.
 */
export function getStatus(): { registered: boolean; url?: string } {
	return { registered: !!mcpUrl, url: mcpUrl };
}
