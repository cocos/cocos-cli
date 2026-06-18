import chalk from 'chalk';
import { BaseCommand } from './base';
import { BuildExitCode } from '../core/builder/@types/protected';

/**
 * Upload command.
 */
export class UploadCommand extends BaseCommand {
    register(): void {
        this.program
            .command('upload')
            .description('Upload a built Cocos package')
            .requiredOption('-p, --platform <platform>', 'Target platform')
            .requiredOption('-d, --dest <path>', 'Destination path of the built project')
            .option('--access-token <token>', 'Access token used by the target platform upload API')
            .action(async (options: any) => {
                try {
                    const { CocosAPI } = await import('../api/index');
                    const result = await CocosAPI.uploadProject(options.platform, options.dest, options.accessToken);
                    if (result.code === BuildExitCode.BUILD_SUCCESS) {
                        console.log(chalk.green('Upload completed successfully!'));
                    } else {
                        console.error(chalk.red('Upload failed!'));
                        process.exit(result.code);
                    }
                    process.exit(0);
                } catch (error) {
                    console.error(chalk.red('Failed to upload project:'), error);
                    process.exit(1);
                }
            });
    }
}
