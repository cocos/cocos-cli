import { existsSync, readdirSync, statSync, unlinkSync, mkdirSync } from 'fs';
import { resolve, isAbsolute, join } from 'path';
import chalk from 'chalk';
import { getProjectManager } from './helpers/project-manager';
import { getSharedMCPServer } from './helpers/shared-mcp-server';

/**
 * 清理旧的测试报告
 * 保留最新的 N 个报告，删除其余的
 */
function cleanupOldReports(reportsDir: string, keepCount: number = 10): void {
    try {
        // 确保报告目录存在
        if (!existsSync(reportsDir)) {
            mkdirSync(reportsDir, { recursive: true });
            return;
        }

        // 读取所有报告文件
        const files = readdirSync(reportsDir);
        const reportFiles = files
            .filter(file => file.startsWith('test-report-') && file.endsWith('.html'))
            .map(file => {
                const filePath = join(reportsDir, file);
                const stats = statSync(filePath);
                return {
                    path: filePath,
                    name: file,
                    mtime: stats.mtime.getTime()
                };
            })
            .sort((a, b) => b.mtime - a.mtime); // 按修改时间降序排序

        // 如果报告数量超过保留数量，删除多余的
        if (reportFiles.length > keepCount) {
            const filesToDelete = reportFiles.slice(keepCount);
            console.log(chalk.yellow(`📋 发现 ${reportFiles.length} 个测试报告，保留最新的 ${keepCount} 个`));

            filesToDelete.forEach(file => {
                try {
                    unlinkSync(file.path);
                    console.log(chalk.gray(`   已删除: ${file.name}`));
                } catch {
                    console.log(chalk.red(`   删除失败: ${file.name}`));
                }
            });

            console.log(chalk.green(`✅ 已清理 ${filesToDelete.length} 个旧报告\n`));
        } else if (reportFiles.length > 0) {
            console.log(chalk.gray(`📋 当前有 ${reportFiles.length} 个测试报告\n`));
        }
    } catch {
        // 清理失败不影响测试执行
        console.log(chalk.yellow('⚠️  清理旧报告时出错，继续执行测试\n'));
    }
}

/**
 * 全局测试前置条件检查
 * 支持通过命令行参数指定 CLI 路径
 * 
 * 使用方式：
 * 1. 默认: npm run test:e2e
 * 2. 指定路径: npm run test:e2e -- --cli ./dist/cli.js
 * 
 * 优先级: 命令行参数 > 默认路径
 */
export default async function globalSetup() {
    console.log(chalk.blue('\n' + '='.repeat(60)));
    console.log(chalk.blue('🚀 E2E 测试环境准备中...'));
    console.log(chalk.blue('='.repeat(60) + '\n'));

    let cliPath: string;
    let source: string;
    let preserveWorkspace = false;

    // 解析命令行参数（统一处理，避免重复代码）
    const args = process.argv.slice(2);
    const cliIndex = args.indexOf('--cli');
    const preserveIndex = args.indexOf('--preserve');

    // 检查是否有 --preserve 参数（调试模式）
    if (preserveIndex !== -1) {
        preserveWorkspace = true;
        console.log(chalk.yellow('🔍 调试模式：--preserve 参数已设置'));
    }

    // 调试：输出所有参数（用于排查问题）
    if (process.env.E2E_DEBUG === 'true' || preserveWorkspace) {
        console.log(chalk.gray(`🔍 调试：process.argv = ${JSON.stringify(process.argv)}`));
        console.log(chalk.gray(`🔍 调试：解析的参数 = ${JSON.stringify(args)}`));
    }

    // 1. 优先从环境变量读取（支持 CI/CD 场景）
    if (process.env.E2E_CLI_PATH) {
        cliPath = process.env.E2E_CLI_PATH;
        source = 'environment variable (E2E_CLI_PATH)';
        console.log(chalk.cyan(`📋 CLI 路径来源: ${source}`));
        console.log(chalk.cyan(`   环境变量值: ${cliPath}`));
    } else if (cliIndex !== -1 && cliIndex + 1 < args.length) {
        // 2. 尝试从命令行参数读取 --cli
        // Jest 会将 `--` 后面的参数保留在 process.argv 中
        const argPath = args[cliIndex + 1];
        // 检查参数值是否又是一个选项（防止参数解析错误）
        if (argPath && !argPath.startsWith('--')) {
            cliPath = isAbsolute(argPath) ? argPath : resolve(process.cwd(), argPath);
            source = 'command line argument (--cli)';
            console.log(chalk.cyan(`📋 CLI 路径来源: ${source}`));
            console.log(chalk.cyan(`   参数值: ${argPath}`));
            console.log(chalk.cyan(`   解析后路径: ${cliPath}`));
        } else {
            console.log(chalk.yellow(`⚠️  --cli 参数后缺少路径值，使用默认路径`));
            cliPath = resolve(__dirname, '../dist/cli.js');
            source = 'default path (--cli 参数无效)';
        }
    } else {
        // 3. 使用默认路径
        cliPath = resolve(__dirname, '../dist/cli.js');
        source = 'default path';
        console.log(chalk.cyan(`📋 CLI 路径来源: ${source}`));
        if (cliIndex !== -1) {
            console.log(chalk.yellow(`⚠️  检测到 --cli 参数，但未找到路径值`));
            console.log(chalk.yellow(`   提示：请确保 --cli 后面紧跟路径，例如: --cli ./dist/cli.js`));
        }
    }

    console.log(chalk.cyan(`📍 最终 CLI 路径: ${cliPath}\n`));

    // 验证 CLI 文件是否存在
    if (!existsSync(cliPath)) {
        console.error(chalk.red('❌ 错误: CLI 文件不存在！'));
        console.error(chalk.yellow(`   路径: ${cliPath}\n`));
        console.error(chalk.yellow('请尝试以下方法：\n'));
        console.error(chalk.yellow('  1. 构建项目:'));
        console.error(chalk.white('     npm run build\n'));
        console.error(chalk.yellow('  2. 指定 CLI 路径:'));
        console.error(chalk.white('     npm run test:e2e -- --cli /path/to/cli.js\n'));
        process.exit(1);
    }

    // 保存到内部环境变量供测试使用
    process.env.__E2E_CLI_PATH__ = cliPath;

    // 检查是否是 smoke 测试模式
    const testSuite = process.env.E2E_TEST_SUITE || 'full';
    process.env.E2E_TEST_SUITE = testSuite;

    console.log(chalk.green('✅ CLI 文件验证通过'));
    console.log(chalk.cyan(`📦 测试模式: ${testSuite === 'smoke' ? 'Smoke Tests (快速验证)' : 'Full Tests (完整测试)'}`));

    if (testSuite === 'smoke') {
        console.log(chalk.yellow('⚡ Smoke 测试模式：只运行核心功能测试，速度更快'));
    }

    console.log(chalk.blue('\n' + '='.repeat(60)));
    console.log(chalk.blue('🎯 开始执行 E2E 测试...'));
    console.log(chalk.blue('='.repeat(60) + '\n'));

    // 清理旧的测试报告
    const reportsDir = resolve(__dirname, 'reports');
    cleanupOldReports(reportsDir, 10);

    // 初始化项目管理器
    console.log(chalk.cyan('📦 初始化测试工作区...'));
    const projectManager = getProjectManager({
        cleanBeforeTest: true,
        preserveAfterTest: preserveWorkspace,
    });

    await projectManager.initialize();

    const workspaceRoot = projectManager.getWorkspaceRoot();
    console.log(chalk.green(`✅ 测试工作区: ${workspaceRoot}`));

    if (preserveWorkspace) {
        console.log(chalk.yellow('⚠️  调试模式：测试后不会删除工作区'));
        console.log(chalk.yellow('💡 工作区位置: ' + workspaceRoot));
    }

    // 初始化全局共享的 MCP 服务器（提前启动，避免懒加载延迟）
    // 如果 MCP 测试不需要运行，服务器会在 teardown 时清理
    console.log(chalk.cyan('📡 初始化全局共享 MCP 服务器...'));
    try {
        const sharedServer = getSharedMCPServer();
        await sharedServer.initialize();
        console.log(chalk.green(`✅ 全局共享 MCP 服务器已启动，端口: ${sharedServer.getClient().getPort()}`));
    } catch (error) {
        // MCP 服务器初始化失败不影响其他测试
        // 如果后续有 MCP 测试，会在调用 setupMCPTestEnvironment 时再次尝试
        console.log(chalk.yellow('⚠️  全局共享 MCP 服务器初始化失败（将延迟初始化）:'), error);
    }

    console.log('');
}

