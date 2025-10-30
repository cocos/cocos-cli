import { CocosAPI } from '../api';
import { register } from '../server';
import { McpMiddleware } from './mcp.middleware';
import { serverService } from '../server/server';
import chalk from 'chalk';

export async function startServer(folder: string, port?: number) {
    const cocosAPI = new CocosAPI();
    await cocosAPI.startup(folder, port);
    const middleware = new McpMiddleware();
    register('mcp', middleware.getMiddlewareContribution());
    const mcpUrl = `${serverService.url}/mcp`;
    console.log(chalk.green('✓ MCP Server started successfully!'));
    console.log(`${chalk.blueBright(`Server is running on: `)}${chalk.underline.cyan(`${mcpUrl}`)}`);
    console.log(chalk.yellow('Press Ctrl+C to stop the server'));
}
