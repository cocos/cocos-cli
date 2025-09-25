const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

/**
 * 异步执行命令
 * @param {string} cmd 命令
 * @param {string[]} args 参数数组
 * @param {object} [opts] 选项
 * @param {boolean} [opts.debug=true] 是否输出日志
 * @returns {Promise<void>}
 */
async function runCommand(cmd, args = [], opts = {}) {
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
 * 执行 Tsc 命令
 * @param sourceDir
 */
function runTscCommand(sourceDir) {
    const binDir = path.join(__dirname, '../node_modules', '.bin');
    const cmd = path.join(binDir, process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
    spawnSync(cmd, { cwd: sourceDir, shell: true, stdio: 'inherit' });
}

/**
 * 复制目录（忽略规则）
 * @param {string} source 源目录
 * @param {string} target 目标目录
 * @param {string[]} ignoreExts 支持普通后缀（如 '.ts'）或排除规则（如 '!.d.ts'）
 */
function copyDirWithIgnore(source, target, ignoreExts = []) {
    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });

    // 分离普通忽略规则和排除规则
    const keepRules = ignoreExts.filter(r => r.startsWith('!')).map(r => r.slice(1));
    const ignoreRules = ignoreExts.filter(r => !r.startsWith('!'));

    fs.readdirSync(source).forEach(file => {
        const srcPath = path.join(source, file);
        const destPath = path.join(target, file);
        const stat = fs.statSync(srcPath);

        // 检查是否被排除规则保留（优先级最高）
        const shouldKeep = keepRules.some(rule => file.endsWith(rule));
        if (!shouldKeep) {
            // 检查是否匹配普通忽略规则
            const shouldIgnore = ignoreRules.some(ext => file.endsWith(ext));
            if (shouldIgnore) return;
        }

        if (stat.isDirectory()) {
            copyDirWithIgnore(srcPath, destPath, ignoreExts);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

/**
 * 统一输出标题日志
 * @param title
 */
function logTitle(title) {
    const prefix = ''.padStart(20, '=');
    console.log(chalk.magenta(`${prefix} ${title} ${prefix}`));
}


module.exports = {
    runCommand,
    runTscCommand,
    copyDirWithIgnore,
    logTitle
};
