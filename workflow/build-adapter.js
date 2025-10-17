const path = require('path');
const fse = require('fs-extra');
const utils = require('./utils');

if (!utils.hasDevelopmentEnvironment()) return;

(async () => {
    utils.logTitle('Build web-adapter');

    const args = process.argv.slice(2);
    const isForce = args.includes('--force');

    const engine = path.join(__dirname, '..', 'packages', 'engine');
    if (fse.existsSync(path.join(engine, 'bin', 'adapter')) && !isForce) {
        console.log('[Skip] build web-adapter');
        return;
    }

    await utils.runCommand('node', [path.join(engine, 'scripts/build-adapter.js')]);
})();
