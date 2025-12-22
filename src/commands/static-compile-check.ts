import chalk from 'chalk';
import { BaseCommand } from './base';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 执行静态编译检查
 * @param projectPath 项目路径
 * @param showOutput 是否显示输出信息（默认 true）
 * @returns 返回 true 表示检查通过（没有 assets 相关错误），false 表示有错误
 */
export async function runStaticCompileCheck(projectPath: string, showOutput: boolean = true): Promise<boolean> {
    if (showOutput) {
        console.log(chalk.blue('Running TypeScript static compile check...'));
        console.log(chalk.gray(`Project: ${projectPath}`));
        console.log('');
    }

    // 切换到项目目录并执行命令
    // 使用 cmd /c 来执行管道命令，findstr 如果没有匹配会返回非零，需要忽略
    const command = `npx tsc --noEmit 2>&1 | findstr /i "assets"`;
    
    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd: projectPath,
            shell: 'cmd.exe', // Windows 使用 cmd.exe
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });

        if (stdout && stdout.trim()) {
            if (showOutput) {
                console.log(stdout);
            }
            return false; // 有输出说明找到了 assets 相关的错误
        }
        
        if (stderr && stderr.trim()) {
            if (showOutput) {
                console.error(chalk.red(stderr));
            }
            return false; // 有错误输出
        }

        // 如果没有输出，说明没有找到 assets 相关的错误
        if (showOutput) {
            console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
        }
        return true;
    } catch (error: any) {
        // execAsync 在命令返回非零退出码时会抛出错误
        // findstr 如果没有匹配项会返回退出码 1，这是正常的
        // tsc 如果有错误也会返回非零退出码
        
        let hasErrors = false;
        
        if (error.stdout && error.stdout.trim()) {
            // 有输出说明找到了匹配项
            if (showOutput) {
                console.log(error.stdout);
            }
            hasErrors = true;
        }
        
        if (error.stderr && error.stderr.trim()) {
            // 过滤掉 findstr 的 "FINDSTR: 找不到" 错误信息
            const filteredStderr = error.stderr
                .split('\n')
                .filter((line: string) => {
                    const trimmed = line.trim();
                    return trimmed && 
                           !trimmed.includes('FINDSTR') && 
                           !trimmed.toLowerCase().includes('找不到');
                })
                .join('\n');
            if (filteredStderr) {
                if (showOutput) {
                    console.error(chalk.red(filteredStderr));
                }
                hasErrors = true;
            }
        }
        
        // 判断是否真的没有匹配项（findstr 返回 1 且没有 stdout）
        const exitCode = error.code || 0;
        const hasOutput = (error.stdout && error.stdout.trim()) || 
                         (error.stderr && error.stderr.trim() && 
                          !error.stderr.includes('FINDSTR') &&
                          !error.stderr.toLowerCase().includes('找不到'));
        
        // 如果退出码是 1 且没有输出，说明 findstr 没有找到匹配项（这是正常的）
        if (exitCode === 1 && !hasOutput) {
            if (showOutput) {
                console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
            }
            return true;
        } else if (!hasOutput) {
            // 其他情况下的无输出
            if (showOutput) {
                console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
            }
            return true;
        }
        
        return !hasErrors;
    }
}

/**
 * StaticCompileCheck 命令类
 */
export class StaticCompileCheckCommand extends BaseCommand {
    register(): void {
        this.program
            .command('static-compile-check')
            .description('Run TypeScript static compile check and filter assets-related errors')
            .requiredOption('-j, --project <path>', 'Path to the Cocos project (required)')
            .action(async (options: any) => {
                try {
                    const resolvedPath = this.validateProjectPath(options.project);
                    
                    console.log(chalk.blue('Running TypeScript static compile check...'));
                    console.log(chalk.gray(`Project: ${resolvedPath}`));
                    console.log('');

                    // 切换到项目目录并执行命令
                    // 使用 cmd /c 来执行管道命令，findstr 如果没有匹配会返回非零，需要忽略
                    const command = `npx tsc --noEmit 2>&1 | findstr /i "assets"`;
                    
                    try {
                        const { stdout, stderr } = await execAsync(command, {
                            cwd: resolvedPath,
                            shell: 'cmd.exe', // Windows 使用 cmd.exe
                            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                        });

                        if (stdout && stdout.trim()) {
                            console.log(stdout);
                        }
                        
                        if (stderr && stderr.trim()) {
                            console.error(chalk.red(stderr));
                        }

                        // 如果没有输出，说明没有找到 assets 相关的错误
                        if ((!stdout || !stdout.trim()) && (!stderr || !stderr.trim())) {
                            console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
                        }
                    } catch (error: any) {
                        // execAsync 在命令返回非零退出码时会抛出错误
                        // findstr 如果没有匹配项会返回退出码 1，这是正常的
                        // tsc 如果有错误也会返回非零退出码
                        
                        if (error.stdout && error.stdout.trim()) {
                            // 有输出说明找到了匹配项
                            console.log(error.stdout);
                        }
                        
                        if (error.stderr && error.stderr.trim()) {
                            // 过滤掉 findstr 的 "FINDSTR: 找不到" 错误信息
                            const filteredStderr = error.stderr
                                .split('\n')
                                .filter((line: string) => {
                                    const trimmed = line.trim();
                                    return trimmed && 
                                           !trimmed.includes('FINDSTR') && 
                                           !trimmed.toLowerCase().includes('找不到');
                                })
                                .join('\n');
                            if (filteredStderr) {
                                console.error(chalk.red(filteredStderr));
                            }
                        }
                        
                        // 判断是否真的没有匹配项（findstr 返回 1 且没有 stdout）
                        const exitCode = error.code || 0;
                        const hasOutput = (error.stdout && error.stdout.trim()) || 
                                         (error.stderr && error.stderr.trim() && 
                                          !error.stderr.includes('FINDSTR') &&
                                          !error.stderr.toLowerCase().includes('找不到'));
                        
                        // 如果退出码是 1 且没有输出，说明 findstr 没有找到匹配项（这是正常的）
                        if (exitCode === 1 && !hasOutput) {
                            console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
                        } else if (!hasOutput) {
                            // 其他情况下的无输出
                            console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
                        }
                    }
                } catch (error) {
                    console.error(chalk.red('Failed to run static compile check:'), error);
                    process.exit(1);
                }
            });
    }
}

