const { EngineCompiler } = require('../dist/core/engine/compiler');
const { existsSync } = require('fs-extra');
const { join } = require('path');
const { logTitle } = require('./utils');

(async () => {
    logTitle('Compiler engine');

    const args = process.argv.slice(2);
    const isForce = args.includes('--force');
    const { engine } = require('../.user.json');

    if (existsSync(join(engine, 'bin', '.cache', 'dev-cli')) || isForce) {
        console.log('[Skip] compiler engine');
        return;
    }

    const compiler = EngineCompiler.create(engine);
    try {
        await compiler.clear();
        await compiler.compileEngine(engine, true);
    } catch (error) {
        throw error;
    }
})();
