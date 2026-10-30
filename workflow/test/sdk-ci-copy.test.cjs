const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { runCiTests } = require('../sdk-ci-tests');
function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-copy-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); }
for (const consumeSource of [false, true]) test('CI source ownership and suite isolation: consume=' + consumeSource, async t => {
    const dir = fixture(t);
    const source = path.join(dir, 'source');
    const config = { work: path.join(dir, 'pair'), cli: path.join(dir, 'cli'), engine: path.join(dir, 'engine') };
    fs.mkdirSync(config.work); fs.mkdirSync(config.engine);
    for (const entry of ['src', 'tests', 'e2e', 'dist', 'static', 'workflow', 'packages', '@types', 'node_modules', '.github']) fs.mkdirSync(path.join(source, entry), { recursive: true });
    write(path.join(source, '.vscodeignore'), 'packages/asset-db/test');
    write(path.join(source, 'package.json'), { version: '1.0.0' });
    for (const file of ['package-lock.json', 'tsconfig.json', 'engine-compatibility.json']) write(path.join(source, file), {});
    write(path.join(source, 'jest.config.ts'), '');
    const sentry = "exports.config = { dsn: 'https://example.com/test' };";
    write(path.join(source, 'src/core/base/sentry.ts'), sentry);
    write(path.join(source, 'dist/core/base/sentry.js'), sentry);
    write(path.join(config.cli, 'dist/core/base/sentry.js'), sentry);
    write(path.join(config.cli, 'cli-sdk.json'), { cliVersion: '1.0.0', files: [{ path: 'dist/core/base/sentry.js', sha256: crypto.createHash('sha256').update(sentry).digest('hex') }] });
    for (const file of ['packages/cc-module/cc.d.ts', 'node_modules/cc/cc.d.ts']) write(path.join(source, file), '/// <reference path="../engine/bin/.declarations/cc.d.ts"/>\n');
    write(path.join(source, 'node_modules/tsx/dist/cli.mjs'), `import fs from 'node:fs'; import path from 'node:path'; fs.writeFileSync(path.resolve('..', 'mcp.ready'), 'ready');`);
    write(path.join(source, 'node_modules/jest/bin/jest.js'), `
        const fs = require('fs'), path = require('path'), assert = require('assert/strict');
        const args = process.argv, unit = args.includes('jest.config.ts'), name = unit ? 'unit' : 'e2e';
        const output = args[args.indexOf('--outputFile') + 1], work = path.dirname(output);
        const engine = JSON.parse(fs.readFileSync('config.local.json', 'utf8')).enginePath;
        fs.writeFileSync(path.join(engine, 'suite-marker'), name);
        fs.writeFileSync(path.join(work, name + '.started'), 'ready');
        (async () => {
            const limit = Date.now() + 3000;
            while (!fs.existsSync(path.join(work, (unit ? 'e2e' : 'unit') + '.started'))) {
                if (Date.now() > limit) throw Error('Suites did not overlap');
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            assert.equal(fs.readFileSync(path.join(engine, 'suite-marker'), 'utf8'), name);
            if (!unit) assert(fs.existsSync(path.join(work, 'mcp.ready')));
            fs.writeFileSync(output, JSON.stringify({success:!unit,numTotalTests:1,numPassedTests:unit?0:1,numFailedTests:unit?1:0,numFailedTestSuites:unit?1:0}));
            process.exitCode = unit ? 1 : 0;
        })().catch(error => { console.error(error); process.exitCode = 2; });
    `);
    const result = await runCiTests(config, source, 5000, { consumeSource });
    assert.equal(result.status, 'failed', result.error);
    assert.equal(result.suites.unit.status, 'failed');
    assert.equal(result.suites.e2e.status, 'passed');
    assert.equal(fs.realpathSync(path.join(config.work, 'unit-tests/packages/engine')), fs.realpathSync(path.join(config.work, 'unit-engine')));
    assert.equal(fs.readFileSync(path.join(config.engine, 'suite-marker'), 'utf8'), 'e2e');
    assert.equal(fs.readFileSync(path.join(config.work, 'unit-engine/suite-marker'), 'utf8'), 'unit');
    assert.equal(fs.readFileSync(path.join(config.work, 'tests/.vscodeignore'), 'utf8'), 'packages/asset-db/test');
    assert.equal(fs.realpathSync(path.join(config.work, 'tests/packages/engine')), fs.realpathSync(config.engine));
    assert.equal(JSON.parse(fs.readFileSync(path.join(config.work, 'tests/config.local.json'))).enginePath, config.engine);
    assert.equal(result.sourceMode, consumeSource ? 'moved' : 'copied');
    for (const name of ['sourceSnapshotMs', 'unitSourceCopyMs', 'unitEngineCopyMs', 'unitCliCopyMs']) assert.equal(typeof result.preparation[name], 'number');
    if (consumeSource) assert.equal(fs.existsSync(source), false);
    else assert.match(fs.readFileSync(path.join(source, 'dist/core/base/sentry.js'), 'utf8'), /https:/);
    fs.writeFileSync(path.join(config.work, 'unit-tests/dist/core/base/sentry.js'), 'unit modification');
    assert.doesNotMatch(fs.readFileSync(path.join(config.work, 'tests/dist/core/base/sentry.js'), 'utf8'), /unit modification/);
    fs.writeFileSync(path.join(config.work, 'unit-cli/dist/core/base/sentry.js'), 'unit CLI modification');
    assert.doesNotMatch(fs.readFileSync(path.join(config.cli, 'dist/core/base/sentry.js'), 'utf8'), /unit CLI modification/);
});