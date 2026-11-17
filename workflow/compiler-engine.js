const fse = require('fs-extra');
const path = require('path');
const utils = require('./utils');
const { parseArgs } = require('node:util');
const { resolveEnginePath } = require('./engine-path');
const { getEngineBackendAdapter } = require('../adapters/engine/registry.cjs');

if (!utils.hasDevelopmentEnvironment()) return;

(async () => {
    utils.logTitle('Compiler engine');

    const { values } = parseArgs({ options: { force: { type: 'boolean' }, 'engine-path': { type: 'string' } } });
    const isForce = values.force;
    const engine = resolveEnginePath(path.join(__dirname, '..'), values['engine-path']);
    if (!fse.existsSync(path.join(engine, 'package.json'))) throw new Error(`Engine source not found: ${engine}`);
    const selection = { path: engine, version: fse.readJsonSync(path.join(engine, 'package.json')).version };
    const compilation = getEngineBackendAdapter(selection).compile(selection);
    const hasDev = fse.existsSync(compilation.directory);

    const versionFile = path.join(compilation.directory, 'VERSION');
    const currentVersion = fse.existsSync(versionFile) && fse.readFileSync(versionFile, 'utf8').trim() === compilation.version;
    if (hasDev && currentVersion && !isForce) {
        console.log('[Skip] compiler engine');
        return;
    }

    try {
        // tsc engine-compiler
        if (compilation.compilerSource) {
            const sourceDir = path.join(__dirname, '..', compilation.compilerSource);
            fse.removeSync(path.join(sourceDir, 'dist'));
            utils.runTscCommand(sourceDir);
            console.log('tsc', sourceDir);
        }

        // 编译引擎
        const { compileEngine } = require(path.join(__dirname, '..', compilation.compilerModule));
        await compileEngine(engine);

        // compile for web
        await compileEngine(engine, true);
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
