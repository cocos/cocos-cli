import chalk from 'chalk';
import { BaseCommand } from './base';
import { validateSimulatorOptions } from '../core/simulator/internal';
import {
    build,
    launchPreview,
    onDidChangeSession,
    stopAll,
} from '../lib/simulator/simulator';

/**
 * Simulator 命令类：构建并启动模拟器预览。
 *
 * 走 `lib/simulator` 这个对外 facade（与 Pink 用的是同一份协议），`launchPreview`
 * 内部先停后起、自带 preview server，所以这里只需要接好参数、订阅会话事件、保持进程存活。
 */
export class SimulatorCommand extends BaseCommand {
    register(): void {
        this.program
            .command('simulator')
            .description('Build and launch the Cocos simulator preview')
            .option('-j, --project <path>', 'Path to the Cocos project')
            .option('-p, --port <number>', 'Port number for the preview server', '9527')
            .option('-s, --scene <sceneUrlOrUuid>', 'Start scene (uuid or db:// url); defaults to project start scene')
            .option('-e, --engine-path <path>', 'Path to the Cocos engine (defaults to the bundled engine)')
            .option('--build', 'Build the native executable and runtime artifacts before launching')
            .option('--resolution <WxH>', 'Simulator window resolution, e.g. 960x640')
            .option('--landscape', 'Start in landscape orientation')
            .option('--show-console', 'Show the simulator console window')
            .action(async (options: any) => {
                let shuttingDown = false;
                try {
                    const projectPath = options.project ?? this.readLocalConfigProject();
                    if (!projectPath) {
                        console.error(chalk.red('Error: --project is required. Provide it via CLI or config.local.json'));
                        process.exit(1);
                    }
                    const resolvedPath = this.validateProjectPath(projectPath);

                    let resolution;
                    if (options.resolution) {
                        const match = /^(\d+)[xX](\d+)$/.exec(options.resolution);
                        if (!match) {
                            console.error(chalk.red('Error: Invalid resolution. Expected <width>x<height>, e.g. 960x640.'));
                            process.exit(1);
                        }
                        resolution = { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
                    }

                    const port = options.port ? Number(options.port) : undefined;
                    validateSimulatorOptions({ resolution, port, landscape: options.landscape });
                    // 构建和资源准备阶段也允许 Ctrl+C 取消，不能等窗口起来后才监听。
                    const shutdown = async () => {
                        if (shuttingDown) return;
                        shuttingDown = true;
                        try {
                            await stopAll();
                            process.exit(0);
                        } catch (error) {
                            console.error(error);
                            process.exit(1);
                        }
                    };
                    process.on('SIGINT', shutdown);
                    process.on('SIGTERM', shutdown);
                    if (options.build) {
                        console.log(chalk.blue('Building simulator native executable + runtime artifacts...'));
                        await build(options.enginePath);
                    }

                    onDidChangeSession((session) => {
                        if (session.readyAt && !session.exitedAt) {
                            console.log(chalk.green(`Simulator ready (pid ${session.pid})`));
                        } else if (session.exitedAt) {
                            console.log(chalk.yellow(`Simulator exited (code ${session.exitCode}, signal ${session.signal})`));
                        }
                    });

                    const result = await launchPreview({
                        projectPath: resolvedPath,
                        port,
                        startScene: options.scene,
                        enginePath: options.enginePath,
                        resolution,
                        landscape: options.landscape,
                        showConsole: options.showConsole,
                    });

                    console.log(chalk.green('Simulator launched:'));
                    console.log(`  session: ${result.session.id}`);
                    console.log(`  pid:     ${result.session.pid}`);
                    console.log(`  server:  ${result.prepared.serverURL}`);

                    // 保持预览服务运行。
                    process.stdin.resume();
                } catch (error) {
                    if (shuttingDown) return;
                    console.error(chalk.red('Failed to launch simulator'));
                    console.error(error);
                    process.exit(1);
                }
            });
    }
}
