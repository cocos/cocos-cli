'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const packageRoot = path.resolve(__dirname, '..');
const testRoot = path.join(packageRoot, 'test');
const mochaBin = require.resolve('mocha/bin/mocha');
const specs = fs.readdirSync(testRoot)
    .filter((name) => name.endsWith('.spec.js'))
    .sort((left, right) => {
        const leftOrder = Number.parseInt(left, 10);
        const rightOrder = Number.parseInt(right, 10);
        return leftOrder - rightOrder || left.localeCompare(right);
    });

let failed = false;
for (const spec of specs) {
    console.log(`\n--- AssetDB test: ${spec} ---`);
    const result = spawnSync(process.execPath, [
        mochaBin,
        '--exit',
        '--timeout',
        '100000',
        path.join(testRoot, spec),
    ], {
        cwd: packageRoot,
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        failed = true;
    }
}

if (failed) {
    process.exitCode = 1;
}
