/**
 * 准备 DTS 文件
 * 
 * 包括两个步骤：
 * 1. 生成 i18n 类型定义（自动生成的类型文件）
 * 2. 复制源码中的 .d.ts 文件到 dist 目录
 * 
 * TypeScript 编译器只生成新的 .d.ts，不会复制源码中已存在的 .d.ts 文件
 * 这个脚本确保所有类型定义文件都能正确复制到输出目录
 */

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const { generateI18nTypes } = require('./generate-i18n-types');

const SRC_DIR = path.resolve(__dirname, '../src');
const DIST_DIR = path.resolve(__dirname, '../dist');

/**
 * 步骤 1: 生成 i18n 类型定义
 */
async function generateI18nTypeDefinitions() {
    console.log('📝 步骤 1: 生成 i18n 类型定义...\n');
    
    try {
        generateI18nTypes();
        console.log('✅ i18n 类型定义生成完成\n');
    } catch (error) {
        console.error('❌ 生成 i18n 类型定义时出错:', error);
        throw error;
    }
}

/**
 * 步骤 2: 复制 .d.ts 文件到 dist 目录
 */
async function copyDtsFiles() {
    console.log('📋 步骤 2: 复制 .d.ts 文件到 dist 目录...\n');
    
    // 查找所有 .d.ts 文件（排除 node_modules）
    const dtsFiles = glob.sync('**/*.d.ts', {
        cwd: SRC_DIR,
        absolute: false,
        ignore: ['**/node_modules/**']
    });
    
    if (dtsFiles.length === 0) {
        console.log('⚠️  未找到需要复制的 .d.ts 文件');
        return;
    }
    
    console.log(`📁 找到 ${dtsFiles.length} 个 .d.ts 文件\n`);
    
    let copiedCount = 0;
    let skippedCount = 0;
    
    for (const file of dtsFiles) {
        const srcPath = path.join(SRC_DIR, file);
        const destPath = path.join(DIST_DIR, file);
        
        try {
            // 检查源文件是否存在
            if (!fs.existsSync(srcPath)) {
                console.log(`⚠️  源文件不存在: ${file}`);
                skippedCount++;
                continue;
            }
            
            // 确保目标目录存在
            await fs.ensureDir(path.dirname(destPath));
            
            // 复制文件
            await fs.copy(srcPath, destPath, { overwrite: true });
            copiedCount++;
            
            // 只显示前 10 个文件，避免输出太多
            if (copiedCount <= 10) {
                console.log(`✅ ${file}`);
            }
        } catch (error) {
            console.error(`❌ 复制失败: ${file}`);
            console.error(`   错误: ${error.message}`);
            skippedCount++;
        }
    }
    
    if (copiedCount > 10) {
        console.log(`   ... 以及其他 ${copiedCount - 10} 个文件`);
    }
    
    console.log(`\n📊 复制统计:`);
    console.log(`   ✅ 成功: ${copiedCount} 个文件`);
    if (skippedCount > 0) {
        console.log(`   ⚠️  跳过: ${skippedCount} 个文件`);
    }
    console.log(`\n✅ .d.ts 文件复制完成！\n`);
}

/**
 * 主函数：按顺序执行所有步骤
 */
async function prepareDts() {
    console.log('🚀 开始准备 DTS 文件...\n');
    console.log('='.repeat(60) + '\n');
    
    try {
        // 步骤 1: 生成 i18n 类型定义
        await generateI18nTypeDefinitions();
        
        console.log('='.repeat(60) + '\n');
        
        // 步骤 2: 复制 .d.ts 文件
        await copyDtsFiles();
        
        console.log('='.repeat(60));
        console.log('🎉 所有 DTS 文件准备完成！\n');
    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ 准备 DTS 文件时出错:', error);
        console.error('='.repeat(60) + '\n');
        process.exit(1);
    }
}

// 执行准备流程
if (require.main === module) {
    prepareDts();
}

module.exports = { prepareDts, generateI18nTypeDefinitions, copyDtsFiles };
