/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executePair } = require('../sdk-matrix');

test('smoke process and nested build worker retain the CI heap limit and SDK guard', async t => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-heap-'));
    t.after(() => fs.rmSync(work, { recursive: true, force: true }));
    const config = { work, cli: path.join(work, 'cli'), engine: path.join(work, 'engine'), project: path.join(work, 'project') };
    const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
    fs.mkdirSync(config.project);
    write(path.join(config.cli, 'cli-sdk.json'), '{}');
    write(path.join(config.engine, 'engine-sdk.json'), '{}');
    // Exit after measuring the real subprocess environment; no engine build is needed.
    write(path.join(config.cli, 'dist/core/base/sentry.js'), `
        const fs = require('node:fs');
        const { execFileSync } = require('node:child_process');
        const probe = 'JSON.stringify({ heap: require("node:v8").getHeapStatistics().heap_size_limit, options: process.env.NODE_OPTIONS })';
        const child = JSON.parse(execFileSync(process.execPath, ['-e', 'console.log(' + probe + ')'], { encoding: 'utf8' }));
        fs.writeFileSync(require('node:path').join(JSON.parse(fs.readFileSync(process.env.SDK_MATRIX_CONFIG, 'utf8')).work, 'probe.json'), JSON.stringify({ parent: { heap: require('node:v8').getHeapStatistics().heap_size_limit, options: process.env.NODE_OPTIONS }, child }));
        process.exit(0);
    `);
    const file = path.join(work, 'config.json');
    write(file, JSON.stringify(config));
    const result = await executePair(file, path.join(work, 'probe.log'), 10000);
    assert.equal(result.status, 'passed', fs.readFileSync(path.join(work, 'probe.log'), 'utf8'));
    const measurements = JSON.parse(fs.readFileSync(path.join(work, 'probe.json'), 'utf8'));
    for (const measurement of Object.values(measurements)) {
        assert(measurement.heap >= 8 * 1024 ** 3, 'Expected an 8 GiB heap limit');
        assert.match(measurement.options, /--require .*sdk-matrix-guard\.cjs/);
    }
});
