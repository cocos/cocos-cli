/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process, __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { selectRefs } = require('../sdk-engine-sources');
const { readPolicy } = require('../engine-compatibility');
const { selectEngines, validateCatalog, describeArtifact, materialize, runMatrix, executePair, safeFile } = require('../sdk-matrix');
const { packSdk, REQUIRED } = require('../pack-sdk');
const { runCiTests } = require('../sdk-ci-tests');
const root = path.resolve(__dirname, '../..');
const policy = readPolicy(root);
const hash = 'a'.repeat(64);
test('full CI gate keeps unit failure, still runs E2E, and binds copied tests to the selected SDK', async t => {
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
    write(path.join(source, 'node_modules/tsx/dist/cli.mjs'), '');
    write(path.join(source, 'node_modules/jest/bin/jest.js'), `const fs=require('fs');const args=process.argv;const unit=args.includes('jest.config.ts');fs.writeFileSync(args[args.indexOf('--outputFile')+1], JSON.stringify({success:!unit,numTotalTests:1,numPassedTests:unit?0:1,numFailedTests:unit?1:0,numFailedTestSuites:unit?1:0}));process.exitCode=unit?1:0;`);
    const result = await runCiTests(config, source, 5000);
    assert.equal(result.status, 'failed', result.error);
    assert.equal(result.suites.unit.status, 'failed');
    assert.equal(result.suites.e2e.status, 'passed');
    assert.equal(fs.readFileSync(path.join(config.work, 'tests/.vscodeignore'), 'utf8'), 'packages/asset-db/test');
    assert.equal(fs.realpathSync(path.join(config.work, 'tests/packages/engine')), fs.realpathSync(config.engine));
    assert.equal(JSON.parse(fs.readFileSync(path.join(config.work, 'tests/config.local.json'))).enginePath, config.engine);
    assert.match(fs.readFileSync(path.join(source, 'dist/core/base/sentry.js'), 'utf8'), /https:/);
});
const platform = { platform: process.platform, arch: process.arch, nodeAbi: process.versions.modules };
const entry = (version, extras = {}) => ({ version, revision: `sha256:${hash}`, manifestSha256: hash, ...platform, location: '.', ...extras });
const catalog = engines => ({ schemaVersion: 1, coverage: 'published', snapshotId: 'test', engines, clis: [] });
function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk matrix '));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); }
test('matrix includes every supported version and revision, excludes undeclared prereleases', () => {
    const all = catalog([entry('4.0.0'), entry('4.0.1'), entry('4.0.17'), entry('4.0.1', { revision: 'sha256:' + 'b'.repeat(64) }), entry('4.1.0-alpha.2'), entry('4.1.0-beta.1'), entry('5.0.0')]);
    validateCatalog(all);
    assert.equal(selectEngines(all, policy).length, 5);
});
test('empty selection, missing platform versions and duplicate identities fail closed', () => {
    assert.throws(() => selectEngines(catalog([entry('5.0.0')]), policy), /Empty matrix/);
    assert.throws(() => selectEngines(catalog([entry('4.0.0'), entry('4.0.1', { arch: 'other' })]), policy), /Missing Engine SDK/);
    assert.throws(() => validateCatalog(catalog([entry('4.0.0'), entry('4.0.0')])), /Duplicate/);
    assert.throws(() => validateCatalog(catalog([])), /empty/);
});
test('tag selection handles all patches, annotated tags and exact prerelease rules', () => {
    const commit = 'a'.repeat(40), peeled = 'b'.repeat(40);
    const refs = ['4.0.0', 'v4.0.1', '4.0.9', '4.1.0-alpha.1', '4.1.0-beta.1', '4.0.0-alpha.31'].map(tag => `${commit}\trefs/tags/${tag}`);
    refs.push(`${peeled}\trefs/tags/v4.0.1^{}`);
    const selected = selectRefs(refs.join('\n'), [policy], { baseline: { ref: 'refs/heads/v4.0.0', untilStableTag: '4.0.0' } });
    assert.equal(selected.length, 4);
    assert.equal(selected.find(ref => ref.version === '4.0.1').commit, peeled);
    assert.equal(selected.some(ref => ref.baseline), false);
});
test('temporary branch baseline is pinned until a stable tag exists; missing ref fails', () => {
    const commit = 'a'.repeat(40);
    const config = { baseline: { ref: 'refs/heads/v4.0.0', untilStableTag: '4.0.0' } };
    assert.deepEqual(selectRefs(`${commit}\trefs/heads/v4.0.0`, [policy], config), [{ ref: 'refs/heads/v4.0.0', commit, baseline: true }]);
    assert.throws(() => selectRefs(`${commit}\trefs/heads/main`, [policy], config), /Missing baseline/);
});
test('validation mode selects only the requested supported tag and never falls back', () => {
    const commit = 'a'.repeat(40);
    const refs = ['4.0.0-alpha.32', '4.0.0-alpha.33', '4.1.0-beta.1'].map(tag => `${commit}\trefs/tags/${tag}`).join('\n');
    assert.equal(selectRefs(refs, [policy], {}, '4.0.0-alpha.33').length, 1);
    assert.equal(selectRefs(refs, [policy], {}, '4.0.0-alpha.33')[0].tag, '4.0.0-alpha.33');
    assert.throws(() => selectRefs(refs, [policy], {}, '4.0.0'), /existing, supported/);
    assert.throws(() => selectRefs(refs, [policy], {}, '4.1.0-beta.1'), /existing, supported/);
});
test('artifact paths and credential-bearing URLs are rejected', () => {
    for (const file of ['../outside', '/outside', 'C:/outside', 'a\\b', 'a//b', 'a/./b']) assert.throws(() => safeFile(file), /Unsafe/);
    for (const location of ['http://example.com/sdk', 'https://user:secret@example.com/sdk', 'https://example.com/sdk?token=secret']) assert.throws(() => validateCatalog(catalog([entry('4.0.0', { location })])), /HTTPS/);
});
test('materialized SDK validates hashes, isolates files, and repairs corrupt cache from verified source', async t => {
    const dir = fixture(t), source = path.join(dir, 'source'), artifact = path.join(dir, 'artifact');
    write(path.join(source, 'package.json'), { version: '4.0.0', name: 'engine' });
    for (const file of REQUIRED.engine) write(path.join(source, file), 'prepared');
    write(path.join(source, 'bin/simulator/import-map.json'), { imports: {} });
    await packSdk({ kind: 'engine', source, output: artifact });
    const descriptor = await describeArtifact(artifact, 'engine');
    assert.equal(fs.existsSync(path.join(artifact, 'bin/simulator/import-map.json')), true);
    const cache = path.join(dir, 'cache');
    await materialize(descriptor, 'engine', cache, path.join(dir, 'first'));
    const stored = path.join(cache, 'engine', platform.platform, platform.arch, platform.nodeAbi, descriptor.revision.slice(7), 'package.json');
    fs.writeFileSync(stored, 'corrupt');
    await materialize(descriptor, 'engine', cache, path.join(dir, 'second'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'second/package.json'))).version, '4.0.0');
    fs.writeFileSync(path.join(dir, 'first/package.json'), 'changed pair');
    assert.equal(JSON.parse(fs.readFileSync(stored)).version, '4.0.0');
    fs.writeFileSync(stored, 'corrupt');
    fs.writeFileSync(path.join(artifact, 'package.json'), 'corrupt source');
    await assert.rejects(materialize(descriptor, 'engine', cache, path.join(dir, 'bad')), /SHA256 mismatch/);
    await assert.rejects(materialize({ ...descriptor, manifestSha256: crypto.randomBytes(32).toString('hex') }, 'engine', cache, path.join(dir, 'wrong')), /manifest SHA256/);
});
test('failed acquisition saves report and local sample cannot satisfy release gate', async t => {
    const dir = fixture(t), index = path.join(dir, 'catalog.json');
    const value = catalog([entry('4.0.0')]); value.coverage = 'local'; write(index, value);
    const result = await runMatrix({ catalog: index, output: path.join(dir, 'run'), cache: path.join(dir, 'cache'), requirePublished: true });
    assert.equal(result.status, 'failed');
    assert.match(result.errors[0], /published catalog/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'run/report.json'))).status, 'failed');
    assert.ok(fs.existsSync(path.join(dir, 'run/catalog.snapshot.json')));
    await assert.rejects(runMatrix({ catalog: index, output: path.join(dir, 'run'), cache: path.join(dir, 'cache') }), /EEXIST/);
});

test('pair timeout terminates an unresponsive SDK process', async t => {
    const dir = fixture(t);
    const config = { work: dir, cli: path.join(dir, 'cli'), engine: path.join(dir, 'engine'), project: path.join(dir, 'project'), result: path.join(dir, 'result.json') };
    fs.mkdirSync(config.project);
    write(path.join(config.engine, 'engine-sdk.json'), { engineVersion: '4.0.0', revision: `sha256:${hash}` });
    write(path.join(config.cli, 'cli-sdk.json'), { cliVersion: '1.0.0', revision: `sha256:${hash}` });
    write(path.join(config.cli, 'dist/core/base/sentry.js'), 'exports.initSentry = () => {};');
    write(path.join(config.cli, 'workflow/engine-diagnostics.js'), 'exports.diagnose = () => ({ok:true});');
    write(path.join(config.cli, 'dist/core/launcher.js'), 'exports.default = class { async import() { await new Promise(() => setInterval(() => {}, 1000)); } };');
    const file = path.join(dir, 'pair.json'); write(file, config);
    const result = await executePair(file, path.join(dir, 'build.log'), 1500);
    assert.equal(result.status, 'timeout');
});

test('SDK module resolution outside the isolated pair fails instead of using source checkout', async t => {
    const dir = fixture(t);
    const config = { work: dir, cli: path.join(dir, 'cli'), engine: path.join(dir, 'engine'), project: path.join(dir, 'project'), result: path.join(dir, 'result.json') };
    fs.mkdirSync(config.project);
    write(path.join(config.engine, 'engine-sdk.json'), { engineVersion: '4.0.0', revision: `sha256:${hash}` });
    write(path.join(config.cli, 'cli-sdk.json'), { cliVersion: '1.0.0', revision: `sha256:${hash}` });
    write(path.join(dir, 'outside.js'), 'module.exports = {};');
    write(path.join(config.cli, 'dist/core/base/sentry.js'), `require(${JSON.stringify(path.join(dir, 'outside.js'))});`);
    const file = path.join(dir, 'pair.json'); write(file, config);
    const log = path.join(dir, 'build.log');
    const result = await executePair(file, log, 5000);
    assert.equal(result.status, 'failed');
    assert.match(fs.readFileSync(log, 'utf8'), /outside this pair/);
});

test('CI shards cover every target/engine and reject missing, duplicate, failed or changed results', () => {
    const { plan, aggregate } = require('../sdk-ci-shards');
    const manifest = { target: { id: 'target-0', runner: 'windows-2022', node: '22.17.0' }, cli: { revision: 'cli-a' }, engines: [{ revision: 'engine-a' }, { revision: 'engine-b' }] };
    const matrix = plan([manifest, { ...manifest, target: { ...manifest.target, id: 'target-1', runner: 'macos-latest' } }]);
    assert.equal(matrix.include.length, 4);
    const results = matrix.include.map(job => ({ ...job, status: 'passed' }));
    assert.deepEqual(aggregate(matrix, results), { status: 'passed', count: 4 });
    assert.throws(() => aggregate(matrix, results.slice(1)), /Missing/);
    assert.throws(() => aggregate(matrix, [...results, results[0]]), /duplicate/);
    assert.throws(() => aggregate(matrix, results.map((result, i) => i ? result : { ...result, status: 'failed' })), /failed/);
    assert.throws(() => aggregate(matrix, results.map((result, i) => i ? result : { ...result, engineRevision: 'changed' })), /identity/);
    assert.throws(() => plan([manifest, manifest]), /duplicate/);
    assert.throws(() => plan([]), /1..256/);
});

test('CI archives relocate workspace links and preserve hidden files without embedding the development engine', async t => {
    const { archive, extract } = require('../sdk-ci-shards');
    const dir = fixture(t);
    const source = path.join(dir, 'source');
    fs.mkdirSync(path.join(source, 'packages/engine'), { recursive: true });
    fs.mkdirSync(path.join(source, 'packages/tool'), { recursive: true });
    fs.mkdirSync(path.join(source, 'node_modules'), { recursive: true });
    write(path.join(source, 'packages/engine/unwanted'), 'engine');
    write(path.join(source, 'packages/tool/.hidden'), 'tool');
    const metadata = Buffer.alloc(42);
    metadata.writeUInt32BE(0x00051607, 0);
    metadata.writeUInt32BE(0x00020000, 4);
    metadata.writeUInt16BE(1, 24);
    metadata.writeUInt32BE(2, 26);
    metadata.writeUInt32BE(38, 30);
    metadata.writeUInt32BE(4, 34);
    fs.writeFileSync(path.join(source, 'packages/tool/._.hidden'), metadata);
    write(path.join(source, '@types/runtime.d.ts'), 'export {};');
    fs.symlinkSync(path.join(source, 'packages/tool'), path.join(source, 'node_modules/tool'), process.platform === 'win32' ? 'junction' : 'dir');
    const tar = path.join(dir, 'source.tar');
    archive(source, tar, ['packages', '@types', 'node_modules']);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(tar)).digest('hex');
    const destination = path.join(dir, 'restored');
    await extract(dir, 'source.tar', destination, hash);
    assert.equal(fs.existsSync(path.join(destination, 'packages/engine')), false);
    assert.equal(fs.readFileSync(path.join(destination, '@types/runtime.d.ts'), 'utf8'), 'export {};');
    assert.equal(fs.readFileSync(path.join(destination, 'node_modules/tool/.hidden'), 'utf8'), 'tool');
    assert.equal(fs.lstatSync(path.join(destination, 'node_modules/tool')).isSymbolicLink(), false);
    assert.deepEqual(fs.readFileSync(path.join(destination, 'packages/tool/._.hidden')), metadata);
    assert.deepEqual(fs.readFileSync(path.join(destination, 'node_modules/tool/._.hidden')), metadata);
    await assert.rejects(extract(dir, 'source.tar', path.join(dir, 'bad'), 'wrong'), /digest/);
});

test('prepare-only retains the complete frozen source catalog without starting tests', async t => {
    const { prepareSources } = require('../sdk-engine-sources');
    const dir = fixture(t);
    const cli = path.join(dir, 'cli');
    write(path.join(cli, 'engine-compatibility.json'), policy);
    write(path.join(cli, 'cli-sdk.json'), { cliVersion: '1.0.0', revision: 'sha256:' + hash, ...platform });
    const descriptor = await describeArtifact(cli, 'cli');
    const output = path.join(dir, 'sources');
    const commit = 'a'.repeat(40);
    write(path.join(output, 'git-refs.snapshot.txt'), `${commit}\trefs/tags/4.0.0\n`);
    write(path.join(output, 'source-report.json'), { repository: 'https://github.com/cocos/cocos4.git', cli: descriptor, refs: [{ ref: 'refs/tags/4.0.0', commit, status: 'passed', sdk: entry('4.0.0') }], errors: [] });
    const report = await prepareSources({ cli, output, resume: true, prepareOnly: true });
    assert.equal(report.status, 'prepared', report.errors.join('\n'));
    assert.equal(report.sourceStatus, 'passed');
    assert.equal(fs.existsSync(path.join(output, 'matrix')), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'catalog.json'))).engines.length, 1);
});

test('platform pipelines start independently and publication requires all results', () => {
    const yaml = require('js-yaml');
    const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/sdk-tag-matrix.yml'), 'utf8'));
    const target = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/sdk-target-tests.yml'), 'utf8'));
    assert.equal(workflow.jobs.test.uses, './.github/workflows/sdk-target-tests.yml');
    assert.equal(workflow.jobs.test.needs, 'targets');
    assert.equal(target.jobs.build.needs, undefined);
    assert.equal(target.jobs.plan.needs, 'build');
    assert.equal(target.jobs.verify.needs, 'plan');
    assert.equal(workflow.jobs.test.strategy['max-parallel'] * target.jobs.verify.strategy['max-parallel'], 4);
    assert.equal(workflow.jobs.test.strategy['fail-fast'], false);
    assert.equal(target.jobs.verify.strategy['fail-fast'], false);
    assert.equal(workflow.jobs.gate.if, 'always()');
    assert.deepEqual(workflow.jobs.gate.needs, ['targets', 'test']);
    assert(workflow.jobs.gate.steps.some(step => step.run?.includes('plan plans matrix.json')));
    assert(workflow.jobs.gate.steps.some(step => step.run?.includes('aggregate matrix.json results')));
    assert(workflow.jobs.verified.needs.includes('gate'));
    assert(target.jobs.build.steps.some(step => step.run?.includes('--prepare-only')));
    assert(target.jobs.plan.steps.some(step => step.with?.name?.startsWith('sdk-plan-')));
    assert(workflow.jobs.verified.steps.every(step => !step.run));
});
