/**
 * 命令行构建处理主入口
 */

// 1. 先导入资源 2. 执行命令行构建
import { join } from 'path';
import { projectManager } from '../core/launcher';

// 这是测试代码，不能使用单元测试，因为 jest 会捕获 require 然后不走 preload 的特殊处理,导致读不了 cc
(async () => {
    const { project } = require('../../.user.json');
    const projectRoot = project || join(__dirname, '../tests/fixtures/projects/asset-operation');
    const res = await projectManager.build(
        project || projectRoot,
        {
            platform: 'web-desktop',
        });
    process.exit(res);
})().catch(err => {
    console.error(err);
    process.exit(1);
});
