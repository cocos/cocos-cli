import { join } from 'path';
import { CocosAPI } from '../api';
import { register } from '../server';
import { McpMiddleware } from './mcp.middleware';
import { serverService } from '../server/server';
import chalk from 'chalk';
import { log } from '../core/base/utils/log';

export async function startServer(folder: string, port?: number) {
    const enginePath = join(__dirname, '../../packages/engine');
    const cocosAPI = new CocosAPI(folder, enginePath);
    await cocosAPI.startup();

    const middleware = new McpMiddleware();
    register('mcp', middleware.getMiddlewareContribution());
    const mcpUrl = `${serverService.url}/mcp`;
    log(chalk.green('✓ MCP Server started successfully!'));
    log(`${chalk.blueBright(`Server is running on: `)}${chalk.underline.cyan(`${mcpUrl}`)}`);
    log(chalk.yellow('Press Ctrl+C to stop the server'));
}
