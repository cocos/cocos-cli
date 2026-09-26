require('./sdk-package-layout.test.cjs');
require('./sdk-ci-copy.test.cjs');
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareSources } = require('../sdk-engine-sources');
const { plan, aggregate, archive } = require('../sdk-ci-shards');
const { bundle: bundleSources, prepare, verify } = require('../sdk-source-shards');
const { describeArtifact } = require('../sdk-matrix');
const { packSdk, REQUIRED } = require('../pack-sdk');
const crypto = require('node:crypto');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = 'a'.repeat(64);
const commits = ['a'.repeat(40), 'b'.repeat(40)];
const refs = `${commits[0]}\trefs/tags/4.0.0\n${commits[1]}\trefs/tags/4.0.1\n`;
function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-source-shard-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}
async function cliFixture(dir) {
    const cli = path.join(dir, 'cli');
    // Use the repository policy so this test follows the real supported stable range.
    fs.mkdirSync(cli);
    fs.copyFileSync(path.resolve(__dirname, '../../engine-compatibility.json'), path.join(cli, 'engine-compatibility.json'));
    write(path.join(cli, 'cli-sdk.json'), { cliVersion: '1.0.0', revision: 'sha256:' + hash, platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules });
    return cli;
}
test('frozen source selection prepares only the indexed commit and rejects invalid indexes', async t => {
    const dir = fixture(t), cli = await cliFixture(dir);
    const selected = await prepareSources({ cli, output: path.join(dir, 'one'), frozenRefs: refs, refIndex: 1, planOnly: true });
    assert.equal(selected.status, 'planned');
    assert.deepEqual(selected.refs.map(ref => ref.commit), [commits[1]]);
    const invalid = await prepareSources({ cli, output: path.join(dir, 'invalid'), frozenRefs: refs, refIndex: 2, planOnly: true });
    assert.equal(invalid.status, 'failed');
    assert.match(invalid.errors.join(), /index/);
});
test('source coverage gate rejects missing, duplicate and changed commits', () => {
    const manifest = { target: { id: 'target-0', runner: 'windows-2022', node: '22' }, cli: { revision: 'cli' }, engines: commits.map((commit, i) => ({ version: `4.0.${i}`, source: { commit, ref: `refs/tags/4.0.${i}` } })) };
    const matrix = plan([manifest]);
    const results = matrix.include.map(job => ({ ...job, status: 'passed', engineRevision: 'sha256:' + hash }));
    assert.equal(aggregate(matrix, results).count, 2);
    assert.throws(() => aggregate(matrix, results.slice(0, 1)), /Missing/);
    assert.throws(() => aggregate(matrix, [results[0], results[0]]), /duplicate/);
    assert.throws(() => aggregate(matrix, [results[0], { ...results[1], engineCommit: commits[0] }]), /identity/);
    assert.throws(() => aggregate(matrix, [results[0], { ...results[1], engineRevision: '' }]), /identity/);
    assert.throws(() => aggregate(matrix, [results[0], { ...results[1], status: 'failed' }]), /failed/);
});
test('one source shard restores shared inputs, builds only its commit and immediately tests that SDK', async t => {
    const dir = fixture(t), cli = await cliFixture(dir), bundle = path.join(dir, 'bundle'), output = path.join(dir, 'verification');
    const source = path.join(dir, 'source');
    write(path.join(source, 'tests/marker'), 'complete test source');
    fs.mkdirSync(bundle);
    const manifest = { schemaVersion: 2, target: { id: 'target-0', runner: 'test', node: process.versions.node },
        host: { platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules }, cli: await describeArtifact(cli, 'cli'),
        repository: 'https://github.com/cocos/cocos4.git', sourceSnapshot: refs,
        engines: commits.map((commit, i) => ({ version: `4.0.${i}`, source: { commit, ref: `refs/tags/4.0.${i}` } })), archives: {} };
    for (const [name, root] of [['cli.tar', cli], ['candidate.tar', source]]) {
        const file = path.join(bundle, name); archive(root, file);
        manifest.archives[name] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
    write(path.join(bundle, 'manifest.json'), manifest);
    const job = plan([manifest]).include[1];
    let prepared = false;
    await prepare(job, bundle, output, { prepareSources: async options => {
        assert.equal(options.frozenRefs, refs); assert.equal(options.refIndex, 1);
        assert.equal(options.prepareOnly, true);
        const engine = path.join(dir, 'engine');
        write(path.join(engine, 'package.json'), { name: 'engine', version: '4.0.1' });
        for (const file of REQUIRED.engine) write(path.join(engine, file), 'prepared');
        const sdk = path.join(dir, 'sdk');
        await packSdk({ kind: 'engine', source: engine, output: sdk });
        const descriptor = await describeArtifact(sdk, 'engine');
        const report = { status: 'prepared', refs: [{ ...manifest.engines[1].source, sdk: descriptor }] };
        write(path.join(options.output, 'source-report.json'), report);
        write(path.join(options.output, 'catalog.json'), { engines: [descriptor] });
        prepared = true; return report;
    } });
    const dependencies = { runMatrix: async options => {
        assert(prepared);
        assert.equal(options.consumeTestSource, true);
        assert.equal(fs.readFileSync(path.join(options.testRoot, 'tests/marker'), 'utf8'), 'complete test source');
        const catalog = read(options.catalog); assert.equal(catalog.engines.length, 1);
        assert.equal(catalog.engines[0].version, '4.0.1');
        return { status: 'passed', pairs: [{ engine: catalog.engines[0], cli: manifest.cli, ci: { suites: { unit: { status: 'passed' }, e2e: { status: 'passed' } } } }] };
    } };
    const result = await verify(job, bundle, output, dependencies);
    assert.equal(result.status, 'passed');
    assert.equal(aggregate({ include: [job] }, [result]).count, 1);
    await assert.rejects(verify(job, bundle, output, { runMatrix: async () => ({ status: 'failed', pairs: [] }) }), /unit\/E2E/);
    assert.equal(read(path.join(output, 'shard-result.json')).status, 'failed');
    const report = read(path.join(output, 'sources/source-report.json')); report.refs[0].commit = commits[0];
    write(path.join(output, 'sources/source-report.json'), report);
    await assert.rejects(verify(job, bundle, output, dependencies), /identity/);
});

test('shared bundle freezes all refs without requiring any prepared engine', async t => {
    const dir = fixture(t), cli = await cliFixture(dir), source = path.join(dir, 'source');
    for (const name of ['src', 'tests', 'e2e', 'dist', 'static', 'workflow', 'packages', '@types', 'node_modules', '.github']) fs.mkdirSync(path.join(source, name), { recursive: true });
    for (const name of ['.vscodeignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'jest.config.ts', 'engine-compatibility.json']) write(path.join(source, name), '{}');
    const snapshot = path.join(dir, 'plan');
    await prepareSources({ cli, output: snapshot, frozenRefs: refs, planOnly: true });
    const result = await bundleSources({ id: 'target-0', runner: 'test', node: process.versions.node }, source, cli, snapshot, path.join(dir, 'bundle'));
    assert.equal(result.schemaVersion, 2);
    assert.deepEqual(plan([result]).include.map(job => job.engineCommit), commits);
    assert.deepEqual(Object.keys(result.archives).sort(), ['candidate.tar', 'cli.tar']);
    assert.equal(result.sourceSnapshot, refs);
});
