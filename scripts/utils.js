import { spawn } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

/**
 * 异步执行命令
 * @param {string} cmd 命令
 * @param {string[]} args 参数数组
 * @param {object} [opts] 选项
 * @param {boolean} [opts.debug=true] 是否输出日志
 * @returns {Promise<void>}
 */
export async function runCommand(cmd, args = [], opts = {}) {
    const { debug = true, shell = true, ...spawnOpts } = opts;
    const isWindows = process.platform === 'win32';

    // 如果是 Windows 且命令是 "npm"，改用 "npm.cmd"
    if (isWindows && cmd === 'npm') {
        cmd = 'npm.cmd';
    }

    let finalCmd = cmd;
    let finalArgs = args;

    if (isWindows && shell) {
        finalCmd = 'cmd.exe';
        finalArgs = ['/c', cmd, ...args];
    }

    if (debug) {
        console.log(`Executing: ${finalCmd} ${finalArgs.join(' ')}`);
    }

    const child = spawn(finalCmd, finalArgs, {
        stdio: 'inherit',
        shell: shell,
        ...spawnOpts,
    });

    return new Promise((resolve, reject) => {
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Process exited with code ${code}`));
        });
        child.on('error', reject);
    });
}


/**
 * 复制目录（忽略规则）
 * @param {string} source 源目录
 * @param {string} target 目标目录
 * @param {string[]} ignoreExts 支持普通后缀（如 '.ts'）或排除规则（如 '!.d.ts'）
 */
export function copySync(source, target, ignoreExts = []) {
    if (!existsSync(target)) mkdirSync(target, { recursive: true });

    // 分离普通忽略规则和排除规则
    const keepRules = ignoreExts.filter(r => r.startsWith('!')).map(r => r.slice(1));
    const ignoreRules = ignoreExts.filter(r => !r.startsWith('!'));

    readdirSync(source).forEach(file => {
        const srcPath = join(source, file);
        const destPath = join(target, file);
        const stat = statSync(srcPath);

        // 检查是否被排除规则保留（优先级最高）
        const shouldKeep = keepRules.some(rule => file.endsWith(rule));
        if (!shouldKeep) {
            // 检查是否匹配普通忽略规则
            const shouldIgnore = ignoreRules.some(ext => file.endsWith(ext));
            if (shouldIgnore) return;
        }

        if (stat.isDirectory()) {
            copySync(srcPath, destPath, ignoreExts);
        } else {
            copyFileSync(srcPath, destPath);
        }
    });
}

/**
 * 统一输出标题日志
 * @param title
 */
export function logTitle(title) {
    const prefix = ''.padStart(20, '=');
    console.log(chalk.magenta(`${prefix} ${title} ${prefix}`));
}
