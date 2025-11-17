#!/usr/bin/env node
/**
 * 查找最新的 E2E 测试报告
 * 用于 GitHub Actions 工作流
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Finding test report...');

try {
    const reportsDir = path.resolve(process.cwd(), 'e2e/server/reports');
    
    if (!fs.existsSync(reportsDir)) {
        console.log('❌ Reports directory not found');
        setOutput('report_exists', 'false');
        process.exit(0);
    }

    // 读取所有报告文件
    const files = fs.readdirSync(reportsDir)
        .filter(file => file.startsWith('test-report-') && file.endsWith('.html'))
        .map(file => ({
            name: file,
            path: path.join(reportsDir, file),
            mtime: fs.statSync(path.join(reportsDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime); // 按时间降序

    if (files.length === 0) {
        console.log('❌ No test report found');
        setOutput('report_exists', 'false');
        process.exit(0);
    }

    const latestReport = files[0];
    console.log(`✅ Found report: ${latestReport.name}`);

    // 获取环境变量
    const reportServerUrl = process.env.REPORT_SERVER_URL || 'http://localhost:8080';
    const reportUrl = `${reportServerUrl}/reports/${latestReport.name}`;

    // 输出到 GitHub Actions
    setOutput('report_exists', 'true');
    setOutput('report_file', latestReport.path);
    setOutput('report_filename', latestReport.name);
    setOutput('report_url', reportUrl);

    console.log(`📊 Report URL: ${reportUrl}`);

} catch (error) {
    console.error('❌ Failed to find report:', error.message);
    setOutput('report_exists', 'false');
    process.exit(1);
}

/**
 * 设置 GitHub Actions 输出
 */
function setOutput(key, value) {
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
        fs.appendFileSync(githubOutput, `${key}=${value}\n`);
    } else {
        console.log(`[OUTPUT] ${key}=${value}`);
    }
}

