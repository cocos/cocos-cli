import chalk from 'chalk';
import { BaseCommand, CommandUtils } from './base';
import { projectManager } from '../core/launcher';
import { GlobalPaths } from '../global';

/**
 * Import 命令类
 */
export class ImportCommand extends BaseCommand {
    register(): void {
        this.program
            .command('import')
            .description('Import/open a Cocos project')
            .requiredOption('--project <path>', 'Path to the Cocos project (required)')
            .option('--wait', 'Keep the process running after import (for development)')
            .action(async (options: any) => {
                try {
                    const resolvedPath = this.validateProjectPath(options.project);

                    CommandUtils.showImportInfo(resolvedPath);

                    await projectManager.open(resolvedPath);

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
