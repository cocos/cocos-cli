import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { createBanner, createWelcomeMessage, createStartupMessage, createStatusBar } from './banner';
import { config } from './config';
import { log } from '../core/base/utils/log';

/**
 * 交互式 CLI 界面
 */
export class InteractiveCLI {
    private spinner: ora.Ora | null = null;
    private progressBar: cliProgress.SingleBar | null = null;

    /**
     * 显示欢迎界面
     */
    showWelcome(): void {
        if (!config.shouldDisplayBanner()) {
            return;
        }

        console.clear();
        log(createBanner());
        log(createWelcomeMessage());
    }

    /**
     * 显示启动消息（类似 Gemini CLI）
     */
    showStartupMessage(): void {
        if (!config.shouldDisplayBanner()) {
            return;
        }

        console.clear();
        log(createStartupMessage());
        log(createStatusBar());
    }

    /**
     * 显示加载动画
     */
    startSpinner(message: string): void {
        if (!config.shouldUseSpinner()) {
            log(chalk.cyan(`⏳ ${message}`));
            return;
        }

        this.spinner = ora({
            text: message,
            spinner: 'dots',
            color: 'cyan'
        }).start();
    }

    /**
     * 更新加载动画消息
     */
    updateSpinner(message: string): void {
        if (this.spinner) {
            this.spinner.text = message;
        }
    }

    /**
     * 停止加载动画
     */
    stopSpinner(success: boolean = true, message?: string): void {
        if (!config.shouldUseSpinner()) {
            const status = success ? '✅' : '❌';
            log(chalk.cyan(`${status} ${message || (success ? '完成' : '失败')}`));
            return;
        }

        if (this.spinner) {
            if (success) {
                this.spinner.succeed(message || '完成');
            } else {
                this.spinner.fail(message || '失败');
            }
            this.spinner = null;
        }
    }

    /**
     * 显示进度条
     */
    startProgress(total: number, message: string = '处理中...'): void {
        if (!config.shouldUseProgressBar()) {
            log(chalk.cyan(`📊 ${message} (0/${total})`));
            return;
        }

        this.progressBar = new cliProgress.SingleBar({
            format: `${message} |{bar}| {percentage}% | {value}/{total} | {eta}s`,
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true
        });
        this.progressBar.start(total, 0);
    }

    /**
     * 更新进度条
     */
    updateProgress(value: number): void {
        if (!config.shouldUseProgressBar()) {
            // 在非交互模式下，每 10% 显示一次进度
            if (value % 10 === 0) {
                log(chalk.cyan(`📊 进度: ${value}%`));
            }
            return;
        }

        if (this.progressBar) {
            this.progressBar.update(value);
        }
    }

    /**
     * 停止进度条
     */
    stopProgress(): void {
        if (!config.shouldUseProgressBar()) {
            log(chalk.cyan('📊 进度: 100% 完成'));
            return;
        }

        if (this.progressBar) {
            this.progressBar.stop();
            this.progressBar = null;
        }
    }

    /**
     * 显示确认对话框
     */
    async confirm(message: string, defaultValue: boolean = true): Promise<boolean> {
        if (!config.shouldUseInteractive()) {
            log(chalk.cyan(`❓ ${message} (默认: ${defaultValue ? '是' : '否'})`));
            return defaultValue;
        }

        const { confirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmed',
                message: chalk.cyan(message),
                default: defaultValue
            }
        ]);
        return confirmed;
    }

    /**
     * 显示选择列表
     */
    async select<T = string>(
        message: string,
        choices: Array<{ name: string; value: T; disabled?: boolean }>
    ): Promise<T> {
        if (!config.shouldUseInteractive()) {
            log(chalk.cyan(`📋 ${message}`));
            choices.forEach((choice, index) => {
                const status = choice.disabled ? '❌' : '✅';
                log(chalk.gray(`  ${index + 1}. ${status} ${choice.name}`));
            });
            // 返回第一个可用选项
            const availableChoice = choices.find(choice => !choice.disabled);
            return availableChoice ? availableChoice.value : choices[0].value;
        }

        const { selected } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selected',
                message: chalk.cyan(message),
                choices: choices.map(choice => ({
                    ...choice,
                    name: choice.disabled ? chalk.gray(choice.name + ' (不可用)') : choice.name
                }))
            }
        ]);
        return selected;
    }

    /**
     * 显示输入框
     */
    async input(message: string, defaultValue?: string): Promise<string> {
        if (!config.shouldUseInteractive()) {
            log(chalk.cyan(`✏️  ${message} (默认: ${defaultValue || '无'})`));
            return defaultValue || '';
        }

        const { value } = await inquirer.prompt([
            {
                type: 'input',
                name: 'value',
                message: chalk.cyan(message),
                default: defaultValue,
                validate: (input: string) => {
                    if (!input.trim()) {
                        return '请输入有效值';
                    }
                    return true;
                }
            }
        ]);
        return value;
    }

    /**
     * 显示多选列表
     */
    async checkbox<T = string>(
        message: string,
        choices: Array<{ name: string; value: T; checked?: boolean }>
    ): Promise<T[]> {
        const { selected } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'selected',
                message: chalk.cyan(message),
                choices: choices.map(choice => ({
                    ...choice,
                    name: choice.checked ? chalk.green(`✓ ${choice.name}`) : choice.name
                }))
            }
        ]);
        return selected;
    }

    /**
     * 显示密码输入框
     */
    async password(message: string): Promise<string> {
        const { value } = await inquirer.prompt([
            {
                type: 'password',
                name: 'value',
                message: chalk.cyan(message),
                mask: '*'
            }
        ]);
        return value;
    }

    /**
     * 显示成功消息
     */
    success(message: string): void {
        log(chalk.green(`✅ ${message}`));
    }

    /**
     * 显示错误消息
     */
    error(message: string): void {
        log(chalk.red(`❌ ${message}`));
    }

    /**
     * 显示警告消息
     */
    warning(message: string): void {
        log(chalk.yellow(`⚠️  ${message}`));
    }

    /**
     * 显示信息消息
     */
    info(message: string): void {
        log(chalk.cyan(`ℹ️  ${message}`));
    }

    /**
     * 显示分隔线
     */
    separator(char: string = '─', length: number = 60): void {
        log(chalk.gray(char.repeat(length)));
    }

    /**
     * 显示表格
     */
    table(headers: string[], rows: string[][]): void {
        // 简单的表格实现
        const maxWidths = headers.map((header, i) => {
            const maxWidth = Math.max(
                header.length,
                ...rows.map(row => row[i]?.length || 0)
            );
            return Math.min(maxWidth, 30); // 限制最大宽度
        });

        // 打印表头
        const headerRow = headers.map((header, i) =>
            header.padEnd(maxWidths[i])
        ).join(' | ');
        log(chalk.bold(headerRow));

        // 打印分隔线
        const separatorRow = maxWidths.map(width =>
            '─'.repeat(width)
        ).join('─┼─');
        log(chalk.gray(separatorRow));

        // 打印数据行
        rows.forEach(row => {
            const dataRow = row.map((cell, i) =>
                (cell || '').padEnd(maxWidths[i])
            ).join(' | ');
            log(dataRow);
        });
    }
}

// 创建全局实例
export const interactive = new InteractiveCLI();
