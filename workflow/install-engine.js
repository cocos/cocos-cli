const fs = require('node:fs');
const path = require('node:path');
const utils = require('./utils');
const { resolveEnginePath } = require('./engine-path');

async function installEngine({ root = path.resolve(__dirname, '..'), run = utils.runCommand } = {}) {
    const engine = resolveEnginePath(root);
    if (!fs.existsSync(path.join(engine, 'package.json'))) throw new Error(`Engine source not found: ${engine}. Configure enginePath or run npm run fetch:engine explicitly.`);
    if (fs.existsSync(path.join(engine, 'engine-sdk.json'))) throw new Error('This is a prepared Engine SDK; use npm run setup:cli without reinstalling its dependencies.');
    // Engine package lifecycle scripts are intentional only in this explicit source-development command.
    await run('npm', ['install'], { cwd: engine });
}
if (require.main === module) installEngine().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { installEngine };
