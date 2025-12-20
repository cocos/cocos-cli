#!/usr/bin/env node
import { initSentry } from './core/base/sentry';
initSentry();

import { Command } from 'commander';
import { BuildCommand, McpServerCommand, CommandRegistry, CreateCommand, MakeCommand, RunCommand } from './commands';
import { config } from './display/config';

const program = new Command();

// 全局配置
program
    .name('cocos')
    .description('Cocos CLI tool for project management and building')
    .version('1.0.0')
    .option('--debug', 'Enable debug mode')
    .option('--no-interactive', 'Disable interactive mode (for CI)')
    .option('--config <path>', 'Specify config file path');

// 全局错误处理
program.exitOverride();

// 注册命令
const commandRegistry = new CommandRegistry();
commandRegistry.register(new CreateCommand(program));
commandRegistry.register(new BuildCommand(program));
commandRegistry.register(new McpServerCommand(program));
commandRegistry.register(new MakeCommand(program));
commandRegistry.register(new RunCommand(program));

// 注册所有命令
commandRegistry.registerAll();

// 错误处理
program.configureHelp({
    sortSubcommands: true,
    subcommandTerm: (cmd) => cmd.name()
});

// 解析命令行参数
try {
    program.parse();

    // 设置交互模式
    const interactiveMode = !program.getOptionValue('noInteractive');
    config.setInteractiveMode(interactiveMode);

} catch (error: any) {
    // 如果是帮助显示或版本显示错误，正常退出
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
        process.exit(0);
    }

    // Commander.js 参数错误（如缺少 requiredOption）
    if (error.code === 'commander.missingMandatoryOptionValue' ||
        error.code === 'commander.missingArgument' ||
        error.exitCode) {
        console.error(error.message);
        process.exit(error.exitCode || 1);
    }

    // 其他错误
    console.error('Error:', error.message || error);
    process.exit(1);
}

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(0);
}
