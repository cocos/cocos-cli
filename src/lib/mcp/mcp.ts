/**
 * MCP Server Facade Module
 *
 * Called by the cocos-code utility process to start the MCP server
 * in an already-initialized environment.
 * Prerequisite: core modules (project/engine/assets/scripting/builder)
 * have been initialized via their respective lib modules.
 * This module only handles MCP-specific work: populating the toolRegistry,
 * starting Express, and registering MCP routes.
 */

let mcpUrl: string | undefined;
let isRunning = false;
let startingPromise: Promise<string> | undefined;

/**
 * Start the MCP server.
 *
 * Note: does NOT call CocosAPI.startup() / Launcher because
 * core modules are already initialized by the utility process.
 * This function only:
 * 1. Imports API modules to populate the toolRegistry (@tool decorator side-effects)
 * 2. Starts the Express HTTP server
 * 3. Creates McpMiddleware and registers routes
 *
 * @param port Optional port number; auto-selected if omitted
 * @returns MCP server URL (e.g. http://localhost:9527/mcp)
 */
export async function startServer(port?: number): Promise<string> {
	if (isRunning && mcpUrl) {
		return mcpUrl;
	}

	// Concurrent startup guard: if already starting, wait for the existing promise
	if (startingPromise) {
		return startingPromise;
	}

	startingPromise = doStartServer(port);
	try {
		return await startingPromise;
	} finally {
		startingPromise = undefined;
	}
}

async function doStartServer(port?: number): Promise<string> {
	// 1. Import API modules to trigger @tool decorators and populate toolRegistry
	const { CocosAPI } = await import('../../api/index');
	await CocosAPI.create();

	// 2. Start the Express HTTP server
	const { serverService } = await import('../../server/server');
	await serverService.start(port);

	// 3. Create MCP middleware and register routes
	const { McpMiddleware } = await import('../../mcp/mcp.middleware');
	const middleware = new McpMiddleware();
	serverService.register('mcp', middleware.getMiddlewareContribution());

	mcpUrl = `${serverService.url}/mcp`;
	isRunning = true;

	console.log(`[MCP] Server started at: ${mcpUrl}`);
	return mcpUrl;
}

/**
 * Stop the MCP server.
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
 * Get the MCP server status.
 */
export function getStatus(): { running: boolean; url?: string } {
	return { running: isRunning, url: mcpUrl };
}
