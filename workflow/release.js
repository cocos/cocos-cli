const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { globby } = require('globby');

/**
 * 发布 Cocos CLI VSCode 插件
 * 1. 根据 .vscodeignore 忽略文件
 * 2. 创建 .publish/cocos-cli-extension 发布目录
 * 3. 拷贝非忽略文件到发布目录
 * 4. 在发布目录中执行 npm i --production --ignore-scripts
 */
async function release() {
    const rootDir = path.resolve(__dirname, '..');
    const publishDir = path.join(rootDir, '.publish');
    const extensionDir = path.join(publishDir, 'cocos-cli-extension');
    const vscodeignorePath = path.join(rootDir, '.vscodeignore');

    console.log('🚀 开始发布 Cocos CLI VSCode 插件...');

    try {
        // 步骤 1: 读取 .vscodeignore 文件
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

        // 步骤 2: 创建发布目录
        console.log('📁 创建发布目录...');
        if (await fs.pathExists(extensionDir)) {
            console.log('🗑️  清空现有发布目录...');
            await fs.remove(extensionDir);
        }
        await fs.ensureDir(extensionDir);

        // 步骤 3: 执行根目录的 npm install
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

        // 步骤 4: 获取所有文件并过滤
        console.log('🔍 扫描项目文件...');
        const allFiles = await globby(['**/*'], {
            cwd: rootDir,
            dot: true,
            ignore: ignorePatterns,
            onlyFiles: true
        });

        console.log(`📋 找到 ${allFiles.length} 个文件需要拷贝`);

        // 步骤 5: 拷贝文件
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
            
            if (copiedCount % 500 === 0) {
                console.log(`📋 已拷贝 ${copiedCount}/${allFiles.length} 个文件...`);
            }
        }

        console.log(`✅ 成功拷贝 ${copiedCount} 个文件`);

        // 步骤 6: 在发布目录中执行 npm install --production --ignore-scripts
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

        console.log('🎉 发布完成！');
        console.log(`📁 发布目录: ${extensionDir}`);
        
        // 显示发布目录的大小信息
        const stats = await getDirectorySize(extensionDir);
        console.log(`📊 发布包大小: ${formatBytes(stats.size)}`);
        console.log(`📄 文件数量: ${stats.files}`);

    } catch (error) {
        console.error('❌ 发布失败:', error.message);
        process.exit(1);
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