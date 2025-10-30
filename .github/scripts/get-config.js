#!/usr/bin/env node
/**
 * 获取配置项（支持从 GitHub Secrets 或本地 .user.json 读取）
 * 
 * 用法：
 *   node .github/scripts/get-config.js FEISHU_WEBHOOK_URL
 *   node .github/scripts/get-config.js PAT_TOKEN
 */

const fs = require('fs');
const path = require('path');

function getConfig(configKey) {
    // 1. 优先从环境变量读取（GitHub Secrets）
    const envValue = process.env[configKey];
    if (envValue) {
        console.log(`✅ Found ${configKey} from environment variable`);
        return envValue;
    }

    // 2. 备选方案：从本地 .user.json 读取
    const userJsonPath = path.join(process.cwd(), '.user.json');
    
    if (!fs.existsSync(userJsonPath)) {
        console.warn(`⚠️  ${configKey} not found in environment variables`);
        console.warn(`⚠️  .user.json file not found at: ${userJsonPath}`);
        console.warn(`⚠️  Please set ${configKey} in GitHub Secrets or create .user.json`);
        return '';
    }

    try {
        const userConfig = JSON.parse(fs.readFileSync(userJsonPath, 'utf-8'));
        
        if (userConfig[configKey]) {
            console.log(`✅ Found ${configKey} from .user.json`);
            return userConfig[configKey];
        } else {
            console.warn(`⚠️  ${configKey} not found in environment variables`);
            console.warn(`⚠️  ${configKey} not found in .user.json`);
            console.warn(`⚠️  Available keys in .user.json: ${Object.keys(userConfig).join(', ')}`);
            return '';
        }
    } catch (error) {
        console.error(`❌ Error reading .user.json: ${error.message}`);
        return '';
    }
}

// 主函数
function main() {
    const configKey = process.argv[2];
    
    if (!configKey) {
        console.error('❌ Usage: node get-config.js <CONFIG_KEY>');
        console.error('   Example: node get-config.js FEISHU_WEBHOOK_URL');
        process.exit(1);
    }

    const value = getConfig(configKey);
    
    // 输出到 GITHUB_OUTPUT（如果在 GitHub Actions 环境中）
    if (process.env.GITHUB_OUTPUT) {
        const outputLine = `${configKey}=${value}\n`;
        fs.appendFileSync(process.env.GITHUB_OUTPUT, outputLine, 'utf-8');
        console.log(`✅ Set ${configKey} to GITHUB_OUTPUT`);
    }
    
    // 也输出到 stdout，方便本地测试
    console.log(`${configKey}=${value}`);
}

// 运行
if (require.main === module) {
    main();
}

module.exports = { getConfig };

