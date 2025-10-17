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
            .requiredOption('--project <path>', 'Path to the Cocos project (required)')
            .action(async (options: any) => {
                try {
                    const resolvedPath = this.validateProjectPath(options.project);
                    CommandUtils.showProjectInfo(resolvedPath);
                } catch (error) {
                    console.error(chalk.red('Failed to get project info:'), error);
                    process.exit(1);
                }
            });
    }
}
