const { join } = require('path');
const { existsSync } = require('fs-extra');
const { runCommand, logTitle } = require('./utils');

(async () => {
    logTitle('Build web-adapter');

    const args = process.argv.slice(2);
    const isForce = args.includes('--force');

    const { engine } = require('../.user.json');

    if (existsSync(join(engine, 'bin', 'adapter')) && !isForce) {
        console.log('[Skip] build web-adapter');
        return;
    }

    await runCommand('node', [join(engine, 'scripts/build-adapter.js')]);
})();
