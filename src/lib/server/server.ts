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
 * @param options Optional `{ ip, port }`. `port` is auto-selected if omitted (and
 *                retried on conflict); `ip` sets the bind/base-URL host (defaults
 *                to localhost). More parameters can be added here later.
 * @returns The server base URL (e.g. http://localhost:9527), reflecting the
 *          actual bound port and the configured ip.
 */
export async function start(options?: { ip?: string; port?: number }): Promise<string> {
    if (isRunning && serverUrl) {
        return serverUrl;
    }

    const { serverService } = await import('../../server/server');
    await serverService.start(options?.port, options?.ip);

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
