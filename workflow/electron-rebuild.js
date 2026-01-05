const { execSync } = require('child_process');
const path = require('path');

const pkg = require(path.resolve(__dirname, '../package.json'));
const electronVersion = pkg.engines && pkg.engines.electron;

if (!electronVersion) {
    console.error('[rebuild] engines.electron is not defined in package.json');
    process.exit(1);
}

function run(cmd) {
    console.log(`\n> ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
}

try {
    run('npx --yes patch-package');
    run(`npx @electron/rebuild --force --version ${electronVersion}`);
} catch (err) {
    console.error('\n[rebuild] failed');
    process.exit(1);
}