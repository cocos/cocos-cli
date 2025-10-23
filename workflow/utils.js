/**
 * 注意：这里不要使用不是 nodejs 原生的模块
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 是否是开发环境
 */
function hasDevelopmentEnvironment() {
    return fs.existsSync(path.join(__dirname, '../repo.json'));
}

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
 * 统一输出标题日志
 * @param title
 */
function logTitle(title) {
    const chalk = require('chalk');
    const prefix = ''.padStart(20, '=');
    console.log(chalk.magenta(`${prefix} ${title} ${prefix}`));
}


module.exports = {
    runCommand,
    runTscCommand,
    logTitle,
    hasDevelopmentEnvironment
};
