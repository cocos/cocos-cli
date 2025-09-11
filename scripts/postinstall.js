// 拷贝模拟 cc 模块

const { existsSync } = require('fs');
const { join } = require('path');

const userConfig = join(__dirname, '../.user.json');

if (!existsSync(userConfig)) {
    console.error('请在仓库下添加 .user.json 文件填写 cc 和 engine 地址');
    process.exit(1);
}

async function addCCModule() {
    const { cc, engine } = require('../.user.json');
    const { copy } = require('fs-extra');

    await copy(cc, join(__dirname, '../node_modules/cc'));
}

addCCModule().then(() => {
    console.log('模拟 cc 模块成功');
});