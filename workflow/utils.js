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
    const cmd = path.join(binDir, process.platform === 'win32' ? 'tsc.cmd': 'tsc');
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

/**
 * 递归复制指定目录列表下的所有文件到目标目录，保留源目录层级
 * @param {string[]} sourceDirs 源目录列表（绝对或相对路径）
 * @param {string} targetDir 目标目录（绝对或相对路径）
 */
function copyFilesFromDirsWithStructure(sourceDirs, targetDir) {
    const absTargetDir = path.resolve(process.cwd(), targetDir);

    if (!fs.existsSync(absTargetDir)) {
        fs.mkdirSync(absTargetDir, { recursive: true });
    }

    for (const srcDir of sourceDirs) {
        const absSrcDir = path.resolve(process.cwd(), srcDir);
        if (!fs.existsSync(absSrcDir)) continue;

        // 保留相对路径
        const relativeBase = srcDir.split(path.sep).slice(-3).join(path.sep);

        copyRecursiveWithBase(absSrcDir, absTargetDir, relativeBase);
    }
}

/**
 * 递归复制目录内容，保留 basePath
 * @param {string} src 源目录
 * @param {string} dest 目标目录
 * @param {string} basePath 相对基准路径
 */
function copyRecursiveWithBase(src, dest, basePath) {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const relPath = path.relative(src, srcPath);
        const destPath = path.join(dest, basePath, relPath);

        if (entry.isDirectory()) {
            if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
            copyRecursiveWithBase(srcPath, dest, path.join(basePath, entry.name));
        } else if (entry.isFile()) {
            const parentDir = path.dirname(destPath);
            if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied: ${srcPath} -> ${destPath}`);
        }
    }
}

module.exports = {
    runCommand,
    runTscCommand,
    copyDirWithIgnore,
    copyFilesFromDirsWithStructure,
    logTitle
};
