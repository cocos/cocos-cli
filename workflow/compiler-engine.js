const fse = require('fs-extra');
const path = require('path');
const utils = require('./utils');

if (!utils.hasDevelopmentEnvironment()) return;

(async () => {
    utils.logTitle('Compiler engine');

    const args = process.argv.slice(2);
    const isForce = args.includes('--force');

    const engine = path.join(__dirname, '..', 'packages', 'engine');
    const hasDev =fse.existsSync(path.join(engine, 'bin', '.cache', 'dev-cli'));

    const versionFile = path.join(engine, 'bin', '.cache', 'dev-cli', 'VERSION');
    const currentVersion = fse.existsSync(versionFile) && fse.readFileSync(versionFile, 'utf8').trim() === '4';
    if (hasDev && currentVersion && !isForce) {
        console.log('[Skip] compiler engine');
        return;
    }

    try {
        // tsc engine-compiler
        const sourceDir = path.join(__dirname, '../packages/engine-compiler');
        fse.removeSync(path.join(sourceDir, 'dist'));
        utils.runTscCommand(sourceDir);
        console.log('tsc', sourceDir);

        // 编译引擎
        const { compileEngine } = require('../packages/engine-compiler/dist/index');
        await compileEngine(engine);

        // compile for web
        await compileEngine(engine, true);
    } catch (error) {
        console.log(error);
    }
})();
