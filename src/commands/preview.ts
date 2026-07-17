import chalk from 'chalk';
import { BaseCommand } from './base';
import { existsSync, readJSONSync } from 'fs-extra';


/**
 * Preview 命令类
 */
export class PreviewCommand extends BaseCommand {
    register(): void {
        this.program
            .command('preview')
            .description('Preview a Cocos project')
            .option('-j, --project <path>', 'Path to the Cocos project')
            .option('-p, --port <number>', 'Port number for the preview server', '9527')
            .option('-P, --platform <platform>', 'Target web platform (web-desktop or web-mobile)')
            .option('-c, --build-config <path>', 'Specify build config file path')
            .option('-s, --scene <sceneUrlOrUuid>', 'Start scene (uuid or db:// url); defaults to project start scene')
            .option('--no-open', 'Do not open the preview URL in browser')
            .option('--build', 'Use the legacy build-based preview (full build then serve) instead of the dynamic serve preview')
            .option('--scene-editor', 'Start the scene editor debug preview instead of the game preview')
            .action(async (options: any) => {
                try {
                    const projectPath = options.project ?? this.readLocalConfigProject();
                    if (!projectPath) {
                        console.error(chalk.red('Error: --project is required. Provide it via CLI or config.local.json'));
                        process.exit(1);
                    }
                    const resolvedPath = this.validateProjectPath(projectPath);
                    const port = parseInt(options.port, 10);

                    // 验证端口号
                    if (isNaN(port) || port < 1 || port > 65535) {
                        console.error(chalk.red('Error: Invalid port number. Port must be between 1 and 65535.'));
                        process.exit(1);
                    }

                    const { default: Launcher } = await import('../core/launcher');
                    const launcher = new Launcher(resolvedPath);
                    if (options.sceneEditor) {
                        await launcher.startSceneEditorPreview({ port, open: options.open });
                    } else if (options.build) {
                        let buildOptions: Record<string, any> = {};
                        if (options.buildConfig) {
                            if (!existsSync(options.buildConfig)) {
                                console.error(chalk.red(`Error: Build config does not exist: ${options.buildConfig}`));
                                process.exit(1);
                            }
                            buildOptions = readJSONSync(options.buildConfig);
                        }

                        const platform = options.platform || buildOptions.platform || 'web-desktop';
                        await launcher.startPreview({
                            port,
                            platform,
                            open: options.open,
                            buildOptions,
                        });
                    } else {
                        // 默认：动态托管游戏预览（对齐编辑器浏览器预览）
                        await launcher.startGamePreview({
                            port,
                            scene: options.scene,
                            open: options.open,
                        });
                    }


                    // 保持进程运行
                    process.stdin.resume();
                } catch (error) {
                    console.error(chalk.red('Failed to start preview'));
                    console.error(error);
                    process.exit(1);
                }
            });
    }
}
