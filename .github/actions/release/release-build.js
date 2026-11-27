#!/usr/bin/env node
/**
 * Release Build Script
 * 
 * 执行发布构建流程，支持 Node.js 和 Electron 版本
 * 从环境变量读取配置，并将结果输出到 GitHub Actions Output
 */

const fs = require('fs');
const path = require('path');

/**
 * 设置 GitHub Actions 输出
 */
function setOutput(key, value) {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (!outputFile) {
        console.warn(`⚠️  GITHUB_OUTPUT 未设置，无法输出 ${key}`);
        return;
    }
    
    const newline = String.fromCharCode(10); // 实际的换行符
    
    // 如果值是对象或数组，使用 heredoc 格式输出多行 JSON
    if (typeof value === 'object' && value !== null) {
        const jsonResult = JSON.stringify(value);
        fs.appendFileSync(outputFile, `${key}<<EOF${newline}${jsonResult}${newline}EOF${newline}`, 'utf-8');
    } else {
        // 简单的键值对输出
        fs.appendFileSync(outputFile, `${key}=${value}${newline}`, 'utf-8');
    }
}

/**
 * 主函数
 */
async function main() {
    try {
        // 从环境变量读取配置
        let publishDir = process.env.PUBLISH_DIR;
        const nodejs = process.env.NODEJS === 'true';
        const electron = process.env.ELECTRON === 'true';
        const createZip = process.env.CREATE_ZIP === 'true';
        const upload = process.env.UPLOAD === 'true';
        const reportServerUrl = process.env.REPORT_SERVER_URL || 'http://192.168.52.77:8080';
        
        // 验证配置
        if (!publishDir) {
            throw new Error('PUBLISH_DIR 环境变量未设置');
        }
        
        // 确保发布目录是绝对路径
        const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
        if (!path.isAbsolute(publishDir)) {
            publishDir = path.resolve(workspaceRoot, publishDir);
        }
        
        if (!nodejs && !electron) {
            throw new Error('至少需要选择一种发布类型（nodejs 或 electron）');
        }
        
        // 显示配置信息
        console.log('🚀 开始发布流程...');
        console.log(`   Node.js: ${nodejs ? '是' : '否'}`);
        console.log(`   Electron: ${electron ? '是' : '否'}`);
        console.log(`   发布目录: ${publishDir}`);
        console.log(`   创建 ZIP: ${createZip ? '是' : '否'}`);
        console.log(`   上传 FTP: ${upload ? '是' : '否'}`);
        console.log(`   报告服务器: ${reportServerUrl}`);
        console.log('');
        
        // 构建 configs 数组
        const configs = [];
        if (nodejs) {
            configs.push({
                type: 'nodejs',
                zip: createZip,
                upload: upload
            });
        }
        if (electron) {
            configs.push({
                type: 'electron',
                zip: createZip,
                upload: upload
            });
        }
        
        // 导入 release 函数
        const releaseModule = require(path.join(workspaceRoot, 'workflow/release.js'));
        
        // 执行发布
        const result = await releaseModule.release({
            publishDir: publishDir,
            configs: configs,
            engineSdk: process.env.RELEASE_ENGINE_SDK || undefined,
            engineSdkReceipt: process.env.RELEASE_ENGINE_SDK_RECEIPT || undefined,
            dependenciesInstalled: process.env.RELEASE_DEPENDENCIES_INSTALLED === 'true',
        });
        
        // 处理结果，为每个类型生成 URL
        const processedResult = {};
        let allSuccess = true;
        
        if (nodejs) {
            const releaseInfo = result['nodejs'];
            if (releaseInfo) {
                processedResult['nodejs'] = {
                    releaseDir: releaseInfo.releaseDir,
                    zipFile: releaseInfo.zipFile || null,
                    zipFilename: releaseInfo.zipFile ? path.basename(releaseInfo.zipFile) : null,
                    zipUrl: releaseInfo.zipFile ? generateZipUrl(releaseInfo.zipFile, publishDir, reportServerUrl, workspaceRoot) : null,
                    success: true
                };
                console.log(`✅ Node.js 发布成功`);
                if (releaseInfo.zipFile) {
                    console.log(`   ZIP 文件: ${releaseInfo.zipFile}`);
                    console.log(`   ZIP URL: ${processedResult['nodejs'].zipUrl}`);
                }
            } else {
                processedResult['nodejs'] = {
                    success: false
                };
                allSuccess = false;
                console.error('❌ Node.js 发布失败：未找到发布信息');
            }
        }
        
        if (electron) {
            const releaseInfo = result['electron'];
            if (releaseInfo) {
                processedResult['electron'] = {
                    releaseDir: releaseInfo.releaseDir,
                    zipFile: releaseInfo.zipFile || null,
                    zipFilename: releaseInfo.zipFile ? path.basename(releaseInfo.zipFile) : null,
                    zipUrl: releaseInfo.zipFile ? generateZipUrl(releaseInfo.zipFile, publishDir, reportServerUrl, workspaceRoot) : null,
                    success: true
                };
                console.log(`✅ Electron 发布成功`);
                if (releaseInfo.zipFile) {
                    console.log(`   ZIP 文件: ${releaseInfo.zipFile}`);
                    console.log(`   ZIP URL: ${processedResult['electron'].zipUrl}`);
                }
            } else {
                processedResult['electron'] = {
                    success: false
                };
                allSuccess = false;
                console.error('❌ Electron 发布失败：未找到发布信息');
            }
        }
        
        // 输出到 GitHub Actions
        setOutput('release_results', processedResult);
        setOutput('release_success', allSuccess ? 'true' : 'false');
        
        // 输出总结
        console.log('');
        if (allSuccess) {
            console.log('✅ 所有发布类型构建成功');
        } else {
            console.log('⚠️  部分发布类型构建失败');
        }
        
    } catch (error) {
        console.error('❌ 发布失败:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        
        // 输出失败状态
        setOutput('release_success', 'false');
        process.exit(1);
    }
}

/**
 * 生成 ZIP 文件的 URL
 * 
 * @param {string} zipFile - ZIP 文件路径
 * @param {string} publishDir - 发布目录
 * @param {string} reportServerUrl - 报告服务器地址
 * @param {string} workspaceRoot - 工作区根目录
 * @returns {string} ZIP 文件 URL
 */
function generateZipUrl(zipFile, publishDir, reportServerUrl, workspaceRoot) {
    const zipFilename = path.basename(zipFile);
    
    // 标准化路径分隔符
    const normalizedPublishDir = publishDir.replace(/\\/g, '/');
    const normalizedWorkspace = workspaceRoot.replace(/\\/g, '/');
    
    // 从发布目录中提取相对于工作区的路径
    const relativePath = normalizedPublishDir.replace(normalizedWorkspace, '').replace(/^\//, '');
    
    // 判断发布目录的类型，生成对应的 URL
    // 如果发布目录是 e2e/server/.publish，URL 应该是 /reports/.publish/filename
    if (relativePath.includes('e2e/server/.publish')) {
        return `${reportServerUrl}/.publish/${zipFilename}`;
    }
    
    // 如果发布目录是 .publish（根目录下的），URL 应该是 /reports/.publish/filename
    if (relativePath === '.publish' || relativePath.startsWith('.publish/')) {
        return `${reportServerUrl}/reports/.publish/${zipFilename}`;
    }
    
    // 默认情况：使用相对路径
    // 构建 URL（假设报告服务器会映射工作区目录）
    return `${reportServerUrl}/${relativePath}/${zipFilename}`;
}

// 运行
if (require.main === module) {
    main();
}

module.exports = {
    main,
    generateZipUrl,
};

