import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';

export interface CLIResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
}

/**
 * CLI 命令执行器
 * 用于执行打包后的 cocos CLI 命令
 * 
 * CLI 路径来源：
 * 1. 内部环境变量 __E2E_CLI_PATH__（由 setup.ts 设置）
 * 2. 默认路径 ../../dist/cli.js
 */
export class CLIRunner {
    private cliPath: string;

    constructor() {
        // 从内部环境变量读取 CLI 路径（由 globalSetup 设置）
        if (process.env.__E2E_CLI_PATH__) {
            this.cliPath = process.env.__E2E_CLI_PATH__;
        } else {
            // Fallback 到默认路径
            this.cliPath = resolve(__dirname, '../../dist/cli.js');
        }

        // 验证路径
        if (!existsSync(this.cliPath)) {
            throw new Error(
                `CLI not found: ${this.cliPath}\n` +
                `Please build the project first: npm run build\n` +
                `Or specify CLI path: npm run test:e2e -- --cli /path/to/cli.js`
            );
        }
    }

    /**
     * 获取当前使用的 CLI 路径
     */
    getCliPath(): string {
        return this.cliPath;
    }

    /**
     * 执行 CLI 命令
     * @param args 命令参数
     * @param options 执行选项
     */
    async run(args: string[], options: {
        cwd?: string;
        timeout?: number;
        env?: NodeJS.ProcessEnv;
    } = {}): Promise<CLIResult> {
        return new Promise((resolve, reject) => {
            const { cwd = process.cwd(), timeout = 300000, env = process.env } = options;

            let stdout = '';
            let stderr = '';
            let exitCode: number | null = null;
            let hasTimedOut = false;

            // 启动子进程
            const child: ChildProcess = spawn('node', [this.cliPath, ...args], {
                cwd,
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            // 设置超时
            const timer = setTimeout(() => {
                hasTimedOut = true;
                child.kill('SIGTERM');

                // 如果 SIGTERM 不起作用，5秒后强制杀死
                setTimeout(() => {
                    if (child.exitCode === null) {
                        child.kill('SIGKILL');
                    }
                }, 5000);
            }, timeout);

            // 收集标准输出
            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            // 收集错误输出
            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            // 进程错误
            child.on('error', (error) => {
                clearTimeout(timer);
                reject({
                    exitCode: null,
                    stdout,
                    stderr,
                    error,
                });
            });

            // 进程退出
            child.on('close', (code) => {
                clearTimeout(timer);
                exitCode = code;

                if (hasTimedOut) {
                    reject({
                        exitCode,
                        stdout,
                        stderr,
                        error: new Error(`Command timeout after ${timeout}ms`),
                    });
                } else {
                    resolve({
                        exitCode,
                        stdout,
                        stderr,
                    });
                }
            });
        });
    }

    /**
     * 执行 build 命令
     */
    async build(options: {
        project: string;
        platform: string;
        config?: string;
        debug?: boolean;
    }): Promise<CLIResult> {
        const args = ['build', '--project', options.project, '--platform', options.platform];

        if (options.config) {
            args.push('--config', options.config);
        }

        // 不设置 cwd，让命令在当前目录执行
        // 这样即使 project 路径无效，命令也能正常执行并返回错误
        return this.run(args);
    }

    /**
     * 执行 info 命令
     */
    async info(options: { project?: string } = {}): Promise<CLIResult> {
        const args = ['info'];

        if (options.project) {
            args.push('--project', options.project);
        }

        return this.run(args);
    }

    /**
     * 执行 create 命令
     */
    async create(options: {
        name: string;
        output: string;
        template?: string;
    }): Promise<CLIResult> {
        const args = ['create', options.name, '--output', options.output];

        if (options.template) {
            args.push('--template', options.template);
        }

        return this.run(args);
    }

    /**
     * 执行 wizard 命令（需要交互式输入）
     */
    async wizard(inputs: string[], options: { cwd?: string } = {}): Promise<CLIResult> {
        return new Promise((resolve, reject) => {
            const { cwd = process.cwd() } = options;

            let stdout = '';
            let stderr = '';
            let exitCode: number | null = null;

            const child: ChildProcess = spawn('node', [this.cliPath, 'wizard'], {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let inputIndex = 0;

            // 监听输出，自动输入
            child.stdout?.on('data', (data) => {
                stdout += data.toString();

                // 当检测到需要输入时，自动提供输入
                if (inputIndex < inputs.length) {
                    setTimeout(() => {
                        child.stdin?.write(inputs[inputIndex] + '\n');
                        inputIndex++;
                    }, 100);
                }
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                reject({
                    exitCode: null,
                    stdout,
                    stderr,
                    error,
                });
            });

            child.on('close', (code) => {
                exitCode = code;
                resolve({
                    exitCode,
                    stdout,
                    stderr,
                });
            });
        });
    }
}

// 导出单例实例
export const cliRunner = new CLIRunner();

