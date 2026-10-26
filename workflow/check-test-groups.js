#!/usr/bin/env node
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const parallelFiles = require('./parallel-tests.json');

const root = path.resolve(__dirname, '..');
function discover(config) {
    return JSON.parse(execFileSync(process.execPath, [
        require.resolve('jest/bin/jest'), '--config', config, '--listTests', '--json',
    ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

const all = discover('jest.config.ts');
const parallel = discover('jest.parallel.config.ts');
const serial = discover('jest.serial.config.ts');
assert.equal(new Set(parallelFiles).size, parallelFiles.length, 'Duplicate allowlist entries');
assert.deepEqual(new Set(parallel), new Set(parallelFiles.map(file => path.resolve(root, file))), 'Stale/undiscoverable allowlist entries');
assert.equal(parallel.filter(file => serial.includes(file)).length, 0, 'Test groups overlap');
assert.deepEqual(new Set([...parallel, ...serial]), new Set(all), 'Test groups must cover the original suite');
console.log(`Test groups verified: ${all.length} total = ${parallel.length} parallel + ${serial.length} serial`);
