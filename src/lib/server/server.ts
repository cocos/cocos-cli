/**
 * Server Facade Module
 *
 * Provides a simplified interface for managing the Express HTTP server.
 * Wraps the core server service with startup guards and status tracking.
 */

let serverUrl: string | undefined;
let isRunning = false;

/**
 * Initialize and start the Express HTTP server.
 *
 * @param port Optional port number; auto-selected if omitted
 * @returns The server base URL (e.g. http://localhost:9527)
 */
export async function start(port?: number): Promise<string> {
    if (isRunning && serverUrl) {
        return serverUrl;
    }

    const { serverService } = await import('../../server/server');
    await serverService.start(port);

    serverUrl = serverService.url;
    isRunning = true;
    return serverUrl;
}

/**
 * Stop the Express HTTP server.
 */
export async function stop(): Promise<void> {
    if (!isRunning) {
        return;
    }

    const { serverService } = await import('../../server/server');
    await serverService.stop();

    isRunning = false;
    serverUrl = undefined;
}

/**
 * Get the current server base URL.
 * Returns undefined if the server is not running.
 */
export function getUrl(): string | undefined {
    return serverUrl;
}

/**
 * Register a middleware contribution (routes, static files, sockets)
 * on the running server.
 *
 * @param name   Middleware identifier
 * @param module Middleware contribution config
 */
export async function register(
    name: string,
    module: import('../../server/interfaces').IMiddlewareContribution,
): Promise<void> {
    const { serverService } = await import('../../server/server');
    serverService.register(name, module);
}

/**
 * Get the server running status.
 */
export function getStatus(): { running: boolean; url?: string } {
    return { running: isRunning, url: serverUrl };
}
