const readline = require('readline');
const utils = require('./utils');

if (!utils.hasDevelopmentEnvironment()) return;

/**
 * 询问用户是否强制更新全部模块
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
            console.log('\n3秒内未响应，默认强制更新');
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
    // compiler engine
    await utils.runCommand('node', ['--max-old-space-size=8192', './workflow/compiler-engine.js', forceFlag].filter(Boolean));
    // build cc module
    await utils.runCommand('node', ['./workflow/build-cc-module.js', forceFlag].filter(Boolean));
    // generate i18n types
    await utils.runCommand('node', ['./workflow/generate-i18n-types.js', forceFlag].filter(Boolean));
    // tsc cli
    await utils.runCommand('node', ['./workflow/build-ts.js', forceFlag].filter(Boolean));
    //download tools
    const minimalFlag = process.env.MINIMAL_DOWNLOAD_TOOLS ? '--minimal' : '';
    await utils.runCommand('node', ['./workflow/download-tools.js', forceFlag, minimalFlag].filter(Boolean));
}

mockNpmModules().then(() => {
    console.log('\n🎉所有模块构建完成！\n');
});
