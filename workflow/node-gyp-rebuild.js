const { execSync } = require('child_process');

function run(cmd) {
    console.log(`\n> ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
}

try {
    run('npx --yes patch-package');
    run('npm rebuild');
} catch (err) {
    console.error('\n[rebuild] failed');
    process.exit(1);
}
