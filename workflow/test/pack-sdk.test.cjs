/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, process */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { packSdk, dependencies, REQUIRED } = require('../pack-sdk.js');
const { platformArtifacts } = require('../build-simulator');

function write(root, relative, content) {
    const filename = path.join(root, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, typeof content === 'string' ? content : JSON.stringify(content));
}
function fixture(t, kind = 'cli', version = '4.0.0') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-sdk-pack-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, 'source');
    write(source, 'package.json', { name: `test-${kind}`, version, scripts: { postinstall: 'exit 99' }, devDependencies: { unused: '*' } });
    for (const relative of REQUIRED[kind]) write(source, relative, 'prepared');
    return { kind, source, output: path.join(root, 'output') };
}

test('CLI snapshot omits engine, secrets, test outputs and source lifecycle scripts', async t => {
    const options = fixture(t);
    write(options.source, 'packages/engine/package.json', { version: '9.9.9' });
    write(options.source, 'packages/cc-module/src/private.ts', 'source');
    write(options.source, 'dist/core/test/example.js', 'test');
    write(options.source, 'config.local.json', 'private');
    write(options.source, '.npmrc', 'private');
    write(options.source, 'docs/en/guide.md', 'MCP documentation');
    write(options.source, 'docs/dev/internal.md', 'internal');
    write(options.source, 'docs/dev/environment-setup.md', 'environment guide');
    write(options.source, 'config.local.example.json', { enginePath: 'packages/engine' });
    const result = await packSdk(options);
    assert.equal(result.version, '4.0.0');
    for (const file of ['packages/engine', 'packages/cc-module/src', 'dist/core/test', 'config.local.json', '.npmrc', '.sdk-incomplete', 'docs/dev/internal.md']) assert.equal(fs.existsSync(path.join(options.output, file)), false, file);
    assert.equal(fs.readFileSync(path.join(options.output, 'docs/en/guide.md'), 'utf8'), 'MCP documentation');
    assert.equal(fs.readFileSync(path.join(options.output, 'workflow/engine-path.js'), 'utf8'), 'prepared');
    assert.equal(fs.readFileSync(path.join(options.output, 'docs/dev/environment-setup.md'), 'utf8'), 'environment guide');
    assert.equal(JSON.parse(fs.readFileSync(path.join(options.output, 'config.local.example.json'))).enginePath, 'packages/engine');
    assert.equal(JSON.parse(fs.readFileSync(path.join(options.output, 'package.json'))).scripts, undefined);
    assert.equal(fs.readFileSync(path.join(options.source, 'dist/cli.js'), 'utf8'), 'prepared');
});

test('Engine snapshot uses actual engine version and includes prepared adapters', async t => {
    const options = fixture(t, 'engine', '4.0.0-alpha.32');
    write(options.source, 'bin/.cache/dev-cli/editor/transform-cache/unused.js', 'cache');
    write(options.source, 'editor/library/required.bin', 'asset');
    write(options.source, 'bin/dev/cc-min/base.js', 'minified');
    write(options.source, 'native/external/ios-xcframework/CMakeLists.txt', 'provided by the engine external');
    const xcode = 'scripts/native-pack-tool/xcode';
    write(options.source, `${xcode}/package.json`, { name: 'xcode', version: '1.0.0', dependencies: { plist: '*' } });
    write(options.source, `${xcode}/index.js`, 'module.exports = require("plist");');
    write(options.source, `${xcode}/node_modules/plist/package.json`, { name: 'plist', version: '1.0.0' });
    write(options.source, `${xcode}/node_modules/plist/index.js`, 'module.exports = "bundled";');
    write(options.source, `${xcode}/node_modules/dev/package.json`, { name: 'dev', version: '1.0.0' });
    const result = await packSdk(options);
    const manifest = JSON.parse(fs.readFileSync(path.join(options.output, 'engine-sdk.json')));
    assert.equal(result.version, '4.0.0-alpha.32');
    assert.equal(manifest.engineVersion, result.version);
    assert.equal(fs.existsSync(path.join(options.output, 'editor/library/required.bin')), true);
    assert.equal(fs.existsSync(path.join(options.output, 'bin/.cache/dev-cli/editor/transform-cache')), false);
    assert.equal(fs.readFileSync(path.join(options.output, 'bin/dev/cc-min/base.js'), 'utf8'), 'minified');
    assert.equal(fs.existsSync(path.join(options.output, 'native/external/ios-xcframework/CMakeLists.txt')), true);
    assert.equal(require(path.join(options.output, xcode)), 'bundled');
    assert.equal(fs.existsSync(path.join(options.output, `${xcode}/node_modules/dev`)), false);
    for (const entry of manifest.files) {
        const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(options.output, entry.path))).digest('hex');
        assert.equal(digest, entry.sha256);
    }
});

test('Engine SDK build prepares a custom source before snapshotting and validates simulator outputs', async t => {
    const options = fixture(t, 'engine');
    const version = '4.0.0';
    const webLoader = 'bin/.cache/dev-cli/web/loader.js';
    const simulator = platformArtifacts[process.platform];
    write(options.source, 'package.json', { name: 'custom-engine', version, scripts: { 'build:min': 'stub' } });
    write(options.source, 'bin/adapter/nodejs/web-adapter.js', 'adapter');
    write(options.source, 'bin/adapter/nodejs/engine-adapter.js', 'adapter');
    write(options.source, 'native/external/CMakeLists.txt', 'prepared');
    write(options.source, 'scripts/native-pack-tool/xcode/package.json', { name: 'xcode', version: '1.0.0' });
    fs.unlinkSync(path.join(options.source, webLoader));
    const steps = [];
    const artifactInfo = { formatVersion: 1, engineVersion: version, platform: process.platform, arch: process.arch };
    const skipSimulator = process.platform === 'win32' && process.arch !== 'x64';
    const run = async (command, args, optionsForStep) => {
        if (command === 'npm') {
            assert.deepEqual(args, ['run', 'build:min']);
            assert.equal(optionsForStep.cwd, fs.realpathSync.native(options.source));
            steps.push('build:min');
            write(options.source, 'bin/dev/cc-min/base.js', 'minified');
            return;
        }
        assert.equal(command, process.execPath);
        assert.equal(optionsForStep.shell, false);
        assert.equal(args.at(-1), fs.realpathSync.native(options.source));
        const script = path.basename(args.find(arg => arg.endsWith('.js')));
        steps.push(script);
        if (script === 'compiler-engine.js') {
            write(options.source, webLoader, 'compiled');
        } else if (script === 'build-simulator-runtime.js') {
            for (const file of ['bin/native-preview/base.js', 'bin/simulator/import-map.json', 'bin/simulator/system.bundle.js', 'bin/simulator/polyfills.bundle.js']) write(options.source, file, 'runtime');
            write(options.source, 'bin/simulator/simulator-artifact.json', { ...artifactInfo, kind: 'runtime' });
        } else if (script === 'build-simulator.js') {
            write(options.source, `native/simulator/Release/${simulator.entry}`, 'executable');
            write(options.source, 'native/simulator/Release/simulator-artifact.json', { ...artifactInfo, kind: 'native' });
        }
    };
    const expected = ['compiler-engine.js', 'build:min'];
    if (simulator && !skipSimulator) expected.push('build-simulator-runtime.js', 'build-simulator.js');
    await packSdk({ ...options, build: true, skipSimulator, run });
    assert.deepEqual(steps, expected);
    assert.equal(fs.readFileSync(path.join(options.output, webLoader), 'utf8'), 'compiled');
    if (simulator && !skipSimulator) {
        assert.equal(fs.existsSync(path.join(options.output, `native/simulator/Release/${simulator.entry}`)), true);
        assert.equal(fs.existsSync(path.join(options.output, 'bin/native-preview/base.js')), true);
    }
});

test('Engine SDK build failure never creates a partial snapshot, and dry run never runs a build', async t => {
    const options = fixture(t, 'engine');
    write(options.source, 'package.json', { name: 'custom-engine', version: '4.0.0', scripts: { 'build:min': 'stub' } });
    let calls = 0;
    const buildOptions = { ...options, build: true, skipSimulator: true, run: async () => { calls++; throw new Error('compilation failed'); } };
    await packSdk({ ...buildOptions, dryRun: true });
    assert.equal(calls, 0);
    await assert.rejects(packSdk(buildOptions), /compilation failed/);
    assert.equal(calls, 1);
    assert.equal(fs.existsSync(options.output), false);
});

test('SDK metadata excludes legacy distribution without changing payload revision', async t => {
    const options = fixture(t, 'engine');
    const revisions = [];
    for (const distribution of [undefined, 'internal', 'cocos']) {
        const output = `${options.output}-${distribution ?? 'unspecified'}`;
        revisions.push((await packSdk({ ...options, output, distribution })).revision);
        const metadata = JSON.parse(fs.readFileSync(path.join(output, 'engine-sdk.json')));
        assert.equal(Object.hasOwn(metadata, 'distribution'), false);
    }
    assert.equal(new Set(revisions).size, 1);
});

test('production closure includes transitive dependencies, omits unused installs and tolerates absent optional packages', async t => {
    const options = fixture(t);
    write(options.source, 'package.json', { name: 'root', version: '1.0.0', dependencies: { a: '^1.0.0' }, optionalDependencies: { absent: '*' }, devDependencies: { dev: '*' } });
    write(options.source, 'node_modules/a/package.json', { name: 'a', version: '1.0.0', dependencies: { b: '*' } });
    write(options.source, 'node_modules/a/node_modules/b/package.json', { name: 'b', version: '2.0.0', dependencies: { a: '*' } });
    write(options.source, 'node_modules/dev/package.json', { name: 'dev', version: '1.0.0' });
    await packSdk(options);
    assert.equal(fs.existsSync(path.join(options.output, 'node_modules/a/node_modules/b/package.json')), true);
    assert.equal(fs.existsSync(path.join(options.output, 'node_modules/dev')), false);
});

test('workspace dependency and its nested dependencies become portable physical directories', async t => {
    const options = fixture(t);
    write(options.source, 'package.json', { name: 'root', version: '1.0.0', dependencies: { workspace: '*' } });
    const workspace = path.join(options.source, 'packages/workspace');
    write(workspace, 'package.json', { name: 'workspace', version: '1.0.0', dependencies: { child: '*' } });
    write(workspace, 'node_modules/child/package.json', { name: 'child', version: '1.0.0' });
    fs.mkdirSync(path.join(options.source, 'node_modules'));
    fs.symlinkSync(workspace, path.join(options.source, 'node_modules/workspace'), process.platform === 'win32' ? 'junction' : 'dir');
    await packSdk(options);
    assert.equal(fs.lstatSync(path.join(options.output, 'node_modules/workspace')).isSymbolicLink(), false);
    assert.equal(fs.existsSync(path.join(options.output, 'node_modules/workspace/node_modules/child/package.json')), true);
});

test('missing required runtime dependency fails before creating output', async t => {
    const options = fixture(t);
    write(options.source, 'package.json', { name: 'root', version: '1.0.0', dependencies: { missing: '*' } });
    await assert.rejects(packSdk(options), /Missing runtime dependency/);
    assert.equal(fs.existsSync(options.output), false);
});

test('dependency version discrepancies are recorded, not hidden', t => {
    const options = fixture(t);
    write(options.source, 'node_modules/a/package.json', { name: 'a', version: '2.0.0' });
    const result = dependencies(options.source, { name: 'root', dependencies: { a: '^1.0.0' } });
    assert.equal(result.warnings.length, 1);
});

test('scoped dependency names may contain dots', t => {
    const options = fixture(t);
    write(options.source, 'node_modules/@socket.io/component-emitter/package.json', { name: '@socket.io/component-emitter', version: '3.1.0' });
    const graph = dependencies(options.source, { name: 'root', dependencies: { '@socket.io/component-emitter': '^3.1.0' } });
    assert.equal(graph.nodes.length, 1);
});

test('dry run writes no output', async t => {
    const options = fixture(t);
    const result = await packSdk({ ...options, dryRun: true });
    assert.ok(result.files > 0);
    assert.equal(fs.existsSync(options.output), false);
});

test('missing build input and invalid version fail early', async t => {
    const options = fixture(t);
    fs.unlinkSync(path.join(options.source, 'dist/cli.js'));
    await assert.rejects(packSdk(options), /Missing cli SDK build input/);
    write(options.source, 'package.json', { version: '../unsafe' });
    await assert.rejects(packSdk(options), /Invalid cli version/);
});

test('existing output is never overwritten', async t => {
    const options = fixture(t);
    write(options.output, 'keep.txt', 'keep');
    await assert.rejects(packSdk(options), /EEXIST/);
    assert.equal(fs.readFileSync(path.join(options.output, 'keep.txt'), 'utf8'), 'keep');
});

test('output cannot overwrite source or be nested in input directories', async t => {
    const options = fixture(t);
    await assert.rejects(packSdk({ ...options, output: options.source }), /ancestor/);
    await assert.rejects(packSdk({ ...options, output: path.join(options.source, 'static/output') }), /input directory/);
});

test('payload links outside the SDK source are rejected', async t => {
    const options = fixture(t);
    const outside = path.join(path.dirname(options.source), 'outside');
    write(outside, 'private.txt', 'not SDK content');
    fs.mkdirSync(path.join(options.source, 'static'));
    fs.symlinkSync(outside, path.join(options.source, 'static/external'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(packSdk(options), /link escapes source/);
    assert.equal(fs.existsSync(options.output), false);
});

test('identical payload has deterministic revision, changed bytes have a different revision', async t => {
    const options = fixture(t);
    const first = await packSdk(options);
    const second = await packSdk({ ...options, output: `${options.output}-2` });
    assert.equal(first.revision, second.revision);
    write(options.source, 'dist/cli.js', 'changed');
    const third = await packSdk({ ...options, output: `${options.output}-3` });
    assert.notEqual(first.revision, third.revision);
});

test('dependency scanning and output checks normalize aliased source roots', async t => {
    const options = fixture(t);
    const pkg = { name: 'test-cli', version: '4.0.0', dependencies: { a: '^1.0.0' } };
    write(options.source, 'package.json', pkg);
    write(options.source, 'node_modules/a/package.json', { name: 'a', version: '1.0.0' });
    const alias = path.join(path.dirname(options.source), 'source-alias');
    fs.symlinkSync(options.source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(dependencies(alias, pkg).nodes.length, 1);
    await assert.rejects(packSdk({ ...options, source: alias, output: path.join(alias, 'dist/packed') }), /inside an SDK input/);
    await packSdk({ ...options, source: alias });
    assert.equal(fs.existsSync(path.join(options.output, 'node_modules/a/package.json')), true);
});
