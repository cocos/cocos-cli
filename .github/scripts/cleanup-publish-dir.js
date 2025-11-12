#!/usr/bin/env node
/**
 * 清理发布目录中的旧文件
 * 保留最新的 N 个文件，删除其余的
 * 复用 e2e/setup.ts 中的清理逻辑
 */

const fs = require('fs');
const path = require('path');

/**
 * 清理旧的发布文件
 * @param {string} publishDir 发布目录路径
 * @param {number} keepCount 保留的文件数量（默认 6）
 */
function cleanupOldPublishFiles(publishDir, keepCount = 6) {
    try {
        // 确保发布目录存在
        if (!fs.existsSync(publishDir)) {
            fs.mkdirSync(publishDir, { recursive: true });
            console.log(`📁 创建发布目录: ${publishDir}`);
            return;
        }

        // 读取所有文件（包括目录和文件）
        const items = fs.readdirSync(publishDir);
        
        // 过滤出目录和 zip 文件
        const files = items
            .filter(item => {
                const itemPath = path.join(publishDir, item);
                const stats = fs.statSync(itemPath);
                // 包含目录和 zip 文件
                return stats.isDirectory() || item.endsWith('.zip');
            })
            .map(item => {
                const itemPath = path.join(publishDir, item);
                const stats = fs.statSync(itemPath);
                return {
                    path: itemPath,
                    name: item,
                    mtime: stats.mtime.getTime(),
                    isDirectory: stats.isDirectory()
                };
            })
            .sort((a, b) => b.mtime - a.mtime); // 按修改时间降序排序

        // 如果文件数量超过保留数量，删除多余的
        if (files.length > keepCount) {
            const filesToDelete = files.slice(keepCount);
            console.log(`📋 发现 ${files.length} 个发布文件/目录，保留最新的 ${keepCount} 个`);

            filesToDelete.forEach(file => {
                try {
                    if (file.isDirectory) {
                        // 删除目录及其内容
                        fs.rmSync(file.path, { recursive: true, force: true });
                        console.log(`   已删除目录: ${file.name}`);
                    } else {
                        // 删除文件
                        fs.unlinkSync(file.path);
                        console.log(`   已删除文件: ${file.name}`);
                    }
                } catch (error) {
                    console.log(`   ⚠️  删除失败: ${file.name} - ${error.message}`);
                }
            });

            console.log(`✅ 已清理 ${filesToDelete.length} 个旧发布文件/目录\n`);
        } else if (files.length > 0) {
            console.log(`📋 当前有 ${files.length} 个发布文件/目录\n`);
        } else {
            console.log(`📋 发布目录为空\n`);
        }
    } catch (error) {
        // 清理失败不影响发布流程
        console.log(`⚠️  清理旧发布文件时出错: ${error.message}，继续执行发布\n`);
    }
}

/**
 * 主函数
 */
function main() {
    const publishDir = process.argv[2] || process.env.PUBLISH_DIR || 'e2e/reports/.publish';
    const keepCount = parseInt(process.argv[3] || process.env.KEEP_COUNT || '6', 10);
    
    console.log(`🧹 开始清理发布目录: ${publishDir}`);
    console.log(`📊 保留数量: ${keepCount}\n`);
    
    cleanupOldPublishFiles(publishDir, keepCount);
}

// 运行
if (require.main === module) {
    main();
}

module.exports = {
    cleanupOldPublishFiles,
};

