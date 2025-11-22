const fs = require('fs');
const path = require('path');
const os = require('os');

function resolveConfig() {
    console.log('🚀 Starting configuration setup...');

    // 1. Load .user.json
    let userConfig = {};
    const userJsonPath = path.join(process.cwd(), '.user.json');
    if (fs.existsSync(userJsonPath)) {
        try {
            console.log(`🔍 Found .user.json at ${userJsonPath}`);
            const content = fs.readFileSync(userJsonPath, 'utf8');
            userConfig = JSON.parse(content);
        } catch (e) {
            console.warn(`⚠️ Failed to read .user.json: ${e.message}`);
        }
    } else {
        console.log('ℹ️ .user.json not found, skipping local config');
    }

    // Helper to resolve value: User Config > Input > Default
    const resolve = (key, inputVal, defaultVal, userConfigKey) => {
        // userConfigKey defaults to key if not provided
        const uKey = userConfigKey || key;
        
        if (userConfig[uKey]) {
            console.log(`✅ ${key}: Read from .user.json`);
            return userConfig[uKey];
        }
        if (inputVal) {
            console.log(`✅ ${key}: Using input value`);
            return inputVal;
        }
        console.log(`ℹ️ ${key}: Using default value`);
        return defaultVal;
    };

    // Inputs are passed as environment variables
    const inputs = {
        httpProxy: process.env.INPUT_HTTP_PROXY,
        httpsProxy: process.env.INPUT_HTTPS_PROXY,
        reportServerUrl: process.env.INPUT_REPORT_SERVER_URL,
        githubToken: process.env.INPUT_GITHUB_TOKEN,
        feishuWebhookUrl: process.env.INPUT_FEISHU_WEBHOOK_URL,
    };

    // Resolve configurations
    const httpProxy = resolve('HTTP_PROXY', inputs.httpProxy, 'http://127.0.0.1:7890');
    const httpsProxy = resolve('HTTPS_PROXY', inputs.httpsProxy, 'http://127.0.0.1:7890');
    const reportServerUrl = resolve('REPORT_SERVER_URL', inputs.reportServerUrl, 'http://192.168.52.77:8080');
    
    // Special handling for Feishu (no default)
    const feishuWebhookUrl = resolve('FEISHU_WEBHOOK_URL', inputs.feishuWebhookUrl, '', 'FEISHU_WEBHOOK_URL');
    if (!feishuWebhookUrl) console.warn('⚠️ FEISHU_WEBHOOK_URL not found');

    // Special handling for PAT/Token
    // .user.json key is PAT_TOKEN, input is github-token
    let patToken = '';
    if (userConfig['PAT_TOKEN']) {
        patToken = userConfig['PAT_TOKEN'];
        console.log('✅ PAT_TOKEN: Read from .user.json');
    } else if (inputs.githubToken) {
        patToken = inputs.githubToken;
        console.log('✅ PAT_TOKEN: Using GitHub Token');
    } else {
        console.warn('⚠️ PAT_TOKEN not found');
    }

    // Output to GITHUB_OUTPUT
    const output = process.env.GITHUB_OUTPUT;
    if (output) {
        fs.appendFileSync(output, `feishu_webhook_url=${feishuWebhookUrl}${os.EOL}`);
        fs.appendFileSync(output, `pat_token=${patToken}${os.EOL}`);
        fs.appendFileSync(output, `http_proxy=${httpProxy}${os.EOL}`);
        fs.appendFileSync(output, `https_proxy=${httpsProxy}${os.EOL}`);
        fs.appendFileSync(output, `report_server_url=${reportServerUrl}${os.EOL}`);
    } else {
        console.warn('⚠️ GITHUB_OUTPUT not set');
    }

    // Output to GITHUB_ENV
    const env = process.env.GITHUB_ENV;
    if (env) {
        fs.appendFileSync(env, `HTTP_PROXY=${httpProxy}${os.EOL}`);
        fs.appendFileSync(env, `HTTPS_PROXY=${httpsProxy}${os.EOL}`);
        fs.appendFileSync(env, `REPORT_SERVER_URL=${reportServerUrl}${os.EOL}`);
    } else {
        console.warn('⚠️ GITHUB_ENV not set');
    }
    
    console.log('✅ Configuration setup complete');
}

resolveConfig();
