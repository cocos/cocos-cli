/**
 * 命令模块导出
 */

import { BuildCommand } from './build';
import { ImportCommand } from './import';
import { InfoCommand } from './info';
import { McpServerCommand } from './mcp-server';

export { BaseCommand, CommandUtils } from './base';
export { ImportCommand } from './import';
export { BuildCommand } from './build';
export { InfoCommand } from './info';
export { McpServerCommand } from './mcp-server';

/**
 * 所有命令类的类型
 */
export type CommandClass = ImportCommand | BuildCommand | InfoCommand | McpServerCommand;

/**
 * 命令注册器
 */
export class CommandRegistry {
    private commands: CommandClass[] = [];

    /**
     * 注册命令
     */
    register(command: CommandClass): void {
        this.commands.push(command);
    }

    /**
     * 注册所有命令
     */
    registerAll(): void {
        this.commands.forEach(command => command.register());
    }

    /**
     * 获取所有命令
     */
    getAllCommands(): CommandClass[] {
        return [...this.commands];
    }
}
