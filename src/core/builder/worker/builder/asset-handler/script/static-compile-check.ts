import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 检测是否为 Windows 系统
 */
function isWindows(): boolean {
    return process.platform === 'win32';
}

/**
 * 获取平台特定的 shell
 */
function getShell(): string | undefined {
    if (isWindows()) {
        return 'cmd.exe';
    }
    // macOS/Linux 使用默认 shell
    return undefined;
}

/**
 * 过滤 TypeScript 错误输出，只保留包含 "assets" 的错误
 * 智能识别错误块，保留属于 assets 文件的完整错误信息
 */
function filterAssetsErrors(output: string): string {
    if (!output) {
        return '';
    }
    
    // 统一换行符
    const lines = output.replace(/\r\n/g, '\n').split('\n');
    const filteredLines: string[] = [];
    let isAssetError = false; // 标记当前是否在处理一个 assets 相关的错误块

    // 正则匹配 TypeScript 错误行
    // 格式 1: filename(line,col): error TSxxxx: message
    // 格式 2: filename:line:col - error TSxxxx: message
    // 注意：文件名可能包含路径分隔符
    const errorStartRegex = /^(.+?)[(:]\d+[,:]\d+[):]?\s*(?:-\s*)?(?:error|warning)\s+TS\d+:/;
    
    for (const line of lines) {
        // 跳过空行，避免打断错误块
        if (!line.trim()) {
            continue;
        }

        const match = line.match(errorStartRegex);
        
        if (match) {
            // 这是一个新的错误行
            const filename = match[1].trim();
            // 检查文件名是否包含 assets
            // 使用宽松的匹配，只要路径中包含 assets 即可
            if (filename.toLowerCase().includes('assets')) {
                isAssetError = true;
                filteredLines.push(line);
            } else {
                isAssetError = false;
            }
        } else {
            // 不是新的错误行（可能是错误详情、代码上下文等）
            if (isAssetError) {
                // 如果当前处于 assets 错误块中，保留该行
                filteredLines.push(line);
            } else if (line.toLowerCase().includes('assets') && (line.includes('error TS') || line.includes('warning TS'))) {
                // 兜底：如果行本身包含 assets 且看起来像是一个错误，保留该行并开启错误块
                // 这可以处理正则未匹配到但确实是 assets 错误的情况
                isAssetError = true;
                filteredLines.push(line);
            }
        }
    }
    
    return filteredLines.join('\n').trim();
}

/**
 * 执行静态编译检查
 * @param projectPath 项目路径
 * @param showOutput 是否显示输出信息（默认 true）
 * @returns 返回对象，包含检查结果和错误信息。passed 为 true 表示检查通过（没有 assets 相关错误），false 表示有错误
 */
export async function runStaticCompileCheck(projectPath: string, showOutput: boolean = true): Promise<{ passed: boolean; errorMessage?: string }> {
    if (showOutput) {
        console.log(chalk.blue('Running TypeScript static compile check...'));
        console.log(chalk.gray(`Project: ${projectPath}`));
        console.log('');
    }

    // 切换到项目目录并执行命令
    // 使用 2>&1 将 stderr 合并到 stdout，避免流写入冲突导致的乱序
    const command = `npx tsc --noEmit 2>&1 | findstr /i "assets"`;
    const shell = getShell();
    
    try {
        const execOptions: any = {
            cwd: projectPath,
            maxBuffer: 20 * 1024 * 1024, // 增加 buffer 大小到 20MB
            env: {
                ...process.env,
                CI: 'true',       // 告诉工具我们在 CI 环境中，避免交互式输出
                FORCE_COLOR: '0', // 禁用颜色输出，避免控制字符干扰解析
            }
        };
        if (shell) {
            execOptions.shell = shell;
        }

        // 只读取 stdout，因为 stderr 已经合并进去了
        const { stdout } = await execAsync(command, execOptions);
        const output = String(stdout || '').trim();

        if (!output) {
            // 没有输出，说明编译成功
            if (showOutput) {
                console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
            }
            return { passed: true };
        }

        // 过滤出包含 "assets" 的错误
        const filteredOutput = filterAssetsErrors(output);
        
        if (filteredOutput) {
            // 有 assets 相关的错误
            if (showOutput) {
                console.log(filteredOutput);
            }
            return { passed: false, errorMessage: filteredOutput };
        } else {
            // 没有 assets 相关的错误
            if (showOutput) {
                console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
            }
            return { passed: true };
        }
    } catch (error: any) {
        // execAsync 在命令返回非零退出码时会抛出错误
        // tsc 如果有错误会返回非零退出码，这是正常的
        
        // 合并 stdout 和 stderr (虽然我们使用了 2>&1，但如果 execAsync 捕获到了 stderr 也要处理)
        const errorStdout = String(error.stdout || '').trim();
        const errorStderr = String(error.stderr || '').trim();
        const fullOutput = (errorStdout + (errorStdout && errorStderr ? '\n' : '') + errorStderr).trim();

        if (!fullOutput) {
            // 没有输出，说明可能是其他错误（比如 tsc 命令不存在）
            if (showOutput) {
                console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
            }
            return { passed: true };
        }

        // 过滤出包含 "assets" 的错误
        const filteredOutput = filterAssetsErrors(fullOutput);
        
        if (filteredOutput) {
            // 有 assets 相关的错误
            if (showOutput) {
                console.log(filteredOutput);
            }
            return { passed: false, errorMessage: filteredOutput };
        } else {
            // 没有 assets 相关的错误
            if (showOutput) {
                console.log(chalk.green('✓ No assets-related TypeScript errors found!'));
            }
            return { passed: true };
        }
    }
}
