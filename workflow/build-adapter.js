const path = require('path');
const fse = require('fs-extra');
const utils = require('./utils');

const userConfig = path.join(__dirname, '../.user.json');
if (!fse.existsSync(userConfig)) {
    // TODO 需要完善：如果没有 user.json 不是开发版本
    return;
}

(async () => {
    utils.logTitle('Build web-adapter');

    const args = process.argv.slice(2);
    const isForce = args.includes('--force');

    const { engine } = require('../.user.json');

    if (fse.existsSync(path.join(engine, 'bin', 'adapter')) && !isForce) {
        console.log('[Skip] build web-adapter');
        return;
    }

    await utils.runCommand('node', [path.join(engine, 'scripts/build-adapter.js')]);
})();
