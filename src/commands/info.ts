import { Command } from 'commander';
import chalk from 'chalk';
import { BaseCommand, CommandUtils } from './base';

/**
 * Info 命令类
 */
export class InfoCommand extends BaseCommand {
    register(): void {
        this.program
            .command('info')
            .description('Show project information')
            .argument('<project-path>', 'Path to the Cocos project')
            .action(async (projectPath: string) => {
                try {
                    const resolvedPath = this.validateProjectPath(projectPath);
                    CommandUtils.showProjectInfo(resolvedPath);
                } catch (error) {
                    console.error(chalk.red('Failed to get project info:'), error);
                    process.exit(1);
                }
            });
    }
}
