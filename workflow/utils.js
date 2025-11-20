/**
 * Note: Do not use non-native nodejs modules here
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Check if it is a development environment
 */
function hasDevelopmentEnvironment() {
    return fs.existsSync(path.join(__dirname, '../repo.json'));
}

/**
 * Execute command asynchronously
 * @param {string} cmd Command
 * @param {string[]} args Arguments array
 * @param {object} [opts] Options
 * @param {boolean} [opts.debug=true] Whether to log output
 * @returns {Promise<void>}
 */
async function runCommand(cmd, args = [], opts = {}) {
    const { debug = true, shell = true, ...spawnOpts } = opts;
    const isWindows = process.platform === 'win32';

    // If Windows and command is "npm", use "npm.cmd" instead
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
 * Execute Tsc command
 * @param sourceDir
 */
function runTscCommand(sourceDir) {
    const binDir = path.join(__dirname, '../node_modules', '.bin');
    const cmd = path.join(binDir, process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
    spawnSync(cmd, { cwd: sourceDir, shell: true, stdio: 'inherit' });
}

/**
 * Unified title log output
 * @param title
 */
function logTitle(title) {
    const chalk = require('chalk');
    const prefix = ''.padStart(20, '=');
    console.log(chalk.magenta(`${prefix} ${title} ${prefix}`));
}

/**
 * Create an archive with 7zip
 * @param {string} sourceDir Source directory to archive
 * @param {string} outputPath Output archive path
 * @param {object} [options] Zip options
 * @param {number} [options.compressionLevel=5] Compression level (0-9)
 * @param {string} [options.format='zip'] Archive format ('zip', '7z', 'tar', 'gzip')
 * @param {string[]} [options.exclude] Glob patterns to exclude
 * @param {boolean} [options.preserveSymlinks=true] Preserve symbolic links when supported
 * @param {number} [options.timeout=1800000] Timeout in milliseconds
 * @returns {Promise<string>} The generated archive path
 */
async function create7ZipArchive(sourceDir, outputPath, options = {}) {
    const sevenBin = require('7zip-bin');
    const {
        compressionLevel = 5,
        format = 'zip',
        exclude = ['*.DS_Store'],
        preserveSymlinks = true,
        timeout = 1800000 // 30 minutes
    } = options;

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Delete existing archive (if exists)
    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
    }

    // Build 7zip command arguments
    const args = ['a']; // Add to archive

    // Set compression format
    args.push(`-t${format}`);

    // Set compression level
    args.push(`-mx=${compressionLevel}`);

    // Preserve symbolic links (only for supported formats)
    if (preserveSymlinks && (format === 'zip' || format === '7z')) {
        args.push('-snl'); // store symbolic links
    }

    // Add exclude patterns
    exclude.forEach(pattern => {
        args.push(`-x!${pattern}`);
    });

    // Output file path
    args.push(outputPath);

    // Source directory (use wildcard to include all content)
    args.push(path.join(sourceDir, '*'));

    console.log(`🔧 Creating archive with 7zip...`);
    console.log(`📁 Source directory: ${sourceDir}`);
    console.log(`📦 Output file: ${outputPath}`);
    console.log(`⚙️  Compression format: ${format}, Compression level: ${compressionLevel}`);

    // Ensure 7za binary has execute permission (non-Windows systems)
    if (process.platform !== 'win32' && fs.existsSync(sevenBin.path7za)) {
        try {
            const stats = fs.statSync(sevenBin.path7za);
            // Check for execute permission (check owner, group, or others)
            const mode = stats.mode;
            const executePermission = 0o111; // Execute permission mask (x in rwx rwx rwx)
            if ((mode & executePermission) === 0) {
                console.log(`🔧 Setting execute permission for 7za binary...`);
                // Add execute permission: preserve original permissions, add execute permission
                fs.chmodSync(sevenBin.path7za, mode | 0o111);
            }
        } catch (error) {
            console.warn(`⚠️  Failed to set 7za execute permission: ${error.message}`);
            // Even if setting permission fails, continue trying to execute, it might fail but at least give a clearer error
        }
    }

    try {
        await runCommand(sevenBin.path7za, args, {
            stdio: 'pipe',
            timeout: timeout,
            debug: true
        });

        // Check if file was created successfully
        if (!fs.existsSync(outputPath)) {
            throw new Error('Archive creation failed: output file does not exist');
        }

        const stats = fs.statSync(outputPath);
        console.log(`✅ Archive created: ${path.basename(outputPath)}`);
        console.log(`📦 Archive size: ${formatBytes(stats.size)}`);

        return outputPath;
    } catch (error) {
        console.error('❌ 7zip compression failed:', error.message);
        throw error;
    }
}

/**
 * Create an archive using the native macOS zip command
 * @param {string} sourceDir Source directory to archive
 * @param {string} outputPath Output archive path
 * @param {object} [options] Zip options
 * @param {number} [options.compressionLevel=5] Compression level (0-9)
 * @param {string[]} [options.exclude] Glob patterns to exclude
 * @param {boolean} [options.preserveSymlinks=true] Preserve symbolic links
 * @returns {Promise<string>} The generated archive path
 */
async function createMacZipArchive(sourceDir, outputPath, options = {}) {
    if (process.platform !== 'darwin') {
        throw new Error('createMacZipArchive can only be used on macOS');
    }

    const {
        compressionLevel = 5,
        exclude = ['*.DS_Store'],
        preserveSymlinks = true
    } = options;

    const resolvedSourceDir = path.resolve(sourceDir);
    const resolvedOutputPath = path.resolve(outputPath);
    const parentDir = path.dirname(resolvedSourceDir);
    const sourceDirName = path.basename(resolvedSourceDir);

    const outputDir = path.dirname(resolvedOutputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    if (fs.existsSync(resolvedOutputPath)) {
        fs.unlinkSync(resolvedOutputPath);
    }

    const zipArgs = ['-r', `-${compressionLevel}`];

    if (preserveSymlinks) {
        zipArgs.push('-y');
    }

    zipArgs.push(resolvedOutputPath);
    zipArgs.push(sourceDirName);

    exclude.forEach(pattern => {
        zipArgs.push('-x', pattern);
    });

    console.log('🍏 Using macOS native zip to create archive...');
    console.log(`📁 Source directory: ${resolvedSourceDir}`);
    console.log(`📦 Output file: ${resolvedOutputPath}`);

    await runCommand('zip', zipArgs, {
        cwd: parentDir,
        shell: false,
        stdio: ['ignore', 'ignore', 'inherit'],
        debug: false
    });

    if (!fs.existsSync(resolvedOutputPath)) {
        throw new Error('Archive creation failed: output file missing');
    }

    const stats = fs.statSync(resolvedOutputPath);
    console.log(`✅ Archive ready: ${path.basename(resolvedOutputPath)} (${formatBytes(stats.size)})`);

    return resolvedOutputPath;
}

/**
 * Cross-platform zip helper that chooses the optimal backend
 * @param {string} sourceDir Source directory to archive
 * @param {string} outputPath Output archive path
 * @param {object} [options] Zip options shared with backend implementations
 * @returns {Promise<string>} The generated archive path
 */
async function zipArchive(sourceDir, outputPath, options = {}) {
    if (process.platform === 'darwin') {
        return createMacZipArchive(sourceDir, outputPath, options);
    }

    const normalizedOptions = {
        format: 'zip',
        ...options,
    };

    return create7ZipArchive(sourceDir, outputPath, normalizedOptions);
}

/**
 * Format byte size
 * @param {number} bytes Number of bytes
 * @returns {string} Formatted size string
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
    createMacZipArchive,
    zipArchive,
    formatBytes
};
