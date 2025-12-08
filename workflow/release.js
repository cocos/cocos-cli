const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { globby } = require('globby');
const { Client } = require('basic-ftp');
const { Command } = require('commander');
const gulp = require('gulp');
const { runCommand, create7ZipArchive, zipArchive } = require('./utils');

// Global context to share state between tasks
const context = {
    rootDir: path.resolve(__dirname, '..'),
    publishDir: '.publish',
    version: '',
    ignorePatterns: [],
    allFiles: [],
    configs: [],
    args: {}
};

/**
 * Parse command-line arguments
 */
function parseArgs(cb) {
    const program = new Command();

    program
        .name('release')
        .description('Cocos CLI release tool')
        .version('1.0.0')
        .option('--nodejs', 'Create Node.js release package')
        .option('--electron', 'Create Electron release package')
        .option('--zip', 'Create ZIP archive')
        .option('--upload', 'Upload to FTP server')
        .option('--publish-dir <dir>', 'Specify release directory (defaults to .publish)')
        .option('--publish-name <name>', 'Custom name for the release artifact')
        .option('--skip-notarization', 'Skip notarization process')
        .allowUnknownOption(); // Allow Gulp flags

    // Parse arguments
    // Note: When running via gulp, we need to be careful about which args we parse.
    // Gulp itself consumes some args. We rely on the user passing args after -- if needed,
    // or just parsing process.argv and ignoring unknown options.
    program.parse(process.argv);

    const options = program.opts();
    context.args = options;
    context.publishDir = options.publishDir || '.publish';

    // Check whether any arguments were provided
    const hasAnyArgs = options.nodejs || options.electron || options.zip || options.upload || options.skipNotarization;

    // Enable all features when no arguments are passed
    if (!hasAnyArgs) {
        console.log('No arguments specified; enabling default mode: build all targets + ZIP packaging + FTP upload');
        context.configs = [
            { type: 'nodejs', zip: true, upload: true, notarize: true },
            { type: 'electron', zip: true, upload: true, notarize: true }
        ];
    } else {
        // Determine release types
        const types = [];
        if (options.nodejs) types.push('nodejs');
        if (options.electron) types.push('electron');

        if (types.length === 0) {
            console.error('Please specify a release type: --nodejs or --electron');
            process.exit(1);
        }

        context.configs = types.map(type => ({
            type: type,
            zip: !!options.zip,
            upload: !!options.upload,
            notarize: !options.skipNotarization,
        }));
    }

    // Convert publish directory to an absolute path
    context.publishDir = path.isAbsolute(context.publishDir)
        ? context.publishDir
        : path.resolve(context.rootDir, context.publishDir);


    cb();
}

/**
 * Get project version
 */
async function getProjectVersion() {
    const packageJsonPath = path.join(context.rootDir, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    context.version = packageJson.version;
    console.log(`Project Version: ${context.version}`);
}

/**
 * Generate release directory name
 */
function generateReleaseDirectoryName(type, version) {
    // Use custom publish name if provided
    if (context.args.publishName) {
        return context.args.publishName;
    }

    const platformSuffix = process.platform === 'darwin' ? 'mac' : 'win';

    // Generate timestamp (format: YYMMDDHH)
    const now = new Date();
    const timestamp = now.getFullYear().toString().slice(-2) +
                     (now.getMonth() + 1).toString().padStart(2, '0') +
                     now.getDate().toString().padStart(2, '0') +
                     now.getHours().toString().padStart(2, '0');

    if (type === 'nodejs') {
        return `cocos-cli-${platformSuffix}-${timestamp}-${version}`;
    } else if (type === 'electron') {
        return `cocos-sdk-${platformSuffix}-${timestamp}-${version}`;
    }
    throw new Error(`Unknown release type: ${type}`);
}

/**
 * Read ignore patterns
 */
async function readIgnorePatterns() {
    const vscodeignorePath = path.join(context.rootDir, '.vscodeignore');

    console.log('Reading .vscodeignore file...');
    let ignorePatterns = [];
    if (await fs.pathExists(vscodeignorePath)) {
        const ignoreContent = await fs.readFile(vscodeignorePath, 'utf8');
        ignorePatterns = ignoreContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    }

    // Append default ignore patterns
    ignorePatterns.push('.publish/**');

    console.log('Ignore patterns:', ignorePatterns);
    context.ignorePatterns = ignorePatterns;
}

/**
 * Scan project files to copy
 */
async function scanProjectFiles() {
    console.log('Scanning project files...');
    const allFiles = await globby(['**/*'], {
        cwd: context.rootDir,
        dot: true,
        ignore: context.ignorePatterns,
        onlyFiles: true
    });

    console.log(`Found ${allFiles.length} files to copy`);
    context.allFiles = allFiles;
}

/**
 * Update Repos
 */
async function updateRepos() {
    await runCommand('npm', ['run', 'update:repos'], { cwd: context.rootDir });
}

/**
 * Install Dependencies
 */
async function installDeps() {
    await runCommand('npm', ['install'], { cwd: context.rootDir });
}

/**
 * Clean Publish Directory
 */
async function clean() {
    console.log(`Using publish directory: ${context.publishDir}`);
    await fs.ensureDir(context.publishDir);
}

/**
 * Find native binaries in directory (recursive search)
 */
async function findNativeBinaries(extensionDir) {
    const binaryFiles = [];

    try {
        // 1. Find binaries in node_modules (recursive search)
        const nodeModulesPath = path.join(extensionDir, 'node_modules');
        if (await fs.pathExists(nodeModulesPath)) {
            console.log('Recursively scanning node_modules for binaries...');
            const nodeModulesBinaries = await globby([
                '**/*.node',
                '**/*.dylib',
                '**/ffprobe',
                '**/ffmpeg',
                '**/FBX-glTF-conv',
            ], {
                cwd: nodeModulesPath,
                absolute: true,
                onlyFiles: true
            });

            binaryFiles.push(...nodeModulesBinaries);
            console.log(`  Found ${nodeModulesBinaries.length} binaries in node_modules`);
        }

        // 2. Locate specific binaries under static/tools
        const staticToolsPath = path.join(extensionDir, 'static', 'tools');
        if (await fs.pathExists(staticToolsPath)) {
            console.log('Scanning static/tools for binaries...');
            const toolBinaries = await globby([
                'astc-encoder/astcenc',
                'cmft/cmftRelease64',
                'lightmap-tools/LightFX',
                'mali_darwin/astcenc',
                'mali_darwin/composite',
                'mali_darwin/convert',
                'mali_darwin/etcpack',
                'PVRTexTool_darwin/PVRTexToolCLI',
            ], {
                cwd: staticToolsPath,
                absolute: true,
                onlyFiles: true
            });

            binaryFiles.push(...toolBinaries);
            console.log(`  Found ${toolBinaries.length} tool binaries in static/tools`);
        }

        return binaryFiles;
    } catch (error) {
        console.error('Failed to locate native binaries:', error.message);
        return [];
    }
}

/**
 * Sign a single native binary (.node or .dylib)
 */
async function signBinaryFile(filePath, identity) {
    try {
        console.log(`Signing: ${path.basename(filePath)}`);
        execSync(`codesign --force --options runtime --sign "${identity}" "${filePath}"`, {
            stdio: 'pipe'
        });
        console.log(`Signing completed: ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`Failed to sign ${path.basename(filePath)}:`, error.message);
        throw error;
    }
}

/**
 * Sign and notarize native binaries (macOS only)
 */
async function signAndNotarizeNativeBinaries(extensionDir, config) {
    if (process.platform !== 'darwin') {
        console.log('Not macOS; skipping signing and notarization');
        return;
    }

    console.log('Starting native binary signing and notarization...');

    const identity = process.env.CODESIGN_IDENTITY || process.env.APPLE_DEVELOPER_ID;
    if (!identity) {
        console.log('No signing identity configured; skipping signing');
        return;
    }

    const binaryFiles = await findNativeBinaries(extensionDir);
    if (binaryFiles.length === 0) {
        console.log('No native binaries found; skipping signing');
        return;
    }

    // Ensure executable permissions
    const isWindows = process.platform === 'win32';
    if (!isWindows) {
        console.log('Setting executable permissions on binary files...');
        for (const binaryFile of binaryFiles) {
            try {
                await runCommand('chmod', ['+x', binaryFile], { stdio: 'pipe' });
            } catch (error) {
                console.warn(`Failed to set permissions: ${path.relative(extensionDir, binaryFile)}`);
            }
        }
    }

    // Sign binaries
    for (const binaryFile of binaryFiles) {
        await signBinaryFile(binaryFile, identity);
    }

    // Notarization
    if (config.notarize) {
        await notarizationNativeBinaries(extensionDir, binaryFiles);
    }
}

/**
 * Notarization
 */
async function notarizationNativeBinaries (extensionDir, binaryFiles) {
    const shouldNotarize = true;
    const appleId = process.env.APPLE_ID;
    const appPassword = process.env.APPLE_PASSWORD;
    const teamId = process.env.APPLE_TEAM_ID;

    if (shouldNotarize && appleId && appPassword && teamId) {
        console.log('Starting notarization for native binaries...');
        const tempZipPath = path.join(extensionDir, '..', 'temp-notarize.zip');
        const tempDir = path.join(extensionDir, '..', 'temp-notarize-files');

        try {
            await fs.ensureDir(tempDir);
            for (const binaryFile of binaryFiles) {
                const relativePath = path.relative(extensionDir, binaryFile);
                const targetPath = path.join(tempDir, relativePath);
                await fs.ensureDir(path.dirname(targetPath));
                await fs.copy(binaryFile, targetPath);
            }

            await create7ZipArchive(tempDir, tempZipPath, {
                compressionLevel: 9,
                format: 'zip',
                exclude: ['*.DS_Store'],
                preserveSymlinks: true
            });

            await fs.remove(tempDir);

            console.log('Submitting notarization request...');
            const notarizeCommand = `xcrun notarytool submit "${tempZipPath}" --apple-id "${appleId}" --password "${appPassword}" --team-id "${teamId}" --wait`;
            execSync(notarizeCommand, { stdio: 'inherit', timeout: 6000000 });

            console.log('Native binary notarization completed');
        } catch (error) {
            console.error('Notarization failed:', error.message);
        } finally {
            if (await fs.pathExists(tempZipPath)) {
                await fs.remove(tempZipPath);
            }
        }
    } else {
        console.log('Skipping notarization (not configured)');
    }
}

/**
 * Set execute permission for CLI binary
 */
async function setCliExecutablePermissions(extensionDir) {
    if (process.platform === 'win32') return;

    const cliJsPath = path.join(extensionDir, 'dist', 'cli.js');
    if (await fs.pathExists(cliJsPath)) {
        try {
            console.log('Setting CLI executable permissions...');
            execSync(`chmod +x "${cliJsPath}"`, { stdio: 'pipe' });
        } catch (error) {
            console.warn(`Failed to set CLI permissions: ${error.message}`);
        }
    }
}

/**
 * Upload to FTP
 */
async function uploadToFTP(filePath, type) {
    console.log('Starting FTP upload...');
    const ftpUser = process.env.ORG_FTP_USER;
    const ftpPass = process.env.ORG_FTP_PASS;
    const ftpHost = process.env.ORG_UPLOAD_URL;
    const ftpPort = process.env.ORG_FTP_PORT ? parseInt(process.env.ORG_FTP_PORT) : 21;
    const ftpSecure = process.env.FTP_SECURE === 'true';
    const defaultRemoteDir = (type === 'electron') ? `/pink` : `/CocosSDK`;
    const ftpRemoteDir = process.env.ORG_FTP_REMOTE_DIR || defaultRemoteDir;

    if (!ftpUser || !ftpPass) {
        console.error('Missing FTP credentials: set environment variables FTP_USER and FTP_PASS');
        return;
    }

    const client = new Client();
    client.ftp.verbose = false;

    try {
        await client.access({
            host: ftpHost,
            port: ftpPort,
            user: ftpUser,
            password: ftpPass,
            secure: ftpSecure
        });

        if (ftpRemoteDir) {
            await client.ensureDir(ftpRemoteDir);
            await client.cd(ftpRemoteDir);
        }

        const fileName = path.basename(filePath);
        await client.uploadFrom(filePath, fileName);

        const downloadBase = process.env.DOWNLOAD_BASE_URL;
        const downloadUrl = `${downloadBase}${ftpRemoteDir || ''}/${fileName}`;
        console.log(`File uploaded successfully: ${downloadUrl}`);
    } catch (error) {
        console.error('FTP upload failed:', error.message);
    } finally {
        client.close();
    }
}

/**
 * Factory to create a release pipeline for a specific config
 */
function createReleasePipeline(config) {
    console.log('start createReleasePipeline with config', config);
    const releaseDirName = () => generateReleaseDirectoryName(config.type, context.version);
    const extensionDir = () => path.join(context.publishDir, releaseDirName());
    let zipFilePath = null;

    const prepareDir = async () => {
        const dir = extensionDir();
        console.log(`Starting release ${config.type} version ${context.version}...`);
        if (await fs.pathExists(dir)) {
            await fs.remove(dir);
        }
        await fs.ensureDir(dir);
    };

    const copyFiles = async () => {
        console.log('Copying files into release directory...');
        const dir = extensionDir();
        let copiedCount = 0;
        for (const file of context.allFiles) {
            const srcPath = path.join(context.rootDir, file);
            const destPath = path.join(dir, file);
            await fs.ensureDir(path.dirname(destPath));
            await fs.copy(srcPath, destPath);
            copiedCount++;
        }
        console.log(`Successfully copied ${copiedCount} files`);
    };

    const installProd = async () => {
        const dir = extensionDir();
        await runCommand('npm', ['install', '--production'], { cwd: dir });
        await runCommand('npm', ['install', '--production', '--ignore-scripts'], { cwd: path.join(dir, 'packages/engine') });
    };

    const rebuild = async () => {
        if (config.type === 'electron') {
            await runCommand('npm', ['run', 'rebuild'], { cwd: extensionDir() });
        }
    };

    const test = async () => {
        if (config.type === 'nodejs') {
            await runCommand('npm', ['run', `test:e2e -- --cli ${extensionDir()}/dist/cli.js`], { cwd: context.rootDir });
        }
    };

    const sign = async () => {
        await signAndNotarizeNativeBinaries(extensionDir(), config);
    };

    const setPerms = async () => {
        await setCliExecutablePermissions(extensionDir());
    };

    const pack = async () => {
        if (config.zip) {
            console.log('Creating ZIP archive...');
            const dir = extensionDir();
            const name = releaseDirName();
            const zipName = `${name}.zip`;
            zipFilePath = path.join(path.dirname(dir), zipName);

            const preserveSymlinks = process.platform !== 'win32';
            await zipArchive(dir, zipFilePath, {
                compressionLevel: 9,
                format: 'zip',
                exclude: ['*.DS_Store', '*.Thumbs.db'],
                preserveSymlinks,
                timeout: 1800000
            });
            console.log(`ZIP file: ${zipFilePath}`);
        }
    };

    const upload = async () => {
        if (config.upload && zipFilePath) {
            await uploadToFTP(zipFilePath, config.type);
        }
    };

    // Define task name for logging
    const taskName = `release:${config.type}`;
    const pipeline = gulp.series(
        prepareDir,
        copyFiles,
        installProd,
        rebuild,
        test,
        sign,
        setPerms,
        pack,
        upload
    );
    pipeline.displayName = taskName;
    return pipeline;
}

// Define base tasks
const initTask = gulp.series(
    async () => await getProjectVersion(),
    async () => await readIgnorePatterns(),
    async () => await scanProjectFiles()
);

const prepareTask = gulp.series(
    clean,
    updateRepos,
    installDeps
);

// Main release task
gulp.task('release', gulp.series(
    (cb) => parseArgs(cb),
    initTask,
    prepareTask,
    async (cb) => {
        // Dynamically create and execute pipelines based on configs
        const pipelines = context.configs.map(config => createReleasePipeline(config));
        if (pipelines.length > 0) {
            // Run pipelines in parallel
            const parallelRelease = gulp.parallel(...pipelines);
            return new Promise((resolve, reject) => {
                parallelRelease(cb);
                resolve();
            });
        } else {
            cb();
        }
    }
));

module.exports = gulp;
