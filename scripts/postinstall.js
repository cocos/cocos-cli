// 拷贝模拟 cc 模块

const fse = require('fs-extra');
const path = require('path');
const utils = require('./utils');
const { spawnSync } = require('child_process');
const readline = require('readline');

const userConfig = path.join(__dirname, '../.user.json');

if (!fse.existsSync(userConfig)) {
    console.warn('测试 assets 相关模块前，请在仓库下添加 .user.json 文件填写 cc 和 @editor/asset-db 地址');
}

/**
 * 询问是否强制更新全部模块
 * @returns {Promise<boolean>}
 */
function askForForceUpdate() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // 设置3秒超时，默认强制更新
        const timeout = setTimeout(() => {
            rl.close();
            console.log('\n3秒内未响应，默认选择强制更新');
            resolve(true);
        }, 3000);

        rl.question('是否强制更新？(y/n) [3秒后默认强制更新]: ', (answer) => {
            clearTimeout(timeout);
            rl.close();
            const shouldForce = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes' || answer.toLowerCase() === '';
            resolve(shouldForce);
        });
    });
}

async function mockNpmModules() {
    // 检查是否通过 npm i --force 调用，或者设置了环境变量
    const isNpmForce = Boolean(process.env['FORCE_UPDATE']);

    let forceUpdate;
    if (isNpmForce) {
        forceUpdate = true;
        console.log('检测到 --force 参数，跳过询问，直接强制更新');
    } else {
        forceUpdate = await askForForceUpdate();
    }

    const forceFlag = forceUpdate ? '--force' : '';

    console.log(`开始构建${forceUpdate ? ' (强制更新)' : ''}...`);

    // build cc-module
    await utils.runCommand('node', ['./scripts/build-cc-module.js']);
    // build web-adapter
    await utils.runCommand('node', ['./scripts/build-adapter.js', forceFlag]);

    // build cli
    await utils.runCommand('node', ['./scripts/build-ts.js', forceFlag]);
    // compiler engine
    await utils.runCommand('node', ['./scripts/compiler-engine.js', forceFlag]);

    // 模拟 i18n 包
}

mockNpmModules();