const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { globby } = require('globby');
const JSZip = require('jszip');
const { Client } = require('basic-ftp');
const { Command } = require('commander');

/**
 * 解析命令行参数
 */
function parseArguments() {
    const program = new Command();

    program
        .name('release')
        .description('Cocos CLI 发布工具')
        .version('1.0.0')
        .option('--nodejs', '创建 Node.js 版本发布包')
        .option('--electron', '创建 Electron 版本发布包')
        .option('--zip', '创建 ZIP 压缩包')
        .option('--upload', '上传到 FTP 服务器')
        .parse();

    const options = program.opts();

    // 检查是否有任何参数被传递
    const hasAnyArgs = options.nodejs || options.electron || options.zip || options.upload;

    // 如果没有任何参数，默认所有功能都启用
    if (!hasAnyArgs) {
        console.log('🚀 未指定参数，启用默认模式：构建所有平台 + ZIP打包 + FTP上传');
        return [
            { type: 'nodejs', zip: true, upload: true },
            { type: 'electron', zip: true, upload: true }
        ];
    }

    // 确定发布类型
    const types = [];
    if (options.nodejs) {
        types.push('nodejs');
    }
    if (options.electron) {
        types.push('electron');
    }

    if (types.length === 0) {
        console.error('❌ 请指定发布类型: --nodejs 或 --electron');
        program.help();
        process.exit(1);
    }

    // 为每个类型创建配置
     return types.map(type => {
         let zip = !!options.zip;
         const upload = !!options.upload;

         if ((type === 'nodejs' || type === 'electron') && !options.zip && !options.upload) {
             zip = true;
         }

         return {
             type: type,
             zip: zip,
             upload: upload
         };
     });
}

/**
 * 获取项目版本号
 */
async function getProjectVersion(rootDir) {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    return packageJson.version;
}

/**
 * 生成发布目录名称
 */
function generateReleaseDirectoryName(type, version) {

    const platformSuffix = process.platform === 'darwin' ? 'darwin' : 'win';

    if (type === 'nodejs') {
        return `cocos-cli-${platformSuffix}-${version}`;
    } else if (type === 'electron') {
        return `cocos-sdk-${platformSuffix}-${version}`;
    }
    throw new Error(`未知的发布类型: ${type}`);
}

/**
 * 读取忽略模式
 */
async function readIgnorePatterns(rootDir) {
    const vscodeignorePath = path.join(rootDir, '.vscodeignore');

    console.log('📖 读取 .vscodeignore 文件...');
    let ignorePatterns = [];
    if (await fs.pathExists(vscodeignorePath)) {
        const ignoreContent = await fs.readFile(vscodeignorePath, 'utf8');
        ignorePatterns = ignoreContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    }

    // 添加一些默认的忽略模式
    ignorePatterns.push('.publish/**');

    console.log('🚫 忽略模式:', ignorePatterns);
    return ignorePatterns;
}

/**
 * 创建发布目录
 */
async function createReleaseDirectory(extensionDir) {
    console.log('📁 创建发布目录...');
    if (await fs.pathExists(extensionDir)) {
        console.log('🗑️  清空现有发布目录...');
        await fs.remove(extensionDir);
    }
    await fs.ensureDir(extensionDir);
}

/**
 * 执行根目录的 npm install
 */
async function installRootDependencies(rootDir) {
    console.log('📦 在根目录执行 npm install...');
    try {
        execSync('npm install', {
            cwd: rootDir,
            stdio: 'inherit',
            timeout: 300000 // 5分钟超时
        });
        console.log('✅ 根目录 npm install 完成');
    } catch (error) {
        console.error('❌ 根目录 npm install 失败:', error.message);
        throw error;
    }
}

/**
 * 扫描并获取需要拷贝的文件
 */
async function scanProjectFiles(rootDir, ignorePatterns) {
    console.log('🔍 扫描项目文件...');
    const allFiles = await globby(['**/*'], {
        cwd: rootDir,
        dot: true,
        ignore: ignorePatterns,
        onlyFiles: true
    });

    console.log(`📋 找到 ${allFiles.length} 个文件需要拷贝`);
    return allFiles;
}

/**
 * 拷贝文件到发布目录
 */
async function copyFilesToReleaseDirectory(rootDir, extensionDir, allFiles) {
    console.log('📋 拷贝文件到发布目录...');
    let copiedCount = 0;
    for (const file of allFiles) {
        const srcPath = path.join(rootDir, file);
        const destPath = path.join(extensionDir, file);

        // 确保目标目录存在
        await fs.ensureDir(path.dirname(destPath));

        // 拷贝文件
        await fs.copy(srcPath, destPath);
        copiedCount++;

        if (copiedCount % 2000 === 0) {
            console.log(`📋 已拷贝 ${copiedCount}/${allFiles.length} 个文件...`);
        }
    }

    console.log(`✅ 成功拷贝 ${copiedCount} 个文件`);
}

/**
 * 在发布目录中安装生产依赖
 */
async function installProductionDependencies(extensionDir) {
    console.log('📦 在发布目录执行 npm install --production ...');
    try {
        execSync('npm install --production', {
            cwd: extensionDir,
            stdio: 'inherit',
            timeout: 300000 // 5分钟超时
        });
        console.log('✅ 发布目录 npm install 完成');
    } catch (error) {
        console.error('❌ 发布目录 npm install 失败:', error.message);
        throw error;
    }
}

/**
 * 执行 Electron rebuild（仅用于 electron 版本）
 */
async function rebuildElectronModules(extensionDir) {
    console.log('🔧 执行 Electron rebuild...');
    try {
        execSync('npx electron@37.3.1 rebuild', {
            cwd: extensionDir,
            stdio: 'inherit',
            timeout: 600000 // 10分钟超时
        });
        console.log('✅ Electron rebuild 完成');
    } catch (error) {
        console.error('❌ Electron rebuild 失败:', error.message);
        throw error;
    }
}

/**
 * 显示发布统计信息
 */
async function showReleaseStats(extensionDir) {
    const stats = await getDirectorySize(extensionDir);
    console.log(`📊 发布包大小: ${formatBytes(stats.size)}`);
    console.log(`📄 文件数量: ${stats.files}`);
}

/**
 * 创建ZIP压缩包
 */
async function createZipPackage(extensionDir, releaseDirectoryName) {
    console.log('📦 创建ZIP压缩包...');

    const zip = new JSZip();
    const zipFileName = `${releaseDirectoryName}.zip`;
    const zipFilePath = path.join(path.dirname(extensionDir), zipFileName);

    // 递归添加文件到ZIP，排除.DS_Store文件
    async function addDirectoryToZip(dirPath, zipFolder = zip) {
        const items = await fs.readdir(dirPath);

        for (const item of items) {
            // 排除macOS系统生成的.DS_Store文件
            if (item === '.DS_Store') {
                continue;
            }

            const itemPath = path.join(dirPath, item);
            const stats = await fs.stat(itemPath);

            if (stats.isDirectory()) {
                const folder = zipFolder.folder(item);
                await addDirectoryToZip(itemPath, folder);
            } else {
                const content = await fs.readFile(itemPath);
                zipFolder.file(item, content);
            }
        }
    }

    await addDirectoryToZip(extensionDir);

    // 生成ZIP文件
    const zipContent = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 6
        }
    });

    await fs.writeFile(zipFilePath, zipContent);

    const zipStats = await fs.stat(zipFilePath);
    console.log(`✅ ZIP压缩包创建完成: ${zipFileName}`);
    console.log(`📦 压缩包大小: ${formatBytes(zipStats.size)}`);

    return zipFilePath;
}

/**
 * 上传文件到FTP服务器
 */
async function uploadToFTP(filePath, ftpConfig) {
    console.log('🚀 开始上传到FTP服务器...');

    const client = new Client();
    client.ftp.verbose = false; // 设置为true可以看到详细日志

    try {
        // 连接到FTP服务器
        await client.access({
            host: ftpConfig.host,
            port: ftpConfig.port || 21,
            user: ftpConfig.user,
            password: ftpConfig.password,
            secure: ftpConfig.secure || false
        });

        console.log('✅ FTP连接成功');

        // 如果指定了远程目录，切换到该目录
        if (ftpConfig.remoteDir) {
            await client.ensureDir(ftpConfig.remoteDir);
            await client.cd(ftpConfig.remoteDir);
        }

        // 上传文件
        const fileName = path.basename(filePath);
        await client.uploadFrom(filePath, fileName);

        console.log(`✅ 文件上传成功: ${fileName}`);

    } catch (error) {
        console.error('❌ FTP上传失败:', error.message);
        throw error;
    } finally {
        client.close();
    }
}

/**
 * 从环境变量获取FTP配置
 */
function getFTPConfig() {
    const ftpUser = process.env.ORG_FTP_USER;
    const ftpPass = process.env.ORG_FTP_PASS;
    const ftpHost = process.env.FTP_HOST || 'ctc.upload.new1cloud.com';
    const ftpPort = process.env.FTP_PORT ? parseInt(process.env.FTP_PORT) : 21;
    const ftpSecure = process.env.FTP_SECURE === 'true';
    const ftpRemoteDir = process.env.FTP_REMOTE_DIR || '/CocosSDK/v1.0.0';

    if (!ftpUser || !ftpPass) {
        throw new Error('❌ 缺少FTP凭据: 请设置环境变量 FTP_USER 和 FTP_PASS');
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
 * 处理FTP上传逻辑
 */
async function handleFTPUpload(zipFilePath) {
    try {
        const ftpConfig = getFTPConfig();

        if (zipFilePath) {
            // 上传ZIP文件
            await uploadToFTP(zipFilePath, ftpConfig);
        } else {
            console.log('⚠️  未创建ZIP文件，无法上传。请同时使用 --zip 参数。');
        }
    } catch (error) {
        console.error('❌ FTP上传失败:', error.message);
        // 不中断整个发布流程，只是上传失败
    }
}

/**
 * 主发布函数
 */
async function release() {
    const configs = parseArguments();
    const rootDir = path.resolve(__dirname, '..');
    const publishDir = path.join(rootDir, '.publish');

    try {
        // 获取项目版本号
        const version = await getProjectVersion(rootDir);

        // 读取忽略模式（只需要读取一次）
        const ignorePatterns = await readIgnorePatterns(rootDir);

        // 执行根目录的 npm install（只需要执行一次）
        await installRootDependencies(rootDir);

        // 扫描项目文件（只需要扫描一次）
        const allFiles = await scanProjectFiles(rootDir, ignorePatterns);

        // 为每个配置执行发布流程
        for (const options of configs) {
            await releaseForType(options, rootDir, publishDir, version, ignorePatterns, allFiles);
        }

    } catch (error) {
        console.error('❌ 发布失败:', error.message);
        process.exit(1);
    }
}

/**
 * 为特定类型执行发布流程
 */
async function releaseForType(options, rootDir, publishDir, version, ignorePatterns, allFiles) {
    // 生成发布目录名称
    const releaseDirectoryName = generateReleaseDirectoryName(options.type, version);
    const extensionDir = path.join(publishDir, releaseDirectoryName);

    console.log(`🚀 开始发布 ${options.type === 'nodejs' ? 'Cocos CLI' : 'Cocos SDK'} (${options.type}) 版本 ${version}...`);

    // 步骤 1: 创建发布目录
    await createReleaseDirectory(extensionDir);

    // 步骤 2: 拷贝文件
    await copyFilesToReleaseDirectory(rootDir, extensionDir, allFiles);

    // 步骤 3: 安装生产依赖
    await installProductionDependencies(extensionDir);

    // 步骤 4: 如果是 electron 版本，执行 electron rebuild
    if (options.type === 'electron') {
        await rebuildElectronModules(extensionDir);
    }

    console.log('🎉 发布完成！');
    console.log(`📁 发布目录: ${extensionDir}`);

    // 显示发布目录的大小信息
    await showReleaseStats(extensionDir);

    let zipFilePath = null;

    // 如果指定了--zip参数，创建ZIP压缩包
    if (options.zip) {
        zipFilePath = await createZipPackage(extensionDir, releaseDirectoryName);
    }

    // 如果指定了--upload参数，上传到FTP服务器
    if (options.upload) {
        await handleFTPUpload(zipFilePath);
    }

    if (zipFilePath) {
        console.log(`📦 ZIP文件: ${zipFilePath}`);
    }
}

/**
 * 获取目录大小和文件数量
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

/**
 * 格式化字节大小
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 如果直接运行此脚本，则执行发布
if (require.main === module) {
    release().catch(console.error);
}

module.exports = { release };
