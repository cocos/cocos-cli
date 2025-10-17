import chalk from 'chalk';
import { BaseCommand, CommandUtils } from './base';
import { startServer } from '../mcp/start-server';

/**
 * MCP Server 命令类
 */
export class McpServerCommand extends BaseCommand {
    register(): void {
        this.program
            .command('start-mcp-server')
            .description('Start MCP (Model Context Protocol) server for Cocos project')
            .requiredOption('--project <path>', 'Path to the Cocos project (required)')
            .option('-p, --port <number>', 'Port number for the MCP server', '9527')
            .action(async (options: any) => {
                try {
                    const resolvedPath = this.validateProjectPath(options.project);
                    const port = parseInt(options.port, 10);

                    // 验证端口号
                    if (isNaN(port) || port < 1 || port > 65535) {
                        console.error(chalk.red('Error: Invalid port number. Port must be between 1 and 65535.'));
                        process.exit(1);
                    }

                    CommandUtils.showMcpServerInfo(resolvedPath, port);

                    console.log(chalk.blue('🚀 Starting MCP Server...'));
                    console.log(chalk.gray(`Project: ${resolvedPath}`));
                    console.log(chalk.gray(`Port: ${port}`));
                    console.log('');

                    // 启动 MCP 服务器
                    await startServer(resolvedPath, port);

                    console.log(chalk.green('✓ MCP Server started successfully!'));
                    console.log(chalk.blue(`Server is running on port ${port}`));
                    console.log(chalk.yellow('Press Ctrl+C to stop the server'));

                    // 保持进程运行
                    process.stdin.resume();
                } catch (error) {
                    console.error(chalk.red('Failed to start MCP server:'), error);
                    process.exit(1);
                }
            });
    }
}
