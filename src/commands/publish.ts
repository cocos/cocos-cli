import chalk from 'chalk';
import { BaseCommand } from './base';
import { BuildExitCode } from '../core/builder/@types/protected';

/**
 * Publish command.
 */
export class PublishCommand extends BaseCommand {
    register(): void {
        this.program
            .command('publish')
            .description('Publish a previously uploaded Cocos package')
            .requiredOption('-p, --platform <platform>', 'Target platform')
            .requiredOption('-d, --dest <path>', 'Destination path of the built project')
            .action(async (options: any) => {
                try {
                    const { CocosAPI } = await import('../api/index');
                    const result = await CocosAPI.publishProject(options.platform, options.dest);
                    if (result.code === BuildExitCode.BUILD_SUCCESS) {
                        console.log(chalk.green('Publish completed successfully!'));
                    } else {
                        console.error(chalk.red('Publish failed!'));
                        process.exit(result.code);
                    }
                    process.exit(0);
                } catch (error) {
                    console.error(chalk.red('Failed to publish project:'), error);
                    process.exit(1);
                }
            });
    }
}
