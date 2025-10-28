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

/**
 * 使用 7zip 创建压缩包
 * @param {string} sourceDir 要压缩的源目录
 * @param {string} outputPath 输出的压缩包路径
 * @param {object} [options] 压缩选项
 * @param {number} [options.compressionLevel=5] 压缩级别 (0-9)
 * @param {string} [options.format='zip'] 压缩格式 ('zip', '7z', 'tar', 'gzip')
 * @param {string[]} [options.exclude] 排除的文件模式
 * @param {boolean} [options.preserveSymlinks=true] 是否保留符号链接
 * @param {number} [options.timeout=1800000] 超时时间（毫秒）
 * @returns {Promise<string>} 返回创建的压缩包路径
 */
async function create7ZipArchive(sourceDir, outputPath, options = {}) {
    const sevenBin = require('7zip-bin');
    const {
        compressionLevel = 5,
        format = 'zip',
        exclude = ['*.DS_Store'],
        preserveSymlinks = true,
        timeout = 1800000 // 30分钟
    } = options;

    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 删除现有的压缩包（如果存在）
    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
    }

    // 构建 7zip 命令参数
    const args = ['a']; // 添加到压缩包

    // 设置压缩格式
    args.push(`-t${format}`);

    // 设置压缩级别
    args.push(`-mx=${compressionLevel}`);

    // 保留符号链接（仅在支持的格式下）
    if (preserveSymlinks && (format === 'zip' || format === '7z')) {
        args.push('-snl'); // store symbolic links
    }

    // 添加排除模式
    exclude.forEach(pattern => {
        args.push(`-x!${pattern}`);
    });

    // 输出文件路径
    args.push(outputPath);

    // 源目录（使用通配符包含所有内容）
    args.push(path.join(sourceDir, '*'));

    console.log(`🔧 使用 7zip 创建压缩包...`);
    console.log(`📁 源目录: ${sourceDir}`);
    console.log(`📦 输出文件: ${outputPath}`);
    console.log(`⚙️  压缩格式: ${format}, 压缩级别: ${compressionLevel}`);

    try {
        await runCommand(sevenBin.path7za, args, {
            stdio: 'pipe',
            timeout: timeout,
            debug: true
        });

        // 检查文件是否创建成功
        if (!fs.existsSync(outputPath)) {
            throw new Error('压缩包创建失败：输出文件不存在');
        }

        const stats = fs.statSync(outputPath);
        console.log(`✅ 压缩包创建完成: ${path.basename(outputPath)}`);
        console.log(`📦 压缩包大小: ${formatBytes(stats.size)}`);

        return outputPath;
    } catch (error) {
        console.error('❌ 7zip 压缩失败:', error.message);
        throw error;
    }
}

/**
 * 格式化字节大小
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的大小字符串
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


module.exports = {
    runCommand,
    runTscCommand,
    logTitle,
    hasDevelopmentEnvironment,
    create7ZipArchive,
    formatBytes
};
