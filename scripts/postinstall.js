// 拷贝模拟 cc 模块

const { existsSync, copy } = require('fs-extra');
const { join } = require('path');

const userConfig = join(__dirname, '../.user.json');

if (!existsSync(userConfig)) {
    console.error('请在仓库下添加 .user.json 文件填写 cc 和 engine 地址');
    process.exit(1);
}

async function mockNpmModules() {
    const { node_modules } = require('../.user.json');
    for (const name of Object.keys(node_modules)) {
        await copy(node_modules[name], join(__dirname, `../node_modules/${name}`));
        console.log(`模拟 ${name} 模块成功`);
    }
}

mockNpmModules();