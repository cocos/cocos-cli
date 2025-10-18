const utils = require('./utils');

/**
 * 初始化，更新仓库以及同步代码等操作，目前强制更新
 * @returns {Promise<void>}
 */
(async () => {
    console.log('初始化\n');
    const forceFlag = '--force';
    // update repo
    await utils.runCommand('node', ['./workflow/update-repo.js', forceFlag].filter(Boolean));

    console.log('\n初始化完成\n');
})();
