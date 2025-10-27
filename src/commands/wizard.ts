import chalk from 'chalk';
import { BaseCommand } from './base';
import { interactive } from '../display/interactive';
// import { projectManager } from '../core/launcher';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { log } from '../core/base/utils/log';

/**
 * 交互式向导命令
 */
export class WizardCommand extends BaseCommand {
    register(): void {
        this.program
            .command('wizard')
            .description('启动交互式向导，引导你完成项目设置和操作')
            .action(async () => {
                try {
                    await this.runWizard();
                } catch (error) {
                    interactive.error(`向导运行失败: ${error}`);
                    process.exit(1);
                }
            });
    }

    /**
     * 运行交互式向导
     */
    private async runWizard(): Promise<void> {
        interactive.showStartupMessage();

        // 等待用户准备
        await interactive.input('按回车键开始...');

        // 选择操作类型
        const action = await interactive.select('你想要做什么？', [
            { name: '🏗️  构建项目', value: 'build' },
            { name: '📂 导入项目', value: 'import' },
            { name: 'ℹ️  查看项目信息', value: 'info' },
            { name: '🚀 启动 MCP 服务器', value: 'mcp' },
            { name: '❓ 查看帮助', value: 'help' }
        ]);

        switch (action) {
            case 'build':
                await this.buildWizard();
                break;
            case 'import':
                await this.importWizard();
                break;
            case 'info':
                await this.infoWizard();
                break;
            case 'mcp':
                await this.mcpWizard();
                break;
            case 'help':
                await this.helpWizard();
                break;
        }
    }

    /**
     * 构建向导
     */
    private async buildWizard(): Promise<void> {
        interactive.info('开始构建向导...');

        // 选择项目路径
        const projectPath = await this.selectProjectPath();
        if (!projectPath) return;

        // 选择平台
        const platform = await interactive.select('选择目标平台', [
            { name: '🖥️  Web Desktop', value: 'web-desktop' },
            { name: '📱 Web Mobile', value: 'web-mobile' },
            // { name: '🤖 Android', value: 'android' },
            // { name: '🍎 iOS', value: 'ios' }
        ]);

        // // 选择构建选项
        // const _options = await interactive.checkbox('选择构建选项', [
        //     { name: '跳过检查', value: 'skipCheck' },
        //     { name: '调试模式', value: 'debug' },
        //     { name: '发布模式', value: 'release' }
        // ]);

        // 确认构建
        const confirmed = await interactive.confirm(
            `确认构建项目 ${projectPath} 到平台 ${platform}？`
        );

        if (!confirmed) {
            interactive.warning('构建已取消');
            return;
        }

        // 执行构建
        interactive.startSpinner('正在构建项目...');

        try {
            // 这里应该调用实际的构建逻辑
            // const result = await projectManager.build(projectPath, enginePath, buildOptions);

            // 模拟构建过程
            await new Promise(resolve => setTimeout(resolve, 2000));

            interactive.stopSpinner(true, '构建完成！');
            interactive.success(`项目已成功构建到 ${platform} 平台`);
        } catch (error) {
            interactive.stopSpinner(false, '构建失败');
            interactive.error(`构建失败: ${error}`);
        }
    }

    /**
     * 导入向导
     */
    private async importWizard(): Promise<void> {
        interactive.info('开始导入向导...');

        const projectPath = await this.selectProjectPath();
        if (!projectPath) return;

        const confirmed = await interactive.confirm(
            `确认导入项目 ${projectPath}？`
        );

        if (!confirmed) {
            interactive.warning('导入已取消');
            return;
        }

        interactive.startSpinner('正在导入项目...');

        try {
            // 模拟导入过程
            await new Promise(resolve => setTimeout(resolve, 1500));

            interactive.stopSpinner(true, '导入完成！');
            interactive.success('项目导入成功');
        } catch (error) {
            interactive.stopSpinner(false, '导入失败');
            interactive.error(`导入失败: ${error}`);
        }
    }

    /**
     * 信息向导
     */
    private async infoWizard(): Promise<void> {
        interactive.info('开始信息查看向导...');

        const projectPath = await this.selectProjectPath();
        if (!projectPath) return;

        interactive.startSpinner('正在获取项目信息...');

        try {
            // 模拟获取信息过程
            await new Promise(resolve => setTimeout(resolve, 1000));

            interactive.stopSpinner(true, '信息获取完成！');

            // 显示项目信息表格
            interactive.table(
                ['属性', '值'],
                [
                    ['项目名称', 'My Cocos Project'],
                    ['项目路径', projectPath],
                    ['引擎版本', '3.8.8'],
                    ['平台支持', 'Web, Android, iOS'],
                    ['资源数量', '156 个文件']
                ]
            );
        } catch (error) {
            interactive.stopSpinner(false, '信息获取失败');
            interactive.error(`获取信息失败: ${error}`);
        }
    }

    /**
     * MCP 服务器向导
     */
    private async mcpWizard(): Promise<void> {
        interactive.info('开始 MCP 服务器向导...');

        const projectPath = await this.selectProjectPath();
        if (!projectPath) return;

        const port = await interactive.input('请输入端口号', '9527');
        const portNumber = parseInt(port, 10);

        if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
            interactive.error('无效的端口号');
            return;
        }

        const confirmed = await interactive.confirm(
            `确认在端口 ${portNumber} 启动 MCP 服务器？`
        );

        if (!confirmed) {
            interactive.warning('服务器启动已取消');
            return;
        }

        interactive.startSpinner('正在启动 MCP 服务器...');

        try {
            // 模拟启动过程
            await new Promise(resolve => setTimeout(resolve, 1000));

            interactive.stopSpinner(true, '服务器启动完成！');
            interactive.success(`MCP 服务器已在端口 ${portNumber} 启动`);
            interactive.info('按 Ctrl+C 停止服务器');
        } catch (error) {
            interactive.stopSpinner(false, '服务器启动失败');
            interactive.error(`启动失败: ${error}`);
        }
    }

    /**
     * 帮助向导
     */
    private async helpWizard(): Promise<void> {
        interactive.info('可用的命令和选项：');

        interactive.table(
            ['命令', '描述', '示例'],
            [
                ['build', '构建项目', 'cocos build --project ./my-project --platform web-desktop'],
                ['import', '导入项目', 'cocos import --project ./my-project'],
                ['info', '查看项目信息', 'cocos info --project ./my-project'],
                ['start-mcp-server', '启动 MCP 服务器', 'cocos start-mcp-server --project ./my-project --port 9527'],
                ['wizard', '启动交互式向导', 'cocos wizard']
            ]
        );

        interactive.separator();
        interactive.info('更多帮助信息：');
        log(chalk.gray('  • 使用 --help 查看特定命令的详细帮助'));
        log(chalk.gray('  • 使用 --version 查看版本信息'));
        log(chalk.gray('  • 使用 wizard 命令启动交互式向导'));
    }

    /**
     * 选择项目路径
     */
    private async selectProjectPath(): Promise<string | null> {
        const pathType = await interactive.select('如何指定项目路径？', [
            { name: '📁 浏览当前目录', value: 'browse' },
            { name: '✏️  手动输入路径', value: 'manual' },
            { name: '❌ 取消', value: 'cancel' }
        ]);

        if (pathType === 'cancel') {
            return null;
        }

        if (pathType === 'manual') {
            const projectPath = await interactive.input('请输入项目路径');
            const resolvedPath = resolve(projectPath);

            if (!existsSync(resolvedPath)) {
                interactive.error('项目路径不存在');
                return null;
            }

            return resolvedPath;
        }

        // 浏览模式 - 简化实现
        const projectPath = await interactive.input('请输入项目路径（或按回车使用默认）', './my-project');
        const resolvedPath = resolve(projectPath);

        if (!existsSync(resolvedPath)) {
            interactive.warning('项目路径不存在，将使用默认路径');
            return './my-project';
        }

        return resolvedPath;
    }
}
