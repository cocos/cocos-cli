const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const utils = require('./utils');
const { resolveEnginePath } = require('./engine-path');

/** Explicit environment preparation; never called by an npm install lifecycle. */
async function setupDev({ compileEngine = true, force = false, minimalTools = false, root = path.resolve(__dirname, '..'), run = utils.runCommand } = {}) {
    const engine = resolveEnginePath(root);
    if (!fs.existsSync(path.join(engine, 'package.json'))) {
        throw new Error(`Engine is missing at ${engine}. Configure enginePath in config.local.json, install a prepared SDK in packages/engine, or explicitly run npm run fetch:engine and npm run install:engine for source development.`);
    }
    if (!compileEngine) {
        for (const file of ['bin/.declarations/cc.d.ts', 'bin/.declarations/cc.editor.d.ts', 'bin/.cache/dev-cli/editor/loader.js']) {
            if (!fs.existsSync(path.join(engine, file))) throw new Error(`Prepared Engine SDK is missing ${file} at ${engine}. Use npm run setup:dev to compile engine source explicitly.`);
        }
    }
    const forceArgs = force ? ['--force'] : [];
    const nodeOptions = { cwd: root, shell: false };
    const workflow = path.join(root, 'workflow');
    if (compileEngine) {
        await run(process.execPath, ['--max-old-space-size=8192', path.join(workflow, 'compiler-engine.js'), '--engine-path', engine, ...forceArgs], nodeOptions);
    }
    await run(process.execPath, [path.join(workflow, 'build-cc-module.js'), '--engine-path', engine], nodeOptions);
    await run('npm', ['run', 'build'], { cwd: root });
    await run(process.execPath, [path.join(workflow, 'download-tools.js'), ...forceArgs, ...(minimalTools ? ['--minimal'] : [])], nodeOptions);
}

if (require.main === module) {
    const { values } = parseArgs({ options: { force: { type: 'boolean' }, 'skip-engine': { type: 'boolean' }, 'minimal-tools': { type: 'boolean' } } });
    setupDev({ compileEngine: !values['skip-engine'], force: values.force, minimalTools: values['minimal-tools'] || process.env.MINIMAL_DOWNLOAD_TOOLS === 'true' })
        .then(() => console.log('Development environment prepared.'))
        .catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { setupDev };
