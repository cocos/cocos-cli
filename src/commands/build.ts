import chalk from 'chalk';
import { BaseCommand, CommandUtils } from './base';
import { projectManager } from '../core/launcher';
import { IBuildCommandOption, BuildExitCode } from '../core/builder/@types/protected';
import { existsSync, readJSONSync } from 'fs-extra';

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
            .option('--build-config <path>', 'Specify build config file path')
            .option('--log-dest <path>', 'Specify log file path')
            .option('--skip-check', 'Skip option validation')
            .option('--stage <stage>', 'Build stage (compile, bundle, etc.)')
            .action(async (options: any) => {
                try {
                    const resolvedPath = this.validateProjectPath(options.project);

                    if (options.buildConfig) {
                        if (!existsSync(options.buildConfig)) {
                            console.error(`config: ${options.buildConfig} is not exist!`);
                            process.exit(BuildExitCode.BUILD_FAILED);
                        }
                        console.debug(`Read config from path ${options.buildConfig}...`);
                        let data = readJSONSync(options.buildConfig);
                        // 功能点：options 传递的值，允许覆盖配置文件内的同属性值
                        data = Object.assign(data, options);
                        // 避免修改原始 options
                        Object.assign(options, data);
                        // 移除旧的 key 方便和 configPath 未读取的情况做区分
                        delete options.buildConfig;
                    }

                    const result = await projectManager.build(resolvedPath, options);

                    if (result.code === BuildExitCode.BUILD_SUCCESS) {
                        console.log(chalk.green('✓ Build completed successfully! Build Dest: ' + result.dest));
                    } else {
                        console.error(chalk.red('✗ Build failed!'));
                    }
                    process.exit(result.code);
                } catch (error) {
                    console.error(chalk.red('Failed to build project:'), error);
                    process.exit(1);
                }
            });
    }
}
