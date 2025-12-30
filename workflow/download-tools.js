const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// 工具配置
const tools = {
    win32: [
        {
            url: 'http://download.cocos.com/CocosSDK/tools/unzip.exe',
            dist: 'unzip.exe',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/PVRTexToolCLI_win32_20251028.zip',
            dist: 'PVRTexTool_win32',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/mali_win32.zip',
            dist: 'mali_win32',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/libwebp_win32.zip',
            dist: 'libwebp_win32',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/openSSLWin64.zip',
            dist: 'openSSLWin64',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/Python27-win32.zip',
            dist: 'Python27-win32',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/astcenc/astcenc-win32-5.2.0-250220.zip',
            dist: 'astc-encoder',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/xiaomi-pack-tools-win32-202404.zip',
            dist: 'xiaomi-pack-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/lightmap-tools-win32-230525.zip',
            dist: 'lightmap-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/uvunwrap_win32_221025.zip',
            dist: 'LightFX',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/cmft_win32_x64-20230323.zip',
            dist: 'cmft',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/cmake-3.24.3-windows-x86_64.zip',
            dist: 'cmake',
        },
        // 注意：windows-process-tree 的 URL 可能已失效，暂时注释
        // {
        //     url: 'http://ftp.cocos.org/TestBuilds/Editor-3d/npm/windows-process-tree-0.6.0-28.0.0_win32.zip',
        //     dist: 'windows-process-tree',
        // }
    ],
    darwin: [
        {
            url: 'http://download.cocos.com/CocosSDK/tools/PVRTexToolCLI_darwin_20251028.zip',
            dist: 'PVRTexTool_darwin',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/mali_darwin.zip',
            dist: 'mali_darwin',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/libwebp-1.4.0-mac-universal.zip',
            dist: 'libwebp_darwin',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/astcenc/astcenc-darwin-5.2.0-250220.zip',
            dist: 'astc-encoder',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/xiaomi-pack-tools-darwin-202404.zip',
            dist: 'xiaomi-pack-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/lightmap-tools-darwin-20241217.zip',
            dist: 'lightmap-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/uvunwrap_darwin_20241217.zip',
            dist: 'LightFX',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/cmft-darwin-20231124.zip',
            dist: 'cmft',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/cmake-3.24.3-macos-universal.zip',
            dist: 'cmake',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/process-info-20231116-darwin.zip',
            dist: 'process-info'
        }
    ],
    common: [
        {
            url: 'http://download.cocos.com/CocosSDK/tools/quickgame-toolkit.zip',
            dist: 'quickgame-toolkit',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/huawei-rpk-tools.zip',
            dist: 'huawei-rpk-tools',
        },
        {
            url: 'http://download.cocos.com/CocosSDK/tools/debug.keystore-201112.zip',
            dist: 'keystore',
        }
    ]
};

// 工具类
class ToolDownloader {
    constructor() {
        this.scriptDir = __dirname;
        this.projectRoot = path.dirname(this.scriptDir);
        this.toolsDir = path.join(this.projectRoot, 'static', 'tools');
        this.tempDir = path.join(this.projectRoot, '.temp');
        this.platform = process.platform;
    }

    // 确保目录存在
    ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`📁 创建目录: ${path.relative(this.projectRoot, dirPath)}`);
        }
    }

    // 下载文件（带重试机制）
    async downloadFile(url, destPath, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                await this._downloadFileSingle(url, destPath);
                return; // 成功则退出
            } catch (error) {
                console.log(`\n⚠️  下载失败 (尝试 ${attempt}/${retries}): ${error.message}`);

                // 清理失败的文件
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }

                if (attempt === retries) {
                    throw error; // 最后一次尝试失败，抛出错误
                }

                // 等待一段时间后重试
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                console.log(`⏳ ${delay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // 单次下载文件
    async _downloadFileSingle(url, destPath) {
        return new Promise((resolve, reject) => {
            console.log(`📥 下载: ${url}`);

            const protocol = url.startsWith('https:') ? https : http;
            const file = fs.createWriteStream(destPath);
            let downloadedSize = 0;
            let totalSize = 0;

            const request = protocol.get(url, (response) => {
                if (response.statusCode === 200) {
                    totalSize = parseInt(response.headers['content-length'], 10) || 0;

                    response.on('data', (chunk) => {
                        downloadedSize += chunk.length;
                        if (totalSize > 0) {
                            const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
                            process.stdout.write(`\r📥 下载进度: ${progress}% (${this.formatBytes(downloadedSize)}/${this.formatBytes(totalSize)})`);
                        }
                    });

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close();
                        console.log(`\n✅ 下载完成: ${path.basename(destPath)}`);
                        resolve();
                    });
                } else if (response.statusCode === 302 || response.statusCode === 301) {
                    // 处理重定向
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    this._downloadFileSingle(response.headers.location, destPath).then(resolve).catch(reject);
                } else if (response.statusCode === 404) {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    reject(new Error(`文件不存在 (404): ${url}`));
                } else {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                }
            });

            request.on('error', (err) => {
                file.close();
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(err);
            });

            // 设置超时
            request.setTimeout(120000, () => {
                request.destroy();
                reject(new Error('下载超时 (120秒)'));
            });
        });
    }

    // 解压文件
    async extractFile(zipPath, extractDir) {
        console.log(`📦 解压: ${path.basename(zipPath)}`);

        try {
            let command , options = {};
            if (this.platform === 'win32') {
                // Windows 使用 PowerShell 的 Expand-Archive
                command = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`;
            } else {
                // macOS/Linux 使用 unzip
                command = `unzip -o '${zipPath}' -d '${extractDir}'`;
                // 增加缓冲区大小
                options = {
                    maxBuffer: 1024 * 1024 * 50 // 增加到 50MB，防止解压失败
                };
            }

            execSync(command, { stdio: 'pipe', ...options });
            console.log(`✅ 解压完成: ${path.basename(zipPath)}`);
        } catch (error) {
            throw new Error(`解压失败: ${error.message}`);
        }
    }

    // 格式化字节数
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // 检查解压工具是否可用
    checkExtractTools() {
        try {
            if (this.platform === 'win32') {
                execSync('powershell -Command "Get-Command Expand-Archive"', { stdio: 'pipe' });
            } else {
                execSync('which unzip', { stdio: 'pipe' });
            }
            return true;
        } catch {
            return false;
        }
    }

    // 检查文件是否需要解压
    isArchiveFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return ['.zip', '.tar', '.gz', '.7z', '.rar'].includes(ext);
    }

    // 复制文件到目标目录
    async copyFile(sourcePath, targetDir) {
        console.log(`📋 复制: ${path.basename(sourcePath)}`);

        try {
            const fileName = path.basename(sourcePath);
            const targetPath = path.join(targetDir, fileName);

            // 确保目标目录存在
            this.ensureDir(targetDir);

            // 复制文件
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`✅ 复制完成: ${fileName}`);
        } catch (error) {
            throw new Error(`复制失败: ${error.message}`);
        }
    }

    // 主处理函数
    async processTool(tool, index, total) {
        const progress = `[${index + 1}/${total}]`;
        console.log(`\n${progress} 处理: ${tool.dist}`);

        try {
            // 生成文件路径
            const fileName = path.basename(tool.url);
            const tempFilePath = path.join(this.tempDir, fileName);
            const targetDir = path.join(this.toolsDir, tool.dist);

            // 检查是否已存在
            if (fs.existsSync(targetDir)) {
                console.log(`⏭️  跳过 ${tool.dist} (已存在)`);
                return { success: true, skipped: true };
            }

            // 下载
            await this.downloadFile(tool.url, tempFilePath);

            // 创建目标目录
            this.ensureDir(targetDir);

            // 判断是否需要解压
            if (this.isArchiveFile(tempFilePath)) {
                // 解压文件
                await this.extractFile(tempFilePath, targetDir);
            } else {
                // 直接复制文件
                await this.copyFile(tempFilePath, targetDir);
            }

            // 清理临时文件
            fs.unlinkSync(tempFilePath);

            console.log(`✅ ${tool.dist} 处理完成`);
            return { success: true, skipped: false };

        } catch (error) {
            console.error(`❌ ${tool.dist} 处理失败:`, error.message);
            return { success: false, error: error.message };
        }
    }

    // 清理临时目录
    cleanupTempDir() {
        if (fs.existsSync(this.tempDir)) {
            try {
                const files = fs.readdirSync(this.tempDir);
                if (files.length === 0) {
                    fs.rmdirSync(this.tempDir);
                    console.log('🧹 清理临时目录');
                } else {
                    console.log(`⚠️  临时目录中还有 ${files.length} 个文件未清理`);
                }
            } catch (error) {
                console.log(`⚠️  清理临时目录失败: ${error.message}`);
            }
        }
    }

    // 主函数
    async run() {
        console.log(`🖥️  当前平台: ${this.platform}`);

        // 检查解压工具
        if (!this.checkExtractTools()) {
            console.error('❌ 缺少解压工具，请安装 unzip (macOS/Linux) 或确保 PowerShell 可用 (Windows)');
            process.exit(1);
        }

        // 创建目录
        this.ensureDir(this.tempDir);
        this.ensureDir(this.toolsDir);

        // 获取工具列表
        const platformTools = tools[this.platform] || [];
        const commonTools = tools.common || [];
        const allTools = [...platformTools, ...commonTools];

        console.log(`📋 需要下载 ${allTools.length} 个工具文件\n`);

        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        // 处理每个工具
        for (let i = 0; i < allTools.length; i++) {
            const result = await this.processTool(allTools[i], i, allTools.length);

            if (result.success) {
                if (result.skipped) {
                    skipCount++;
                } else {
                    successCount++;
                }
            } else {
                failCount++;
            }
        }

        // 清理临时目录
        this.cleanupTempDir();

        // 显示统计信息
        console.log(`\n🎉 处理完成!`);
        console.log(`✅ 成功: ${successCount}`);
        console.log(`⏭️ 跳过: ${skipCount}`);
        console.log(`❌ 失败: ${failCount}`);

        if (failCount > 0) {
            console.log(`\n💡 提示:`);
            console.log(`   - 失败的下载可能是网络问题或文件不存在`);
            console.log(`   - 可以重新运行脚本重试: npm run download-tools`);
            console.log(`   - 某些工具可能不是必需的，可以继续使用其他功能`);

            // 不强制退出，让用户决定是否继续
            console.log(`\n⚠️  有 ${failCount} 个工具下载失败，但脚本将继续完成`);
        } else {
            console.log(`\n🎊 所有工具下载成功！`);
        }
    }
}

// 运行脚本
if (require.main === module) {
    const downloader = new ToolDownloader();
    downloader.run().catch((error) => {
        console.error('❌ 脚本执行失败:', error.message);
        process.exit(1);
    });
}

module.exports = { ToolDownloader };
