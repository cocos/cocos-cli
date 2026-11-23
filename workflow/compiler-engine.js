const fse = require('fs-extra');
const path = require('path');
const utils = require('./utils');
const { parseArgs } = require('node:util');
const { resolvePreparationEngine } = require('./prepare-engine-selection');

if (!utils.hasDevelopmentEnvironment()) return;

(async () => {
    utils.logTitle('Compiler engine');

    const { values } = parseArgs({ options: { force: { type: 'boolean' }, 'engine-path': { type: 'string' } } });
    const isForce = values.force;
    const selection = resolvePreparationEngine(path.join(__dirname, '..'), values['engine-path']);
    const engine = selection.path;
    if (selection.packageRoot) {
        console.log('[Skip] Engine npm SDK already prepared: ' + selection.packageRoot);
        return;
    }
    if (!fse.existsSync(path.join(engine, 'package.json'))) throw new Error(`Engine source not found: ${engine}`);
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
        console.error(error);
        process.exitCode = 1;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
