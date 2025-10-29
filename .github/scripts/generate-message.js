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
    comment += `start e2e/reports/test-report-*.html\n\n`;
    comment += `# macOS\n`;
    comment += `open e2e/reports/test-report-*.html\n\n`;
    comment += `# Linux\n`;
    comment += `xdg-open e2e/reports/test-report-*.html\n`;
    comment += `\`\`\`\n\n`;
    comment += `---\n\n`;
    comment += `<sub>🤖 此报告由 GitHub Actions 自动生成 | Run ID: ${runId}</sub>\n`;
    
    return comment;
}

/**
 * 生成飞书消息卡片格式
 */
function generateFeishuCard(data) {
    const {
        reportExists,
        reportUrl,
        reportFilename,
        coveragePercent,
        coverageReport,
        runId,
        triggerType,
        branch,
        commit,
        author,
    } = data;

    // 根据是否有覆盖率决定颜色
    let coverageColor = 'blue'; // 默认蓝色
    if (coveragePercent && coveragePercent !== '0.00') {
        const percent = parseFloat(coveragePercent);
        coverageColor = percent >= 80 ? 'green' : percent >= 60 ? 'orange' : 'red';
    }
    
    // 构建飞书卡片消息
    const card = {
        msg_type: 'interactive',
        card: {
            config: {
                wide_screen_mode: true,
            },
            header: {
                title: {
                    tag: 'plain_text',
                    content: '📊 E2E 测试报告',
                },
                template: coverageColor,
            },
            elements: [],
        },
    };

    // 覆盖率摘要（可选）
    if (coveragePercent && coveragePercent !== '0.00') {
        const coverageIcon = parseFloat(coveragePercent) >= 80 ? '✅' : 
                             parseFloat(coveragePercent) >= 60 ? '⚠️' : '❌';
        card.card.elements.push({
            tag: 'div',
            fields: [
                {
                    is_short: true,
                    text: {
                        tag: 'lark_md',
                        content: `**测试覆盖率**\n${coverageIcon} ${coveragePercent}%`,
                    },
                },
                {
                    is_short: true,
                    text: {
                        tag: 'lark_md',
                        content: `**触发方式**\n${getTriggerTypeText(triggerType)}`,
                    },
                },
            ],
        });
        card.card.elements.push({
            tag: 'hr',
        });
    } else {
        // 没有覆盖率信息时，只显示触发方式
        card.card.elements.push({
            tag: 'div',
            text: {
                tag: 'lark_md',
                content: `**触发方式**\n${getTriggerTypeText(triggerType)}`,
            },
        });
        card.card.elements.push({
            tag: 'hr',
        });
    }

    // 添加基本信息
    if (branch || commit || author) {
        const fields = [];
        if (branch) {
            fields.push({
                is_short: true,
                text: {
                    tag: 'lark_md',
                    content: `**分支**\n${branch}`,
                },
            });
        }
        if (author) {
            fields.push({
                is_short: true,
                text: {
                    tag: 'lark_md',
                    content: `**提交者**\n${author}`,
                },
            });
        }
        if (commit) {
            fields.push({
                is_short: false,
                text: {
                    tag: 'lark_md',
                    content: `**Commit**\n${commit.substring(0, 8)}`,
                },
            });
        }
        
        card.card.elements.push({
            tag: 'div',
            fields: fields,
        });
        
        card.card.elements.push({
            tag: 'hr',
        });
    }

    // 测试报告链接
    if (reportExists) {
        card.card.elements.push({
            tag: 'div',
            text: {
                tag: 'lark_md',
                content: `✅ **测试已完成**`,
            },
        });
        
        card.card.elements.push({
            tag: 'action',
            actions: [
                {
                    tag: 'button',
                    text: {
                        tag: 'plain_text',
                        content: '📊 查看完整报告',
                    },
                    type: 'primary',
                    url: reportUrl,
                },
            ],
        });
    } else {
        card.card.elements.push({
            tag: 'div',
            text: {
                tag: 'lark_md',
                content: `❌ **测试报告生成失败**\n请检查 GitHub Actions 日志获取详细信息。`,
            },
        });
    }

    // 添加覆盖率详情（如果有）
    if (coverageReport) {
        card.card.elements.push({
            tag: 'hr',
        });
        
        // 解析覆盖率报告，提取关键信息
        const untestedMatch = coverageReport.match(/缺失 E2E 测试的 API 接口 \((\d+) 个\)/);
        const untestedCount = untestedMatch ? untestedMatch[1] : '0';
        
        if (parseInt(untestedCount) > 0) {
            card.card.elements.push({
                tag: 'div',
                text: {
                    tag: 'lark_md',
                    content: `⚠️ **发现 ${untestedCount} 个 API 缺少测试**\n点击查看详细报告了解具体接口。`,
                },
            });
        } else {
            card.card.elements.push({
                tag: 'div',
                text: {
                    tag: 'lark_md',
                    content: `🎉 **所有 API 都有 E2E 测试覆盖！**`,
                },
            });
        }
    }

    // 页脚信息
    card.card.elements.push({
        tag: 'hr',
    });
    card.card.elements.push({
        tag: 'note',
        elements: [
            {
                tag: 'plain_text',
                content: `🤖 GitHub Actions 自动触发 | Run ID: ${runId}`,
            },
        ],
    });

    return card;
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

