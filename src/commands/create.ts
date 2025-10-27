import chalk from 'chalk';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { BaseCommand } from './base';
import project from '../core/project';
import { log } from '../core/base/utils/log';

/**
 * Create 命令类
 */
export class CreateCommand extends BaseCommand {
    register(): void {
        this.program
            .command('create')
            .description('Create a new Cocos project')
            .requiredOption('--project <path>', 'Target directory to create the project (required)')
            .option('-t, --type <type>', 'Project type (2d or 3d)', '3d')
            .action(async (options: any) => {
                try {
                    const targetPath = resolve(options.project);
                    const type = (options.type === '2d' ? '2d' : '3d');

                    log(chalk.blue('Creating project...'));
                    log(chalk.gray(`Path: ${targetPath}`));
                    log(chalk.gray(`Type: ${type}`));

                    // 如果目标路径已存在，仅提示，不强制失败（交由底层处理器决定）
                    if (existsSync(targetPath)) {
                        log(chalk.yellow('Warning: target path already exists, will try to create inside it.'));
                    }

                    const ok = await project.create(targetPath, type as '2d' | '3d');
                    if (ok) {
                        log(chalk.green('✓ Project created successfully!'));
                        log(chalk.gray('Next steps:'));
                        log(`  cd ${targetPath}`);
                        log('  cocos import --project .');
                    } else {
                        console.error(chalk.red('✗ Failed to create project.'));
                        process.exit(1);
                    }
                } catch (error) {
                    console.error(chalk.red('Failed to create project:'), error);
                    process.exit(1);
                }
            });
    }
}


