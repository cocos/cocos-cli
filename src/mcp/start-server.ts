import { join } from 'path';
import { CocosAPI } from '../api';
import { register } from '../server';
import { McpMiddleware } from './mcp.middleware';

export async function startServer(folder: string, port: number) {
    const tempEnginePath = join(__dirname, '../../bin/engine');
    const cocosAPI = new CocosAPI(folder, tempEnginePath);
    await cocosAPI.startup();

    const middleware = new McpMiddleware();
    middleware.registerDecoratorTools();
    register('mcp', middleware.getMiddlewareContribution());
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
