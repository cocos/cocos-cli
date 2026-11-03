const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EngineBackendRegistry, createEngineBackendRegistry, getEngineBackendAdapter, inspectEngineBackend } = require('../../adapters/engine/registry.cjs');
const { readPolicy, checkEngineCompatibility } = require('../engine-compatibility');
const { diagnose } = require('../engine-diagnostics');
const { setupDev } = require('../setup-dev');
const cli = path.resolve(__dirname, '../..');
const policy = readPolicy(cli);
function fixture(t, version = '4.0.0-beta.0', prepared = false) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-backend-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const engine = path.join(root, 'custom engine');
    write(path.join(root, 'package.json'), { version: '0.2.0-beta.0' });
    write(path.join(root, 'engine-compatibility.json'), policy);
    write(path.join(root, 'config.local.json'), { enginePath: engine });
    write(path.join(engine, 'package.json'), { version, main: 'must-not-run.js' });
    write(path.join(engine, 'must-not-run.js'), 'throw new Error("Discovery executed engine code");');
    if (prepared) for (const file of Object.values(policy.requiredFiles).flat()) write(path.join(engine, file), file.endsWith('.json') ? {} : 'prepared');
    return { root, selection: { path: engine, version }, engine };
}
function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}
test('registry rejects invalid protocols, duplicate IDs and incomplete adapters', () => {
    const registry = new EngineBackendRegistry();
    const adapter = require('../../adapters/engine/cocos4/index.cjs');
    assert.throws(() => registry.register({ ...adapter, protocolVersion: 2 }), { code: 'ENGINE_ADAPTER_PROTOCOL_MISMATCH' });
    assert.throws(() => registry.register({ ...adapter, runtime: null }), { code: 'ENGINE_ADAPTER_INVALID' });
    registry.register(adapter);
    assert.throws(() => registry.register(adapter), { code: 'ENGINE_ADAPTER_DUPLICATE' });
});
test('ambiguous adapters require an explicit ID and do not silently pick a winner', () => {
    const registry = createEngineBackendRegistry();
    registry.register({ ...require('../../adapters/engine/cocos4/index.cjs'), id: 'custom-4' });
    assert.throws(() => registry.resolve({ version: '4.0.0-beta.0' }), { code: 'ENGINE_ADAPTER_AMBIGUOUS' });
    assert.equal(registry.resolve({ version: '4.0.0-beta.0' }, 'custom-4').id, 'custom-4');
    assert.throws(() => registry.resolve({ version: '3.0.0' }, 'custom-4'), { code: 'ENGINE_ADAPTER_NOT_FOUND' });
});
for (let minor = 0; minor <= 8; minor++) test('recognizes 3.' + minor + '.x without enabling an unimplemented runtime', t => {
    const { selection } = fixture(t, '3.' + minor + (minor === 8 ? '.9' : '.0'));
    const report = inspectEngineBackend(selection, policy);
    assert.equal(report.id, 'cocos-3.' + minor);
    assert.equal(report.runtimeSupport, 'discovery-only');
    assert.equal(report.layout, null);
    assert.equal(report.runtimeInterfaces, 'not-tested');
    for (const capability of Object.values(report.capabilities)) assert.equal(capability.status, 'not-implemented');
    const adapter = getEngineBackendAdapter(selection);
    assert.throws(() => adapter.runtime(selection), { code: 'ENGINE_ADAPTER_NOT_IMPLEMENTED' });
    assert.throws(() => adapter.compile(selection), { code: 'ENGINE_ADAPTER_NOT_IMPLEMENTED' });
});
test('4.x runtime layout preserves the current module contract and returns independent arrays', t => {
    const { selection } = fixture(t);
    const adapter = getEngineBackendAdapter(selection);
    const layout = adapter.runtime(selection);
    assert.equal(adapter.id, 'cocos-4');
    assert.equal(layout.engineDev, path.join(selection.path, 'bin/.cache/dev-cli'));
    assert.equal(layout.editorLoader, path.join(layout.engineDev, 'editor/loader.js'));
    assert.equal(layout.engineAdapter, path.join(selection.path, 'bin/.editor/engine-adapter.js'));
    assert.equal(layout.requiredModules.length, 14);
    assert.ok(layout.requiredModules.includes('cc/editor/exotic-animation'));
    layout.requiredModules.length = 0;
    assert.equal(adapter.runtime(selection).requiredModules.length, 14);
    assert.equal(adapter.compile(selection).compilerModule, 'packages/engine-compiler/dist/index.js');
});
test('static discovery distinguishes missing web artifacts from ready editor artifacts', t => {
    const { selection } = fixture(t, '4.0.0-beta.0', true);
    let report = inspectEngineBackend(selection, policy);
    assert.equal(report.capabilities.sceneEditing.status, 'ready');
    assert.equal(report.capabilities.webPreview.status, 'ready');
    assert.equal(report.capabilities.nativeBuild.status, 'unverified');
    fs.unlinkSync(path.join(selection.path, 'bin/.cache/dev-cli/web/loader.js'));
    report = inspectEngineBackend(selection, policy);
    assert.equal(report.capabilities.sceneEditing.status, 'ready');
    assert.equal(report.capabilities.webPreview.status, 'missing');
    assert.deepEqual(report.capabilities.webPreview.missing, ['bin/.cache/dev-cli/web/loader.js']);
});
test('SDK adapter requirements cannot override an incompatible protocol or family', t => {
    const { selection, engine } = fixture(t);
    const file = path.join(engine, 'engine-sdk.json');
    write(file, { adapterProtocolVersion: 2 });
    assert.equal(inspectEngineBackend(selection).errors[0].code, 'ENGINE_ADAPTER_PROTOCOL_MISMATCH');
    assert.throws(() => checkEngineCompatibility(selection, cli), /unsupported adapter protocol/);
    write(file, { adapterId: 'cocos-3.0' });
    assert.equal(inspectEngineBackend(selection).errors[0].code, 'ENGINE_ADAPTER_NOT_FOUND');
    write(file, null);
    assert.equal(inspectEngineBackend(selection).errors[0].code, 'ENGINE_ADAPTER_INVALID');
});
test('unsupported families and invalid versions are diagnosed without fallback', t => {
    const { selection } = fixture(t);
    for (const version of ['2.4.10', '3.9.0', '5.0.0']) assert.equal(inspectEngineBackend({ ...selection, version }).errors[0].code, 'ENGINE_ADAPTER_NOT_FOUND');
    assert.equal(inspectEngineBackend({ ...selection, version: ' 4.0.0' }).errors[0].code, 'ENGINE_VERSION_INVALID');
});
test('read-only doctor reports 3.0 readiness without running code or changing local configuration', t => {
    const { root, engine } = fixture(t, '3.0.2');
    const file = path.join(root, 'config.local.json');
    const before = fs.readFileSync(file, 'utf8');
    const report = diagnose(root);
    assert.equal(report.ok, false);
    assert.equal(report.engine.version, '3.0.2');
    assert.equal(report.adapter.id, 'cocos-3.0');
    assert.equal(report.adapter.runtimeSupport, 'discovery-only');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(fs.existsSync(path.join(engine, 'bin')), false);
});
test('setup rejects an unimplemented 3.0 toolchain before launching any process', async t => {
    const { root } = fixture(t, '3.0.2');
    const calls = [];
    await assert.rejects(setupDev({ root, run: async (...args) => calls.push(args) }), /discovery only/);
    assert.equal(calls.length, 0);
});
test('editing the version policy cannot bypass the adapter runtime boundary', t => {
    const { root, selection } = fixture(t, '3.0.2', true);
    write(path.join(root, 'engine-compatibility.json'), { ...policy, stable: '~3.0.0' });
    assert.throws(() => checkEngineCompatibility(selection, root, 'web'), /discovery only/);
});
