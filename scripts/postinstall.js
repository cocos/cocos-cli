// 拷贝模拟 cc 模块

const { existsSync, copy } = require('fs-extra');
const { join } = require('path');
const { runCommand } = require('./utils');

const userConfig = join(__dirname, '../.user.json');

if (!existsSync(userConfig)) {
    console.warn('测试 assets 相关模块前，请在仓库下添加 .user.json 文件填写 cc 和 @editor/asset-db 地址');
}

async function mockNpmModules() {
    const { engine, node_modules } = require('../.user.json');
    for (const name of Object.keys(node_modules)) {
        await copy(node_modules[name], join(__dirname, `../node_modules/${name}`));
        console.log(`模拟 ${name} 模块成功`);
    }
    // build web-adapter
    await runCommand('node', [join(engine, 'scripts/build-adapter.js')]);
    // 模拟 i18n 包
    // build cc-module
    await runCommand('node', ['./scripts/build-cc-module.js']);
}

mockNpmModules();