#!/usr/bin/env node
/**
 * 生成发布结果消息内容
 * 支持生成飞书卡片格式
 */

/**
 * 生成飞书消息卡片格式（发布结果）
 */
function generateReleaseFeishuCard(data) {
    const {
        releaseResults,
        runId,
        triggerType,
        branch,
        commit,
    } = data;

    // 判断发布状态
    const nodejsSuccess = releaseResults.nodejs?.success;
    const electronSuccess = releaseResults.electron?.success;
    
    // 判断整体状态（至少有一个成功）
    const hasSuccess = nodejsSuccess || electronSuccess;
    const hasFailure = (releaseResults.nodejs && !nodejsSuccess) || (releaseResults.electron && !electronSuccess);
    
    const cardColor = hasFailure ? 'red' : 'green';
    const statusIcon = hasFailure ? '⚠️' : '✅';
    const statusText = hasFailure ? '发布部分失败' : '发布成功';
    
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
                    content: `${statusIcon} 发布结果 ${statusText}`,
                },
                template: cardColor,
            },
            elements: [
                // 基本信息
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
                {
                    tag: 'hr',
                },
                // Node.js 发布结果
                ...(releaseResults.nodejs ? [{
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: buildReleaseTypeSection('Node.js', releaseResults.nodejs),
                    },
                }] : []),
                // Electron 发布结果
                ...(releaseResults.electron ? [{
                    tag: 'div',
                    text: {
                        tag: 'lark_md',
                        content: buildReleaseTypeSection('Electron', releaseResults.electron),
                    },
                }] : []),
                {
                    tag: 'hr',
                },
                // 快速链接
                {
                    tag: 'action',
                    actions: buildActions(releaseResults),
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
 * 构建发布类型部分内容
 */
function buildReleaseTypeSection(typeName, releaseInfo) {
    const statusIcon = releaseInfo.success ? '✅' : '❌';
    let content = `**${typeName}**: ${statusIcon} ${releaseInfo.success ? '发布成功' : '发布失败'}\n`;
    
    if (releaseInfo.success) {
        if (releaseInfo.releaseDir) {
            content += `- 发布目录: ${releaseInfo.releaseDir}\n`;
        }
        if (releaseInfo.zipUrl) {
            content += `- ZIP 文件: [${releaseInfo.zipFilename || '下载'}](${releaseInfo.zipUrl})\n`;
        }
    }
    
    return content;
}

/**
 * 构建操作按钮
 */
function buildActions(releaseResults) {
    const actions = [];
    
    // Node.js ZIP 下载按钮
    if (releaseResults.nodejs?.success && releaseResults.nodejs?.zipUrl) {
        actions.push({
            tag: 'button',
            text: {
                tag: 'plain_text',
                content: '📦 Node.js 下载',
            },
            type: 'primary',
            url: releaseResults.nodejs.zipUrl,
        });
    }
    
    // Electron ZIP 下载按钮
    if (releaseResults.electron?.success && releaseResults.electron?.zipUrl) {
        actions.push({
            tag: 'button',
            text: {
                tag: 'plain_text',
                content: '📦 Electron 下载',
            },
            type: releaseResults.nodejs?.success && releaseResults.nodejs?.zipUrl ? 'default' : 'primary',
            url: releaseResults.electron.zipUrl,
        });
    }
    
    // 如果都没有，显示查看日志按钮
    if (actions.length === 0) {
        actions.push({
            tag: 'button',
            text: {
                tag: 'plain_text',
                content: '🔍 查看日志',
            },
            type: 'danger',
            url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.RUN_ID}`,
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

module.exports = {
    generateReleaseFeishuCard,
};

