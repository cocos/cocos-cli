import { Command } from 'commander';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';

/**
 * 命令基类
 */
export abstract class BaseCommand {
    protected program: Command;

    constructor(program: Command) {
        this.program = program;
    }

    /**
     * 注册命令
     */
    abstract register(): void;

    /**
     * 验证项目路径
     */
    protected validateProjectPath(projectPath: string): string {
        const resolvedPath = resolve(projectPath);
        if (!existsSync(resolvedPath)) {
            console.error(chalk.red(`Error: Project path does not exist: ${resolvedPath}`));
            process.exit(1);
        }

        // 检查是否是有效的 Cocos 项目
        const packageJsonPath = join(resolvedPath, 'package.json');
        if (!existsSync(packageJsonPath)) {
            console.error(chalk.red(`Error: Not a valid Cocos project: ${resolvedPath}`));
            console.error(chalk.yellow('Expected to find package.json in the project directory.'));
            process.exit(1);
        }

        return resolvedPath;
    }

    /**
     * 获取引擎路径
     */
    protected getEnginePath(options: any): string | null {
        if (options.engine) {
            return resolve(options.engine);
        }

        // TODO 需要修改为全局的配置系统，目前先尝试从 .user.json 读取
        try {
            const userConfig = require(join(process.cwd(), '.user.json'));
            if (userConfig.engine) {
                return resolve(userConfig.engine);
            }
        } catch (error) {
            // 忽略错误，使用默认值
        }

        // 尝试从环境变量读取
        if (process.env.COCOS_ENGINE_PATH) {
            return resolve(process.env.COCOS_ENGINE_PATH);
        }

        return null;
    }

    /**
     * 获取全局选项
     */
    protected getGlobalOptions(): any {
        // TODO 需要修改为全局的配置系统
        return this.program.opts();
    }
}

/**
 * 命令工具函数
 */
export class CommandUtils {
    /**
     * 显示项目信息
     */
    static showProjectInfo(projectPath: string): void {
        console.log(chalk.blue('Project Information:'));
        console.log(chalk.gray(`Path: ${projectPath}`));

        // 读取项目配置
        const packageJsonPath = join(projectPath, 'package.json');

        if (existsSync(packageJsonPath)) {
            const packageConfig = require(packageJsonPath);
            console.log(chalk.green('Package Config:'));
            console.log(`Name: ${packageConfig.name || 'N/A'}`);
            console.log(`Version: ${packageConfig.version || 'N/A'}`);
            console.log(`Description: ${packageConfig.description || 'N/A'}`);
        }
    }

    /**
     * 显示构建信息
     */
    static showBuildInfo(projectPath: string, enginePath: string, platform: string): void {
        console.log(chalk.blue('Building project...'));
        console.log(chalk.gray(`Project: ${projectPath}`));
        console.log(chalk.gray(`Engine: ${enginePath}`));
        console.log(chalk.gray(`Platform: ${platform}`));
    }

    /**
     * 显示导入信息
     */
    static showImportInfo(projectPath: string, enginePath: string): void {
        console.log(chalk.blue('Importing project...'));
        console.log(chalk.gray(`Project: ${projectPath}`));
        console.log(chalk.gray(`Engine: ${enginePath}`));
    }
}
