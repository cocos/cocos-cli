/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { readPolicy, matchEngineVersion, checkEngineCompatibility, assertRuntimeInterfaces, queryOptionalSortingLayers } = require('../engine-compatibility');
const { resolveEngineSelection } = require('../engine-path');
const root = path.resolve(__dirname, '../..');
const policy = readPolicy(root);

function loaderFixture(loaderModule) {
    const ts = require('typescript');
    const vm = require('node:vm');
    const hooks = { _load() {}, _resolveFilename() {} };
    const original = { ...hooks };
    const exports = {};
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'packages/cc-module/src/loader.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, { exports, require(id) {
        if (id === 'path') return path;
        if (id === 'module') return hooks;
        if (id === path.resolve('test-engine/editor/loader')) return loaderModule;
        throw new Error(`Unexpected dependency: ${id}`);
    } });
    return { EngineLoader: exports.EngineLoader, hooks, original };
}

test('loader rejects missing import interface before installing module hooks', async () => {
    const { EngineLoader, hooks, original } = loaderFixture({ default: {} });
    await assert.rejects(EngineLoader.init('test-engine', ['cc']), /must export default.import/);
    assert.deepEqual(hooks, original);
});

test('required module failures and empty exports stop initialization before installing hooks', async () => {
    for (const imported of [async () => { throw new Error('missing module'); }, async () => undefined]) {
        const { EngineLoader, hooks, original } = loaderFixture({ default: { import: imported } });
        await assert.rejects(EngineLoader.init('test-engine', ['cc']), /Failed to load required engine module cc/);
        assert.deepEqual(hooks, original);
    }
});

test('malformed prerelease policy is rejected explicitly', t => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-policy-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    for (const rule of [null, { core: '4.1.0', min: 0, experimental: true }]) {
        fs.writeFileSync(path.join(temp, 'engine-compatibility.json'), JSON.stringify({ ...policy, prereleases: [rule] }));
        assert.throws(() => readPolicy(temp), /Invalid prerelease rule/);
    }
});

for (const version of ['4.0.0', '4.0.1', '4.0.999', '4.0.2+team.3', '4.0.0-alpha.32', '4.0.0-alpha.999', '4.1.0-alpha.0', '4.1.0-alpha.7+team.2']) {
    test(`accept declared engine ${version}`, () => assert.equal(matchEngineVersion(version, policy).supported, true));
}
for (const version of ['3.8.8', '4.1.0', '5.0.0', '4.0.0-alpha.31', '4.0.0-alpha', '4.1.0-alpha', '4.1.0-alpha.1.extra', '4.1.0-alpha.foo', '4.1.0-alpha.01', '4.1.0-beta.1', '4.1.0-rc.1', '4.1.1-alpha.1', '4.2.0-alpha.1', 'v4.0.0', '4.0', ' 4.0.0', '', undefined]) {
    test(`reject undeclared or invalid engine ${String(version)}`, () => assert.equal(matchEngineVersion(version, policy).supported, false));
}
test('only the declared successor is experimental and prerelease ceilings are respected', () => {
    assert.equal(matchEngineVersion('4.1.0-alpha.1', policy).experimental, true);
    assert.equal(matchEngineVersion('4.0.0', policy).experimental, false);
    const bounded = { ...policy, prereleases: [{ core: '4.1.0', tag: 'alpha', min: 2, max: 3, experimental: true }] };
    assert.equal(matchEngineVersion('4.1.0-alpha.3', bounded).supported, true);
    assert.equal(matchEngineVersion('4.1.0-alpha.4', bounded).supported, false);
});

function fixture(t) {
    const engine = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-compatibility-'));
    t.after(() => fs.rmSync(engine, { recursive: true, force: true }));
    for (const file of [...new Set(Object.values(policy.requiredFiles).flat())]) {
        const target = path.join(engine, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.endsWith('.json') ? '{}' : 'prepared');
    }
    fs.writeFileSync(path.join(engine, 'package.json'), JSON.stringify({ version: '4.0.0' }));
    return { path: engine, version: '4.0.0' };
}

test('source preparation does not require compiled runtime outputs or native tools', t => {
    const selected = fixture(t);
    fs.unlinkSync(path.join(selected.path, policy.requiredFiles.runtime[0]));
    assert.equal(checkEngineCompatibility(selected, root, 'source').supported, true);
    assert.throws(() => checkEngineCompatibility(selected, root, 'runtime'), /Missing required runtime file/);
});
test('each required file is checked and errors identify version, path and support range', t => {
    const selected = fixture(t);
    for (const file of Object.values(policy.requiredFiles).flat()) {
        const target = path.join(selected.path, file);
        const content = fs.readFileSync(target);
        fs.unlinkSync(target);
        assert.throws(() => checkEngineCompatibility(selected, root, 'web'), error => error.message.includes(file) && error.message.includes('4.0.0') && error.message.includes(selected.path) && error.message.includes('Supported: ~4.0.0'));
        fs.writeFileSync(target, content);
    }
});
test('invalid required JSON is rejected before loading engine code', t => {
    const selected = fixture(t);
    fs.writeFileSync(path.join(selected.path, 'cc.config.json'), 'broken');
    assert.throws(() => checkEngineCompatibility(selected, root), /Invalid required configuration/);
});
test('custom engine metadata cannot bypass compatibility or claim malformed identity', t => {
    const selected = fixture(t);
    const metadata = path.join(selected.path, 'engine-sdk.json');
    for (const value of [null, {}, { schemaVersion: 1, revision: 1 }]) {
        fs.writeFileSync(metadata, JSON.stringify(value));
        assert.throws(() => resolveEngineSelection(root, { explicitPath: selected.path }), /Invalid engine-sdk.json/);
    }
    fs.writeFileSync(path.join(selected.path, 'package.json'), JSON.stringify({ version: '5.0.0' }));
    fs.writeFileSync(metadata, JSON.stringify({ schemaVersion: 1, engineVersion: '5.0.0', revision: 'custom-1' }));
    assert.throws(() => checkEngineCompatibility(resolveEngineSelection(root, { explicitPath: selected.path }), root), /Outside stable range/);
});
test('legacy distribution is ignored without changing pinned identity', t => {
    const selected = fixture(t);
    for (const distribution of [undefined, 'internal', 'cocos', null, 123]) {
        fs.writeFileSync(path.join(selected.path, 'engine-sdk.json'), JSON.stringify({ schemaVersion: 1, engineVersion: selected.version, revision: 'same-payload', distribution }));
        const actual = resolveEngineSelection(root, { explicitPath: selected.path, projectConfig: { version: selected.version, revision: 'same-payload' } });
        assert.equal(Object.hasOwn(actual, 'distribution'), false);
        assert.doesNotThrow(() => checkEngineCompatibility(actual, root));
    }
});

test('missing runtime interfaces fail even when the declared version is supported', t => {
    const selected = fixture(t);
    const engine = { game: { init() {} }, physics: { selector: { switchTo() {} } }, Node() {}, Component() {}, Layers: { Enum: {} } };
    assert.doesNotThrow(() => assertRuntimeInterfaces(engine, selected, root));
    engine.game.init = undefined;
    assert.throws(() => assertRuntimeInterfaces(engine, selected, root), /cc.game.init/);
});
test('optional sorting-layer support is detected from the actual module', () => {
    assert.deepEqual(queryOptionalSortingLayers({}), []);
    assert.deepEqual(queryOptionalSortingLayers({ SortingLayers: {} }), []);
    const layers = [{ id: 0, name: 'Default' }];
    assert.equal(queryOptionalSortingLayers({ SortingLayers: { value: layers, getBuiltinLayers() { return this.value; } } }), layers);
});
