import { CocosAPI } from '../api';
import { register } from '../server';
import { McpMiddleware } from './mcp.middleware';
import { serverService } from '../server/server';
import chalk from 'chalk';

export async function startServer(folder: string, port?: number, options: { sceneSessionFile?: string; sceneSessionOrigin?: string; sceneSessionOrigins?: string[] } = {}) {
    const cocosAPI = await CocosAPI.create();
    await cocosAPI.startup(folder, port, { allowedOrigins: options.sceneSessionOrigins ?? (options.sceneSessionOrigin ? [options.sceneSessionOrigin] : undefined), publishReady: false });
    try {
    const middleware = new McpMiddleware();
    register('mcp', middleware.getMiddlewareContribution());
    if (options.sceneSessionFile) {
        const { startSessionServer } = await import('../lib/scene/scene');
        const { writeFile } = await import('node:fs/promises');
        const session = await startSessionServer({ project: folder, allowedOrigins: options.sceneSessionOrigin ? [options.sceneSessionOrigin] : undefined });
        try {
            await writeFile(options.sceneSessionFile, JSON.stringify(session.descriptor, null, 2), { mode: 0o600 });
        } catch (error) { await session.close(); throw error; }
        console.log(`Scene session descriptor: ${options.sceneSessionFile}`);
    }
    const mcpUrl = `${serverService.url}/mcp`;
    const { publishMcpEndpoint } = await import('../core/project-backend/runtime');
    await publishMcpEndpoint(mcpUrl);
    console.log(chalk.green('✓ MCP Server started successfully!'));
    console.log(`${chalk.blueBright(`Server is running on: `)}${chalk.underline.cyan(`${mcpUrl}`)}`);
    console.log(chalk.yellow('Press Ctrl+C to stop the server'));
    return { close: () => cocosAPI.close() };
    } catch (error) { await cocosAPI.close(); throw error; }
}
