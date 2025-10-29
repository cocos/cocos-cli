#!/usr/bin/env node
/**
 * E2E 测试覆盖率检测脚本
 * 用于 GitHub Actions 工作流
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Running E2E coverage check...');

try {
    // 运行覆盖率检测并捕获输出
    const output = execSync('npm run check:e2e-coverage -- --json', {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // 提取 JSON 数据
    const jsonMatch = output.match(/--- JSON_OUTPUT_START ---\s*([\s\S]*?)\s*--- JSON_OUTPUT_END ---/);
    
    if (!jsonMatch) {
        console.error('❌ Failed to extract JSON output');
        process.exit(1);
    }

    const jsonData = JSON.parse(jsonMatch[1]);
    
    // 提取关键数据
    const coveragePercent = jsonData.summary.coveragePercent.toFixed(2);
    const markdownReport = jsonData.markdownReport;

    // 获取 GitHub Actions 输出文件路径
    const githubOutput = process.env.GITHUB_OUTPUT;
    
    if (githubOutput) {
        // 写入 GitHub Actions 输出
        fs.appendFileSync(githubOutput, `coverage_percent=${coveragePercent}\n`);
        
        // 写入多行 markdown 报告
        fs.appendFileSync(githubOutput, `coverage_report<<EOF\n${markdownReport}\nEOF\n`);
        
        console.log(`✅ Coverage: ${coveragePercent}%`);
        console.log('✅ Data saved to GITHUB_OUTPUT');
    } else {
        // 本地测试模式
        console.log('\n📊 Coverage Results:');
        console.log(`   Coverage: ${coveragePercent}%`);
        console.log(`   Total Tools: ${jsonData.summary.totalTools}`);
        console.log(`   Tested: ${jsonData.summary.testedCount}`);
        console.log(`   Untested: ${jsonData.summary.untestedCount}`);
        
        if (jsonData.htmlReportPath) {
            console.log(`\n📄 HTML Report: ${jsonData.htmlReportPath}`);
        }
    }

} catch (error) {
    console.error('❌ Coverage check failed:', error.message);
    process.exit(1);
}

