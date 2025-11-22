/**
 * 命令模块导出
 */

import { BuildCommand } from './build';
import { McpServerCommand } from './mcp-server';
import { CreateCommand } from './create';
import { MakeCommand } from './make';
import { RunCommand } from './run';

export { BaseCommand, CommandUtils } from './base';
export { BuildCommand } from './build';
export { McpServerCommand } from './mcp-server';
export { CreateCommand } from './create';
export { MakeCommand } from './make';
export { RunCommand } from './run';

/**
 * 所有命令类的类型
 */
export type CommandClass = BuildCommand | McpServerCommand | CreateCommand | MakeCommand | RunCommand;

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
