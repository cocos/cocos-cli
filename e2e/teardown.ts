import chalk from 'chalk';
import { getProjectManager } from './helpers/project-manager';
import { getSharedMCPServer } from './helpers/shared-mcp-server';

/**
 * 全局测试清理
 */
export default async function globalTeardown() {
    console.log(chalk.blue('\n' + '='.repeat(60)));
    console.log(chalk.blue('🧹 清理测试环境...'));
    console.log(chalk.blue('='.repeat(60) + '\n'));

    // 检查是否有 --preserve 参数（调试模式）
    const args = process.argv.slice(2);
    const preserveIndex = args.indexOf('--preserve');
    const preserveWorkspace = preserveIndex !== -1;

    // 清理全局共享的 MCP 服务器
    try {
        const sharedServer = getSharedMCPServer();
        if (sharedServer.isReady()) {
            await sharedServer.cleanup();
        }
    } catch (error) {
        console.log(chalk.yellow('⚠️  清理共享 MCP 服务器时出错（忽略）:'), error);
    }

    if (preserveWorkspace) {
        console.log(chalk.yellow('⚠️  调试模式：跳过清理，保留测试工作区'));
        const projectManager = getProjectManager();
        const workspaceRoot = projectManager.getWorkspaceRoot();
        console.log(chalk.cyan(`📁 工作区位置: ${workspaceRoot}`));
        console.log(chalk.cyan(`💡 可以手动查看测试生成的文件\n`));
        return;
    }

    // 清理所有测试项目
    const projectManager = getProjectManager();
    await projectManager.cleanupAll();

    console.log(chalk.green('✅ 测试环境清理完成\n'));
}

