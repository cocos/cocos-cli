import { Command } from 'commander';
import chalk from 'chalk';
import { BaseCommand, CommandUtils } from './base';
import { projectManager } from '../launcher';
import { IBuildCommandOption, BuildExitCode } from '../core/builder/@types/protected';

/**
 * Build 命令类
 */
export class BuildCommand extends BaseCommand {
    register(): void {
        this.program
            .command('build')
            .description('Build a Cocos project')
            .argument('<project-path>', 'Path to the Cocos project')
            .option('-p, --platform <platform>', 'Target platform (web-desktop, web-mobile, android, ios, etc.)')
            .option('--engine <path>', 'Specify engine path')
            .option('--config <path>', 'Specify config file path')
            .option('--log-dest <path>', 'Specify log file path')
            .option('--skip-check', 'Skip option validation')
            .option('--stage <stage>', 'Build stage (compile, bundle, etc.)')
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
                        console.error(chalk.yellow('  - .user.json  file'));
                        console.error(chalk.yellow('  - COCOS_ENGINE_PATH environment variable'));
                        process.exit(1);
                    }

                    // 获取平台：优先使用命令选项，然后是默认值
                    const platform = options.platform || 'web-desktop';

                    CommandUtils.showBuildInfo(resolvedPath, enginePath, platform);

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

                    const result = await projectManager.build(resolvedPath, enginePath, buildOptions);

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
