import chalk from 'chalk';
import { BaseCommand } from './base';
import { BuildExitCode } from '../core/builder/@types/protected';

/**
 * Run 命令类
 */
export class RunCommand extends BaseCommand {
    register(): void {
        this.program
            .command('run')
            .description('Run a Cocos project')
            .requiredOption('-p, --platform <platform>', 'Target platform (web-desktop, web-mobile, android, ios, etc.)')
            .requiredOption('-d, --dest <path>', 'Destination path of the built project')
            .action(async (options: any) => {
                try {

                    const { CocosAPI } = await import('../api/index');
                    const result = await CocosAPI.runProject(options.platform, options.dest);
                    if (result.code === BuildExitCode.BUILD_SUCCESS) {
                        console.log(chalk.green('✓ Project is running!'));
                    } else {
                        console.error(chalk.red('✗ Failed to run project!'));
                        process.exit(result.code);
                    }
                    // Run command might be long-running, so we might not want to exit immediately if it's a server or watcher.
                    // However, based on the API signature returning a promise, it might be a fire-and-forget or wait-until-done.
                    // If it's a server, we probably shouldn't exit.
                    // But for now, let's assume it returns when done or if it's just launching something.
                    // If it returns a process or similar, we might need to handle it.
                    // For now, I'll follow the pattern but be aware it might need to stay alive.
                    // If runProject returns a boolean indicating success of *launch*, then exit(0) is fine.
                } catch (error) {
                    console.error(chalk.red('Failed to run project:'), error);
                    process.exit(1);
                }
            });
    }
}
