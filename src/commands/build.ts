import chalk from 'chalk';
import { BaseCommand, CommandUtils } from './base';
import { projectManager } from '../core/launcher';
import { IBuildCommandOption, BuildExitCode } from '../core/builder/@types/protected';

/**
 * Build 命令类
 */
export class BuildCommand extends BaseCommand {
    register(): void {
        this.program
            .command('build')
            .description('Build a Cocos project')
            .requiredOption('--project <path>', 'Path to the Cocos project (required)')
            .option('-p, --platform <platform>', 'Target platform (web-desktop, web-mobile, android, ios, etc.)')
            .option('--config <path>', 'Specify config file path')
            .option('--log-dest <path>', 'Specify log file path')
            .option('--skip-check', 'Skip option validation')
            .option('--stage <stage>', 'Build stage (compile, bundle, etc.)')
            .action(async (options: any) => {
                try {
                    const resolvedPath = this.validateProjectPath(options.project);

                    // 获取平台：优先使用命令选项，然后是默认值
                    const platform = options.platform || 'web-desktop';

                    CommandUtils.showBuildInfo(resolvedPath, platform);

                    // 构建选项
                    const buildOptions: Partial<IBuildCommandOption> = {
                        platform: platform,
                        skipCheck: options.skipCheck || false,
                        stage: options.stage,
                        configPath: options.config,
                        logDest: options.logDest,
                    };

                    // 处理构建模式
                    if (options.release) {
                        buildOptions.debug = false;
                    }

                    const result = await projectManager.build(resolvedPath, buildOptions);

                    if (result === BuildExitCode.BUILD_SUCCESS) {
                        console.log(chalk.green('✓ Build completed successfully!'));
                    } else {
                        console.error(chalk.red('✗ Build failed!'));
                        process.exit(result);
                    }
                } catch (error) {
                    console.error(chalk.red('Failed to build project:'), error);
                    process.exit(1);
                }
            });
    }
}
