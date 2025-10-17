import { join } from 'path';
import { CocosAPI } from '../api';
import { register } from '../server';
import { McpMiddleware } from './mcp.middleware';
import { serverService } from '../server/server';
import chalk from 'chalk';

export async function startMcpServer(project: string, port?: number) {
    const tempEnginePath = join(__dirname, '../../bin/engine');
    const cocosAPI = new CocosAPI(project, tempEnginePath);
    await cocosAPI.startup(port);

    const middleware = new McpMiddleware();
    middleware.registerDecoratorTools();
    register('mcp', middleware.getMiddlewareContribution());
    const mcpUrl = `${serverService.url}/mcp`;
    console.log(chalk.green('✓ MCP Server started successfully!'));
    console.log(chalk.blue(`Server is running on: ${mcpUrl}`));
    console.log(chalk.yellow('Press Ctrl+C to stop the server'));
}
// 如果直接运行此文件，启动服务器
if (require.main === module) {
    //todo: 后续需要整理下这边的启动逻辑，现在看着有点乱，api 里面启动了 server，然后 server 还要等 api 初始化后才能 register tools
    const { project, engine } = require('../../.user.json');
    const cocosAPI = new CocosAPI(project, engine);
    cocosAPI.startup();

    const middleware = new McpMiddleware();
    middleware.registerDecoratorTools();
    register('mcp', middleware.getMiddlewareContribution());
}
