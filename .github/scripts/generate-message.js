#!/usr/bin/env node
/**
 * 生成测试报告消息内容
 * 支持生成 Markdown（GitHub）和富文本（飞书）格式
 */

const fs = require('fs');

/**
 * 生成 GitHub Markdown 格式的消息
 */
function generateGitHubMarkdown(data) {
    const {
        reportExists,
        reportUrl,
        reportFilename,
        coveragePercent,
        coverageReport,
        runId,
    } = data;
    
    let comment = `## 📊 E2E 测试报告\n\n`;
    
    // 添加覆盖率摘要（可选）
    if (coveragePercent && coveragePercent !== '0.00') {
        const coverageIcon = parseFloat(coveragePercent) >= 80 ? '✅' : 
                             parseFloat(coveragePercent) >= 60 ? '⚠️' : '❌';
        comment += `### ${coverageIcon} 测试覆盖率: ${coveragePercent}%\n\n`;
    }
    
    if (reportExists) {
        comment += `✅ 测试已完成！\n\n`;
        comment += `### 🔗 在线查看报告\n\n`;
        comment += `**报告地址**: [${reportFilename}](${reportUrl})\n\n`;
        comment += `> 💡 点击上方链接即可在浏览器中查看完整的测试报告\n\n`;
        comment += `---\n\n`;
        comment += `### 📋 报告内容\n\n`;
        comment += `报告包含以下信息：\n`;
        comment += `- ✅ 测试通过/失败统计\n`;
        comment += `- ⏱️ 每个测试的执行时间\n`;
        comment += `- 📝 详细的错误信息和堆栈跟踪\n`;
        comment += `- 💬 控制台日志输出\n`;
        comment += `- 📊 可视化的测试结果\n\n`;
        comment += `---\n\n`;
        
        // 添加详细的覆盖率报告
        if (coverageReport) {
            comment += coverageReport + '\n\n';
            comment += `---\n\n`;
        }
        
        comment += `### 💾 备用下载\n\n`;
        comment += `如果在线查看失败，可以从 GitHub Artifacts 下载报告：\n`;
        comment += `1. 点击下方的 "Artifacts" 部分\n`;
        comment += `2. 下载 \`e2e-test-report-${runId}\`\n`;
        comment += `3. 解压后在浏览器中打开 HTML 文件\n`;
    } else {
        comment += `❌ 测试报告生成失败\n\n`;
        comment += `请检查测试日志获取详细信息。\n\n`;
        
        // 即使没有测试报告，也显示覆盖率信息
        if (coverageReport) {
            comment += `---\n\n`;
            comment += coverageReport + '\n\n';
        }
    }
    
    comment += `\n---\n\n`;
    comment += `### 🔧 本地查看报告\n\n`;
    comment += `\`\`\`bash\n`;
    comment += `# 运行测试\n`;
    comment += `npm run test:e2e\n\n`;
    comment += `# 查看报告（会自动打开浏览器）\n`;
    comment += `# Windows\n`;
    comment += `start reports/test-report-*.html\n\n`;
    comment += `# macOS\n`;
    comment += `open reports/test-report-*.html\n\n`;
    comment += `# Linux\n`;
    comment += `xdg-open reports/test-report-*.html\n`;
    comment += `\`\`\`\n\n`;
    comment += `---\n\n`;
    comment += `<sub>🤖 此报告由 GitHub Actions 自动生成 | Run ID: ${runId}</sub>\n`;
    
    return comment;
}

/**
 * 生成飞书消息卡片格式（紧凑型）
 */
function generateFeishuCard(data) {
    const {
        reportExists,
        reportUrl,
        coverageReportUrl,
        coveragePercent,
        testedCount,
        totalCount,
        runId,
        triggerType,
        branch,
        commit,
    } = data;

    // 判断测试状态和颜色
    const testPassed = reportExists;
    const cardColor = testPassed ? 'green' : 'red';
    const statusIcon = testPassed ? '✅' : '❌';
    const statusText = testPassed ? '测试通过' : '测试失败';
    
    // 构建飞书卡片消息（紧凑型）
    const card = {
        msg_type: 'interactive',
        card: {
            config: {
                wide_screen_mode: true,
            },
            header: {
                title: {
                    tag: 'plain_text',
                    content: `${statusIcon} Daily E2E ${statusText}`,
                },
                template: cardColor,
            },
            elements: [
                // 基本信息（一行显示）
                {
                    tag: 'div',
                    fields: [
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: `**分支**\n${branch || 'N/A'}`,
                            },
                        },
                        {
                            is_short: true,
                            text: {
                                tag: 'lark_md',
                                content: `**触发**\n${getTriggerTypeText(triggerType)}`,
                            },
                        },
                    ],
                },
                {
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: `**Commit**: ${commit ? commit.substring(0, 8) : 'N/A'}`,
                    },
                },
                // 显示覆盖率信息（如果有）
                ...(coveragePercent ? [{
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: `**覆盖率**: ${coveragePercent}% (${testedCount}/${totalCount})`,
                    },
                }] : []),
                {
                    tag: 'hr',
                },
                // 快速链接（紧凑型按钮）
                {
                    tag: 'action',
                    actions: buildActions(reportExists, reportUrl, coverageReportUrl),
                },
                {
                    tag: 'hr',
                },
                // 页脚
                {
                    tag: 'note',
                    elements: [
                        {
                            tag: 'plain_text',
                            content: `Run #${runId}`,
                        },
                    ],
                },
            ],
        },
    };

    return card;
}

/**
 * 构建操作按钮
 */
function buildActions(reportExists, reportUrl, coverageReportUrl) {
    const actions = [];
    
    // E2E 测试报告按钮
    if (reportExists && reportUrl) {
        actions.push({
            tag: 'button',
            text: {
                tag: 'plain_text',
                content: '📊 E2E 报告',
            },
            type: 'primary',
            url: reportUrl,
        });
    }
    
    // 覆盖率报告按钮
    if (coverageReportUrl) {
        actions.push({
            tag: 'button',
            text: {
                tag: 'plain_text',
                content: '📈 覆盖率报告',
            },
            type: 'default',
            url: coverageReportUrl,
        });
    }
    
    // 如果都没有，显示失败提示
    if (actions.length === 0) {
        actions.push({
            tag: 'button',
            text: {
                tag: 'plain_text',
                content: '🔍 查看日志',
            },
            type: 'danger',
            url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        });
    }
    
    return actions;
}

/**
 * 获取触发类型的友好文本
 */
function getTriggerTypeText(type) {
    const typeMap = {
        workflow_dispatch: '🖱️ 手动触发',
        schedule: '⏰ 定时触发',
        issue_comment: '💬 评论触发',
        pull_request: '🔀 PR 触发',
    };
    return typeMap[type] || type;
}

/**
 * 主函数
 */
function main() {
    const args = process.argv.slice(2);
    const format = args.includes('--feishu') ? 'feishu' : 'github';

    // 从环境变量或参数读取数据
    const data = {
        reportExists: process.env.REPORT_EXISTS === 'true',
        reportUrl: process.env.REPORT_URL || '',
        reportFilename: process.env.REPORT_FILENAME || '',
        coveragePercent: process.env.COVERAGE_PERCENT || '0.00',
        coverageReport: process.env.COVERAGE_REPORT || '',
        runId: process.env.GITHUB_RUN_ID || '',
        triggerType: process.env.GITHUB_EVENT_NAME || '',
        branch: process.env.GITHUB_REF_NAME || '',
        commit: process.env.GITHUB_SHA || '',
        author: process.env.GITHUB_ACTOR || '',
    };

    let output;
    if (format === 'feishu') {
        output = generateFeishuCard(data);
    } else {
        output = generateGitHubMarkdown(data);
    }

    // 输出结果
    if (format === 'feishu') {
        console.log(JSON.stringify(output, null, 2));
    } else {
        console.log(output);
    }

    // 保存到文件（可选）
    const outputFile = args.find(arg => arg.startsWith('--output='));
    if (outputFile) {
        const filepath = outputFile.split('=')[1];
        fs.writeFileSync(filepath, typeof output === 'string' ? output : JSON.stringify(output, null, 2));
        console.error(`✅ Message saved to: ${filepath}`);
    }
}

// 运行
if (require.main === module) {
    main();
}

module.exports = {
    generateGitHubMarkdown,
    generateFeishuCard,
};

