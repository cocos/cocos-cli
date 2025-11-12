#!/usr/bin/env node
/**
 * 发送发布结果到飞书群聊
 */

const https = require('https');
const { generateReleaseFeishuCard } = require('./generate-release-message');

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
    console.log('📤 Sending release message to Feishu...');
    
    // 生成飞书卡片
    const card = generateReleaseFeishuCard(data);
    
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

    // 解析发布结果
    let releaseResults = {};
    try {
        const releaseResultsStr = process.env.RELEASE_RESULTS;
        if (releaseResultsStr) {
            releaseResults = JSON.parse(releaseResultsStr);
        }
    } catch (error) {
        console.error('❌ Failed to parse release results:', error.message);
        process.exit(1);
    }

    // 收集数据
    const data = {
        releaseResults,
        runId: process.env.RUN_ID || '',
        triggerType: process.env.TRIGGER_TYPE || '',
        branch: process.env.BRANCH || '',
        commit: process.env.COMMIT || '',
    };

    console.log('📊 Release Data:');
    console.log(`   Node.js: ${releaseResults.nodejs?.success ? '✅' : releaseResults.nodejs ? '❌' : 'N/A'}`);
    console.log(`   Electron: ${releaseResults.electron?.success ? '✅' : releaseResults.electron ? '❌' : 'N/A'}`);
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
};

