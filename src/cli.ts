#!/usr/bin/env node

import { Command } from 'commander';
import { ImportCommand, BuildCommand, InfoCommand, McpServerCommand, CommandRegistry } from './commands';

const program = new Command();

// 全局配置
program
    .name('cocos')
    .description('Cocos CLI tool for project management and building')
    .version('1.0.0')
    .option('-d, --debug', 'Enable debug mode')
    .option('--no-interactive', 'Disable interactive mode (for CI)')
    .option('--engine <path>', 'Specify engine path')
    .option('--config <path>', 'Specify config file path');

// 全局错误处理
program.exitOverride();

// 注册命令
const commandRegistry = new CommandRegistry();
commandRegistry.register(new ImportCommand(program));
commandRegistry.register(new BuildCommand(program));
commandRegistry.register(new InfoCommand(program));
commandRegistry.register(new McpServerCommand(program));

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
} catch (error: any) {
    // 如果是帮助显示或版本显示错误，正常退出
    if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
        process.exit(0);
    }
    // 其他错误正常抛出
    throw error;
}

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(0);
}
