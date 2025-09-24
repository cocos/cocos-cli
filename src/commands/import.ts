import { Command } from 'commander';
import chalk from 'chalk';
import { BaseCommand, CommandUtils } from './base';
import { projectManager } from '../launcher';

/**
 * Import 命令类
 */
export class ImportCommand extends BaseCommand {
    register(): void {
        this.program
            .command('import')
            .description('Import/open a Cocos project')
            .argument('<project-path>', 'Path to the Cocos project')
            .option('--engine <path>', 'Specify engine path')
            .option('--wait', 'Keep the process running after import (for development)')
            .action(async (projectPath: string, options: any) => {
                try {
                    const resolvedPath = this.validateProjectPath(projectPath);

                    // 获取引擎路径：优先使用命令选项，然后是全局选项，最后是配置文件
                    const globalOptions = this.getGlobalOptions();
                    const enginePath = options.engine || globalOptions.engine || this.getEnginePath(globalOptions);

                    if (!enginePath) {
                        console.error(chalk.red('Error: Engine path is required.'));
                        console.error(chalk.yellow('Please specify engine path using:'));
                        console.error(chalk.yellow('  - --engine option'));
                        console.error(chalk.yellow('  - Global --engine option'));
                        console.error(chalk.yellow('  - .user.json file'));
                        console.error(chalk.yellow('  - COCOS_ENGINE_PATH environment variable'));
                        process.exit(1);
                    }

                    CommandUtils.showImportInfo(resolvedPath, enginePath);

                    await projectManager.open(resolvedPath, enginePath);

                    console.log(chalk.green('✓ Project imported successfully!'));

                    if (options.wait) {
                        console.log(chalk.blue('Process is running. Press Ctrl+C to exit.'));
                        // 保持进程运行
                        process.stdin.resume();
                    }
                } catch (error) {
                    console.error(chalk.red('Failed to import project:'), error);
                    process.exit(1);
                }
            });
    }
}
