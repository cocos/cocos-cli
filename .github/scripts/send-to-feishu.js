#!/usr/bin/env node
/**
 * 发送消息到飞书群聊
 * 支持文本消息和卡片消息
 */

const https = require('https');
const { generateFeishuCard } = require('./generate-message');

/**
 * 发送 HTTPS POST 请求
 */
function sendRequest(url, data) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(data);

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = https.request(options, (res) => {
            let body = '';

            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    if (response.code === 0 || response.StatusCode === 0) {
                        resolve(response);
                    } else {
                        reject(new Error(`Feishu API error: ${response.msg || response.StatusMessage || body}`));
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse response: ${body}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * 发送卡片消息到飞书
 */
async function sendCardMessage(webhookUrl, data) {
    console.log('📤 Sending message to Feishu...');
    
    // 生成飞书卡片
    const card = generateFeishuCard(data);
    
    try {
        const response = await sendRequest(webhookUrl, card);
        console.log('✅ Message sent successfully');
        console.log('Response:', JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        console.error('❌ Failed to send message:', error.message);
        throw error;
    }
}

/**
 * 发送简单文本消息到飞书
 */
async function sendTextMessage(webhookUrl, text) {
    console.log('📤 Sending text message to Feishu...');
    
    const message = {
        msg_type: 'text',
        content: {
            text: text,
        },
    };
    
    try {
        const response = await sendRequest(webhookUrl, message);
        console.log('✅ Message sent successfully');
        return response;
    } catch (error) {
        console.error('❌ Failed to send message:', error.message);
        throw error;
    }
}

/**
 * 主函数
 */
async function main() {
    // 获取飞书 Webhook URL
    const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.error('❌ Error: FEISHU_WEBHOOK_URL environment variable is not set');
        console.error('');
        console.error('Please set it in GitHub Secrets or environment variables:');
        console.error('  export FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..."');
        process.exit(1);
    }

    // 收集数据
    const data = {
        reportExists: process.env.REPORT_EXISTS === 'true',
        reportUrl: process.env.REPORT_URL || '',
        reportFilename: process.env.REPORT_FILENAME || '',
        coverageReportUrl: process.env.COVERAGE_REPORT_URL || '',
        coverageReportFilename: process.env.COVERAGE_REPORT_FILENAME || '',
        coveragePercent: process.env.COVERAGE_PERCENT || '',
        testedCount: process.env.TESTED_COUNT || '',
        totalCount: process.env.TOTAL_COUNT || '',
        coverageMarkdown: process.env.COVERAGE_MARKDOWN || '',
        runId: process.env.GITHUB_RUN_ID || '',
        triggerType: process.env.GITHUB_EVENT_NAME || '',
        branch: process.env.GITHUB_REF_NAME || '',
        commit: process.env.GITHUB_SHA || '',
        // Daily 测试不需要显示提交者
        // author: process.env.GITHUB_ACTOR || '',
    };

    console.log('📊 Test Report Data:');
    console.log(`   E2E Test Report: ${data.reportExists ? data.reportUrl : 'N/A'}`);
    console.log(`   Coverage Report: ${data.coverageReportUrl || 'N/A'}`);
    console.log(`   Trigger: ${data.triggerType}`);
    console.log(`   Branch: ${data.branch}`);
    console.log('');

    try {
        await sendCardMessage(webhookUrl, data);
        process.exit(0);
    } catch (error) {
        console.error('');
        console.error('💡 Troubleshooting:');
        console.error('1. Check if the Webhook URL is correct');
        console.error('2. Verify the bot has permission to send messages to the group');
        console.error('3. Check Feishu API status');
        process.exit(1);
    }
}

// 运行
if (require.main === module) {
    main();
}

module.exports = {
    sendCardMessage,
    sendTextMessage,
};

