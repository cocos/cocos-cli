const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { globby } = require('globby');
const { Client } = require('basic-ftp');
const { Command } = require('commander');
const { runCommand, create7ZipArchive, zipArchive, formatBytes } = require('./utils');

/**
 * Parse command-line arguments
 */
function parseArguments() {
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
        .parse();

    const options = program.opts();

    // Check whether any arguments were provided
    const hasAnyArgs = options.nodejs || options.electron || options.zip || options.upload;

    // Enable all features when no arguments are passed
    if (!hasAnyArgs) {
        console.log('🚀 No arguments specified; enabling default mode: build all targets + ZIP packaging + FTP upload');
        return {
            configs: [
                { type: 'nodejs', zip: true, upload: true },
                { type: 'electron', zip: true, upload: true }
            ],
            publishDir: options.publishDir
        };
    }

    // Determine release types
    const types = [];
    if (options.nodejs) {
        types.push('nodejs');
    }
    if (options.electron) {
        types.push('electron');
    }

    if (types.length === 0) {
        console.error('❌ Please specify a release type: --nodejs or --electron');
        program.help();
        process.exit(1);
    }

    // Create configuration for each type
     const configs = types.map(type => {
         const upload = !!options.upload;

         return {
             type: type,
             zip: true,
             upload: upload
         };
     });

     return {
         configs,
         publishDir: options.publishDir
     };
}

/**
 * Get project version
 */
async function getProjectVersion(rootDir) {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    return packageJson.version;
}

/**
 * Generate release directory name
 */
function generateReleaseDirectoryName(type, version) {

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
async function readIgnorePatterns(rootDir) {
    const vscodeignorePath = path.join(rootDir, '.vscodeignore');

    console.log('📖 Reading .vscodeignore file...');
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

    console.log('🚫 Ignore patterns:', ignorePatterns);
    return ignorePatterns;
}

/**
 * Create release directory
 */
async function createReleaseDirectory(extensionDir) {
    console.log('📁 Creating release directory...');
    if (await fs.pathExists(extensionDir)) {
        console.log('🗑️  Clearing existing release directory...');
        await fs.remove(extensionDir);
    }
    await fs.ensureDir(extensionDir);
}

/**
 * Scan project files to copy
 */
async function scanProjectFiles(rootDir, ignorePatterns) {
    console.log('🔍 Scanning project files...');
    const allFiles = await globby(['**/*'], {
        cwd: rootDir,
        dot: true,
        ignore: ignorePatterns,
        onlyFiles: true
    });

    console.log(`📋 Found ${allFiles.length} files to copy`);
    return allFiles;
}

/**
 * Copy files to release directory
 */
async function copyFilesToReleaseDirectory(rootDir, extensionDir, allFiles) {
    console.log('📋 Copying files into release directory...');
    let copiedCount = 0;
    for (const file of allFiles) {
        const srcPath = path.join(rootDir, file);
        const destPath = path.join(extensionDir, file);

        // Ensure target directory exists
        await fs.ensureDir(path.dirname(destPath));

        // Copy file
        await fs.copy(srcPath, destPath);
        copiedCount++;

        if (copiedCount % 2000 === 0) {
            console.log(`📋 Copied ${copiedCount}/${allFiles.length} files...`);
        }
    }

    console.log(`✅ Successfully copied ${copiedCount} files`);
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
            console.log('🔍 Recursively scanning node_modules for binaries...');
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
            console.log(`  ✓ Found ${nodeModulesBinaries.length} binaries in node_modules`);

            // List discovered files
            nodeModulesBinaries.forEach(file => {
                console.log(`    - ${path.relative(extensionDir, file)}`);
            });
        }

        // 2. Locate specific binaries under static/tools
        const staticToolsPath = path.join(extensionDir, 'static', 'tools');
        if (await fs.pathExists(staticToolsPath)) {
            console.log('🔍 Scanning static/tools for binaries...');
            const toolBinaries = await globby([
                'astc-encoder/astcenc',
                'cmft/cmftRelease64',
                'lightmap-tools/LightFX',
                'mali_darwin/astcenc',
                'mali_darwin/composite',
                'mali_darwin/convert',
                'mali_darwin/etcpack',
                'PVRTexTool_darwin/PVRTexToolCLI',
                // TODO: The codebase temporarily does not need this tool, remove it for now
                // 'PVRTexTool_darwin/compare'
            ], {
                cwd: staticToolsPath,
                absolute: true,
                onlyFiles: true
            });

            binaryFiles.push(...toolBinaries);
            console.log(`  ✓ Found ${toolBinaries.length} tool binaries in static/tools`);

            // List discovered files
            toolBinaries.forEach(file => {
                console.log(`    - ${path.relative(extensionDir, file)}`);
            });
        }

        console.log(`🔍 Found ${binaryFiles.length} native binaries that require signing`);

        return binaryFiles;
    } catch (error) {
        console.error('❌ Failed to locate native binaries:', error.message);
        return [];
    }
}

/**
 * Sign a single native binary (.node or .dylib)
 */
async function signBinaryFile(filePath, identity) {
    try {
        console.log(`🔐 Signing: ${path.basename(filePath)}`);
        // Add --options runtime to enable hardened runtime, which is required for notarization
        execSync(`codesign --force --options runtime --sign "${identity}" "${filePath}"`, {
            stdio: 'pipe'
        });
        console.log(`✅ Signing completed: ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`❌ Failed to sign ${path.basename(filePath)}:`, error.message);
        throw error;
    }
}

/**
 * Set execute permission for CLI binary
 */
async function setCliExecutablePermissions(extensionDir) {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
        console.log('ℹ️  Windows detected; skipping CLI permission update');
        return;
    }

    const cliJsPath = path.join(extensionDir, 'dist', 'cli.js');
    if (await fs.pathExists(cliJsPath)) {
        try {
            console.log('🔧 Setting CLI executable permissions...');
            execSync(`chmod +x "${cliJsPath}"`, { stdio: 'pipe' });
            console.log(`✅ Permissions set: ${path.relative(extensionDir, cliJsPath)}`);
        } catch (error) {
            console.warn(`⚠️  Failed to set CLI permissions: ${error.message}`);
        }
    } else {
        console.log('ℹ️  dist/cli.js not found; skipping permission update');
    }
}

/**
 * Sign and notarize native binaries (macOS only)
 * Supports .node and .dylib files
 */
async function signAndNotarizeNativeBinaries(extensionDir) {
    // Execute only on macOS
    if (process.platform !== 'darwin') {
        console.log('ℹ️  Not macOS; skipping signing and notarization');
        return;
    }

    console.log('🔐 Starting native binary signing and notarization...');

    // Verify signing identity is configured
    const identity = process.env.CODESIGN_IDENTITY || process.env.APPLE_DEVELOPER_ID;
    if (!identity) {
        console.log('⚠️  No signing identity (CODESIGN_IDENTITY or APPLE_DEVELOPER_ID) configured; skipping signing');
        return;
    }

    // Locate every native binary (tools under static/tools)
    const binaryFiles = await findNativeBinaries(extensionDir);
    if (binaryFiles.length === 0) {
        console.log('ℹ️  No native binaries found; skipping signing');
        return;
    }

    // First, ensure every binary is executable
    const isWindows = process.platform === 'win32';
    if (!isWindows) {
        console.log('🔧 Setting executable permissions on binary files...');
        for (const binaryFile of binaryFiles) {
            try {
                // Add execute permission (chmod +x)
                await runCommand('chmod', ['+x', binaryFile], { stdio: 'pipe' });
                console.log(`✅ Permissions set: ${path.relative(extensionDir, binaryFile)}`);
            } catch (error) {
                console.warn(`⚠️  Failed to set permissions: ${path.relative(extensionDir, binaryFile)} - ${error.message}`);
            }
        }
    } else {
        console.log('ℹ️  Windows detected; skipping permission setup');
    }

    // Sign every native binary
    for (const binaryFile of binaryFiles) {
        await signBinaryFile(binaryFile, identity);
    }

    // Determine whether notarization is required
    const shouldNotarize = true;
    const appleId = process.env.APPLE_ID;
    const appPassword = process.env.APPLE_PASSWORD;
    const teamId = process.env.APPLE_TEAM_ID;

    if (shouldNotarize && appleId && appPassword && teamId) {
        console.log('📋 Starting notarization for native binaries...');

        // Create temporary ZIP file for notarization
        const tempZipPath = path.join(extensionDir, '..', 'temp-notarize.zip');
        try {
            // Create a temporary directory for the files to bundle
            const tempDir = path.join(extensionDir, '..', 'temp-notarize-files');
            await fs.ensureDir(tempDir);

            // Copy every native binary into the temporary directory
            for (const binaryFile of binaryFiles) {
                const relativePath = path.relative(extensionDir, binaryFile);
                const targetPath = path.join(tempDir, relativePath);
                await fs.ensureDir(path.dirname(targetPath));
                await fs.copy(binaryFile, targetPath);
            }

            // Create archive with 7zip
            await create7ZipArchive(tempDir, tempZipPath, {
                compressionLevel: 9,
                format: 'zip',
                exclude: ['*.DS_Store'],
                preserveSymlinks: true
            });

            // Clean up temporary directory
            await fs.remove(tempDir);

            // Submit notarization request
            console.log('📤 Submitting notarization request...');
            const notarizeCommand = `xcrun notarytool submit "${tempZipPath}" --apple-id "${appleId}" --password "${appPassword}" --team-id "${teamId}" --wait`;
            execSync(notarizeCommand, {
                stdio: 'inherit',
                timeout: 6000000 // 10-minute timeout
            });

            console.log('✅ Native binary notarization completed');
        } catch (error) {
            console.error('❌ Notarization failed:', error.message);
            // Notarization failure should not block release
        } finally {
            // Clean up temporary files
            if (await fs.pathExists(tempZipPath)) {
                await fs.remove(tempZipPath);
            }
        }
    } else {
        console.log('ℹ️  Skipping notarization (not configured or disabled)');
        console.log('   Configure these environment variables to enable notarization:');
        console.log('   - NOTARIZE_ENABLED=true');
        console.log('   - APPLE_ID=your-apple-id');
        console.log('   - APPLE_APP_PASSWORD=your-app-password');
        console.log('   - APPLE_TEAM_ID=your-team-id');
    }

    console.log('🎉 Finished native binary signing and notarization');
}

/**
 * Display release statistics
 */
async function showReleaseStats(extensionDir) {
    const stats = await getDirectorySize(extensionDir);
    console.log(`📊 Release package size: ${formatBytes(stats.size)}`);
    console.log(`📄 File count: ${stats.files}`);
}

/**
 * Create ZIP archive
 */
async function createZipPackage(extensionDir, releaseDirectoryName) {
    console.log('📦 Creating ZIP archive...');

    const zipFileName = `${releaseDirectoryName}.zip`;
    const zipFilePath = path.join(path.dirname(extensionDir), zipFileName);

    try {
        // Use 7zip-bin to create the archive
        // Note: preserving symlinks (-snl) on Windows leads to empty directories or unusable links after extraction
        // Therefore disable symlink preservation on Windows and bundle actual contents instead
        const preserveSymlinks = process.platform !== 'win32';
        return await zipArchive(extensionDir, zipFilePath, {
            compressionLevel: 9,
            format: 'zip',
            exclude: ['*.DS_Store', '*.Thumbs.db'],
            preserveSymlinks,
            timeout: 1800000 // 30-minute timeout
        });
    } catch (error) {
        console.error('❌ Failed to create 7zip archive:', error.message);
        throw error;
    }
}



/**
 * Upload files to FTP server
 */
async function uploadToFTP(filePath, ftpConfig) {
    console.log('🚀 Starting FTP upload...');

    const client = new Client();
    client.ftp.verbose = false; // Set to true to enable verbose logging

    try {
        // Connect to FTP server
        await client.access({
            host: ftpConfig.host,
            port: ftpConfig.port || 21,
            user: ftpConfig.user,
            password: ftpConfig.password,
            secure: ftpConfig.secure || false
        });

        console.log('✅ FTP connection established');

        // Switch to remote directory when specified
        if (ftpConfig.remoteDir) {
            await client.ensureDir(ftpConfig.remoteDir);
            await client.cd(ftpConfig.remoteDir);
        }

        // Upload file
        const fileName = path.basename(filePath);
        await client.uploadFrom(filePath, fileName);

        const downloadBase = process.env.DOWNLOAD_BASE_URL || 'https://download.cocos.org';
        const remoteDir = ftpConfig.remoteDir || '';
        const downloadUrl = `${downloadBase}/${remoteDir}/${fileName}`;
        console.log(`✅ File uploaded successfully: ${downloadUrl}`);

    } catch (error) {
        console.error('❌ FTP upload failed:', error.message);
        throw error;
    } finally {
        client.close();
    }
}

/**
 * Get FTP config from environment
 */
function getFTPConfig(rootDir, type) {
    const ftpUser = process.env.ORG_FTP_USER;
    const ftpPass = process.env.ORG_FTP_PASS;
    const ftpHost = process.env.FTP_HOST || 'ctc.upload.new1cloud.com';
    const ftpPort = process.env.FTP_PORT ? parseInt(process.env.FTP_PORT) : 21;
    const ftpSecure = process.env.FTP_SECURE === 'true';
    const defaultRemoteDir = (type === 'electron') ? `pink` : `CocosSDK`;
    const ftpRemoteDir = process.env.FTP_REMOTE_DIR || defaultRemoteDir;

    if (!ftpUser || !ftpPass) {
        throw new Error('❌ Missing FTP credentials: set environment variables FTP_USER and FTP_PASS');
    }

    return {
        host: ftpHost,
        port: ftpPort,
        user: ftpUser,
        password: ftpPass,
        secure: ftpSecure,
        remoteDir: ftpRemoteDir
    };
}

/**
 * Handle FTP upload logic
 */
async function handleFTPUpload(zipFilePath, rootDir, type) {
    try {
        const ftpConfig = getFTPConfig(rootDir, type);

        if (zipFilePath) {
            // Upload ZIP file
            await uploadToFTP(zipFilePath, ftpConfig);
        } else {
            console.log('⚠️  No ZIP file created; cannot upload. Please also pass --zip.');
        }
    } catch (error) {
        console.error('❌ FTP upload failed:', error.message);
        // Do not break the entire release flow; only the upload failed
    }
}

/**
 * Main release function
 * @param {object} [options] Release options
 * @param {string} [options.publishDir] Release directory (defaults to CLI arguments or fallback when omitted)
 * @param {Array<{type: string, zip: boolean, upload: boolean}>} [options.configs] Release configuration list (falls back to CLI arguments when omitted)
 * @returns {Promise<object>} Map of generated artifact paths, e.g. { nodejs: { releaseDir, zipFile }, electron: { releaseDir, zipFile } }
 */
async function release(options = {}) {
    const rootDir = path.resolve(__dirname, '..');
    let configs;

    let parsedArgs = null;

    // Use provided configs when present; otherwise parse command-line arguments
    if (options.configs && Array.isArray(options.configs) && options.configs.length > 0) {
        // When invoked as a module, rely on the provided configs
        configs = options.configs;
    } else {
        // Parse from command-line arguments (including direct script execution)
        parsedArgs = parseArguments();
        configs = parsedArgs.configs;
    }

    // Determine publish directory: function argument > CLI argument > default
    const publishDirInput = options.publishDir || (parsedArgs && parsedArgs.publishDir) || '.publish';

    // Convert publish directory to an absolute path
    const publishDirAbs = path.isAbsolute(publishDirInput)
        ? publishDirInput
        : path.resolve(rootDir, publishDirInput);

    // Ensure publish directory exists
    await fs.ensureDir(publishDirAbs);
    console.log(`📁 Using publish directory: ${publishDirAbs}`);

    const result = {};

    try {
        // Fetch project version
        const version = await getProjectVersion(rootDir);

        // Pull the latest engine code (once)
        await runCommand('npm', ['run', 'update:repos'], { cwd: rootDir });

        // Read ignore patterns (once)
        const ignorePatterns = await readIgnorePatterns(rootDir);

        // Run npm install in the root (once)
        await runCommand('npm', ['install'], { cwd: rootDir });

        // Scan project files (once)
        const allFiles = await scanProjectFiles(rootDir, ignorePatterns);

        // Execute the release process for each config
        for (const config of configs) {
            const fileInfo = await releaseForType(config, rootDir, publishDirAbs, version, allFiles);
            result[config.type] = fileInfo;
        }

        return result;
    } catch (error) {
        console.error('❌ Release failed:', error.message);
        if (require.main === module) {
            process.exit(1);
        } else {
            throw error;
        }
    }
}

/**
 * Execute release flow for a specific type
 * @returns {Promise<{releaseDir: string, zipFile: string|null}>} Release file path details
 */
async function releaseForType(options, rootDir, publishDir, version, allFiles) {
    // Generate release directory name
    const releaseDirectoryName = generateReleaseDirectoryName(options.type, version);
    const extensionDir = path.join(publishDir, releaseDirectoryName);

    console.log(`🚀 Starting release ${options.type === 'nodejs' ? 'Cocos CLI' : 'Cocos SDK'} (${options.type}) version ${version}...`);

    // Step 1: Create release directory
    await createReleaseDirectory(extensionDir);

    // Step 2: Copy files
    await copyFilesToReleaseDirectory(rootDir, extensionDir, allFiles);

    // Step 3: Install production dependencies
    await runCommand('npm', ['install', '--production'], { cwd: extensionDir });
    await runCommand('npm', ['install', '--production', '--ignore-scripts'], { cwd: path.join(extensionDir, 'packages/engine') });

    // Step 4: If this is an electron build, run electron rebuild
    options.type === 'electron' && (await runCommand('npm', ['run', 'rebuild'], { cwd: extensionDir }));
    // If this is the nodejs build, run e2e tests; temporarily skip for electron
    options.type === 'nodejs' && (await runCommand('npm', ['run',` test:e2e -- --cli ${extensionDir}/dist/cli.js` ], { cwd: rootDir }));
    // Step 5: Sign and notarize native binaries (macOS only)
    await signAndNotarizeNativeBinaries(extensionDir);

    console.log('🎉 Release completed!');
    console.log(`📁 Release directory: ${extensionDir}`);

    // Display release directory size info
    await showReleaseStats(extensionDir);

    // Set CLI executable permissions before creating the ZIP
    await setCliExecutablePermissions(extensionDir);
    let zipFilePath = null;

    // Create a ZIP archive if --zip is specified
    if (options.zip) {
        zipFilePath = await createZipPackage(extensionDir, releaseDirectoryName);
    }

    // Upload to FTP if --upload is specified
    if (options.upload) {
        await handleFTPUpload(zipFilePath, rootDir, options.type);
    }

    if (zipFilePath) {
        console.log(`📦 ZIP file: ${zipFilePath}`);
    }

    // Return release file path info
    return {
        releaseDir: extensionDir,
        zipFile: zipFilePath
    };
}

/**
 * Get directory size and file count
 */
async function getDirectorySize(dirPath) {
    let totalSize = 0;
    let fileCount = 0;

    async function calculateSize(currentPath) {
        const stats = await fs.stat(currentPath);

        if (stats.isDirectory()) {
            const files = await fs.readdir(currentPath);
            for (const file of files) {
                await calculateSize(path.join(currentPath, file));
            }
        } else {
            totalSize += stats.size;
            fileCount++;
        }
    }

    await calculateSize(dirPath);
    return { size: totalSize, files: fileCount };
}



// Execute release when running this script directly
if (require.main === module) {
    release().then(result => {
        console.log('\n📋 Release file summary:');
        console.log(JSON.stringify(result, null, 2));
    }).catch(error => {
        console.error('❌ Release failed:', error.message);
        process.exit(1);
    });
}

module.exports = { release };
