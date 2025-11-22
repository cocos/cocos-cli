import chalk from 'chalk';
import { BaseCommand } from './base';
import { BuildExitCode } from '../core/builder/@types/protected';

/**
 * Make 命令类
 */
export class MakeCommand extends BaseCommand {
    register(): void {
        this.program
            .command('make')
            .description('Make a Cocos project')
            .requiredOption('--project <path>', 'Path to the Cocos project (required)')
            .option('-p, --platform <platform>', 'Target platform (windows, android, ios, etc.)')
            .requiredOption('--dest <path>', 'Destination path for the made project')
            .action(async (options: any) => {
                try {
                    const resolvedPath = this.validateProjectPath(options.project);

                    const { CocosAPI } = await import('../api/index');
                    const result = await CocosAPI.makeProject(resolvedPath, options.platform, options.dest);
                    if (result.code === BuildExitCode.BUILD_SUCCESS) {
                        console.log(chalk.green('✓ Make completed successfully!'));
                    } else {
                        console.error(chalk.red('✗ Make failed!'));
                        process.exit(result.code);
                    }
                    process.exit(0);
                } catch (error) {
                    console.error(chalk.red('Failed to make project:'), error);
                    process.exit(1);
                }
            });
    }
}
