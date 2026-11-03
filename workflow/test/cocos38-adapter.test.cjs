const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getEngineBackendAdapter, inspectEngineBackend } = require('../../adapters/engine/registry.cjs');
const { checkEngineCompatibility } = require('../engine-compatibility');
const { identity, CACHE_VERSION, featuresFor } = require('../../adapters/engine/cocos38/compiler.cjs');
const { packSdk } = require('../pack-sdk');
const cli = path.resolve(__dirname, '../..');
const write = (root, file, data) => { const dest = path.join(root, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, typeof data === 'string' ? data : JSON.stringify(data)); };
function fixture(t, prepared = false) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos38-adapter-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    write(root, 'package.json', { name: 'cocos-creator', version: '3.8.8' });
    write(root, 'cc.config.json', {}); write(root, 'editor/engine-features/render-config.json', { features: {} });
    write(root, 'cocos/core/platform/macro.ts', '');
    if (prepared) for (const target of ['editor', 'web']) {
        write(root, 'bin/.cache/dev-cli-3.8/' + target + '/loader.js', 'prepared');
        write(root, 'bin/.cache/dev-cli-3.8/' + target + '/backend.json', { adapter: 'cocos-3.8-runtime', cacheVersion: CACHE_VERSION, ...identity(root) });
        for (const file of ['cc.d.ts', 'cc.editor.d.ts']) write(root, 'bin/.declarations/' + file, 'prepared');
    }
    return { root, selection: { path: root, version: '3.8.8' } };
}
function optIn(t, value = '1') {
    const before = process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS;
    process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS = value;
    t.after(() => { if (before === undefined) delete process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS; else process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS = before; });
}
test('stable 3.8.0 through 3.8.8 select the shared experimental runtime', t => {
    const { selection } = fixture(t);
    assert.equal(getEngineBackendAdapter(selection).id, 'cocos-3.8-runtime');
    assert.equal(getEngineBackendAdapter(selection).runtimeSupport, 'experimental');
    for (let patch = 0; patch <= 8; patch++) assert.equal(getEngineBackendAdapter({ ...selection, version: '3.8.' + patch }).id, 'cocos-3.8-runtime');
    for (const version of ['3.8.9', '3.8.7-beta0', '3.8.8+unverified']) {
        assert.equal(getEngineBackendAdapter({ ...selection, version }).runtimeSupport, 'discovery-only');
    }
});
test('the 3.8 runtime remains disabled without explicit opt-in', t => {
    optIn(t, ''); const { selection } = fixture(t, true);
    assert.throws(() => checkEngineCompatibility(selection, cli, 'web'), /Outside stable range/);
});
test('experimental source and runtime validation use the selected backend contract', t => {
    optIn(t); const { selection } = fixture(t, true);
    assert.equal(checkEngineCompatibility(selection, cli, 'source').experimental, true);
    assert.equal(checkEngineCompatibility(selection, cli, 'runtime').experimental, true);
    assert.equal(checkEngineCompatibility(selection, cli, 'web').experimental, true);
    const layout = getEngineBackendAdapter(selection).runtime(selection);
    assert.equal(layout.engineAdapter, null);
    assert.match(layout.webAdapter, /cocos38[\\/]host\.cjs$/);
    assert.equal(layout.engineDev, path.join(selection.path, 'bin/.cache/dev-cli-3.8'));
});
test('the opt-in cannot activate an unimplemented 3.x adapter or an unsupported family', t => {
    optIn(t); const { selection } = fixture(t);
    for (const version of ['3.0.2', '3.1.0', '3.8.9', '5.0.0']) assert.throws(() => checkEngineCompatibility({ ...selection, version }, cli), /Outside stable range/);
});
test('old Creator and 4.x caches do not satisfy the 3.8 runtime', t => {
    optIn(t); const { root, selection } = fixture(t);
    for (const cache of ['dev', 'dev-cli']) write(root, 'bin/.cache/' + cache + '/editor/loader.js', 'old');
    assert.throws(() => checkEngineCompatibility(selection, cli, 'runtime'), /dev-cli-3.8/);
});
test('changed source configuration invalidates both prepared targets', t => {
    optIn(t); const { root, selection } = fixture(t, true);
    write(root, 'cc.config.json', { custom: true });
    assert.throws(() => checkEngineCompatibility(selection, cli, 'web'), /Stale or incompatible/);
    assert.equal(inspectEngineBackend(selection).capabilities.sceneEditing.status, 'missing');
});
test('runtime version mismatches are rejected even if the interfaces exist', t => {
    const { selection } = fixture(t);
    const engine = { VERSION: '3.8.8', game: { init() {} }, physics: { selector: { switchTo() {} } }, Node() {}, Component() {}, deserialize() {}, Layers: { Enum: {} } };
    const adapter = getEngineBackendAdapter(selection);
    assert.doesNotThrow(() => adapter.validateRuntime(engine, selection));
    assert.throws(() => adapter.validateRuntime({ ...engine, VERSION: '3.8.9' }, selection), /does not match/);
    assert.throws(() => adapter.validateRuntime({ ...engine, deserialize: null }, selection), /cc.deserialize/);
});
test('unverified preview and native capabilities are not advertised as ready', t => {
    const { selection } = fixture(t, true);
    const report = inspectEngineBackend(selection);
    assert.equal(report.capabilities.sceneEditing.status, 'ready');
    assert.equal(report.capabilities.webPreview.status, 'unverified');
    assert.equal(report.capabilities.nativeBuild.status, 'not-implemented');
});
test('legacy HTML5 compilation selects available features without injecting 4.x Spine', () => {
    const query = { getFeatures: () => ['base', 'spine-3.8', 'spine-4.2', 'native-only', 'fallback'], constantManager: { genCCEnvConstants: () => ({ HTML5: true, NATIVE: false }) } };
    const result = featuresFor(query, { features: { 'native-only': { envCondition: '$NATIVE', fallback: 'fallback' }, base: { envCondition: '$HTML5' } } });
    assert.deepEqual(result, ['base', 'spine-3.8', 'fallback']);
    assert.deepEqual(featuresFor({ ...query, getFeatures: () => ['base'] }, { features: {} }), ['base']);
});
test('3.8 Engine SDK packaging includes only its selected cache and supports relocation', async t => {
    const { root, selection } = fixture(t, true);
    write(root, 'bin/.cache/dev-cli/editor/loader.js', 'wrong engine');
    write(root, 'bin/.editor/engine-adapter.js', 'wrong host');
    write(root, 'bin/.cache/dev-cli-3.8/editor/transform-cache/stale.js', 'cache');
    const output = path.join(root, 'packed-output');
    // Output must not be inside a packaged root; root-level output is supported.
    await packSdk({ kind: 'engine', source: root, output });
    assert.equal(fs.existsSync(path.join(output, 'bin/.cache/dev-cli-3.8/editor/loader.js')), true);
    assert.equal(fs.existsSync(path.join(output, 'bin/.cache/dev-cli/editor/loader.js')), false);
    assert.equal(fs.existsSync(path.join(output, 'bin/.editor')), false);
    assert.equal(fs.existsSync(path.join(output, 'bin/.cache/dev-cli-3.8/editor/transform-cache')), false);
    optIn(t); assert.doesNotThrow(() => checkEngineCompatibility({ ...selection, path: output }, cli, 'web'));
});


test('editing same-version engine source invalidates a prepared cache', t => {
    optIn(t); const { root, selection } = fixture(t, true);
    write(root, 'cocos/core/platform/macro.ts', 'export const customFlag = true;');
    assert.throws(() => checkEngineCompatibility(selection, cli, 'runtime'), /Stale or incompatible/);
});


test('serialization aliases reuse the selected engine exports and preserve existing functions', t => {
    const { selection } = fixture(t);
    const original = () => {};
    const internal = { encodeCCONBinary: original };
    const exports = { CCON: class {}, encodeCCONBinary() {}, decodeCCONBinary() {}, BufferBuilder: class {} };
    const adapter = getEngineBackendAdapter(selection);
    adapter.configureRuntime({ cclegacy: { internal } }, id => { assert.equal(id, 'cc/editor/serialization'); return exports; });
    assert.equal(internal.encodeCCONBinary, original);
    assert.equal(internal.CCON, exports.CCON);
    assert.equal(internal.BufferBuilder, exports.BufferBuilder);
    assert.throws(() => adapter.configureRuntime({ cclegacy: { internal: {} } }, () => ({})), /Missing serialization export/);
    assert.equal(adapter.runtime(selection).requiresEditorMode, true);
});


test('legacy preparation cannot overwrite the default CLI host type bindings', async t => {
    const { root } = fixture(t);
    write(root, 'config.local.json', { enginePath: root });
    write(root, 'packages/cc-module/cc.d.ts', 'default host declarations');
    const calls = [];
    await assert.rejects(require('../setup-dev').setupDev({ root, run: async (...args) => calls.push(args) }), /CLI development host/);
    assert.deepEqual(calls, []);
    assert.equal(fs.readFileSync(path.join(root, 'packages/cc-module/cc.d.ts'), 'utf8'), 'default host declarations');
});


test('legacy compiler materializes platform entries without changing engine sources', async t => {
    const { root } = fixture(t);
    write(root, 'cc.config.json', { includes: ['cocos/**/*.ts'] });
    write(root, 'pal/system-info/web/system-info.ts', 'export const systemInfo = {};');
    write(root, 'cocos/removed.ts', 'export const old = true;');
    fs.mkdirSync(path.join(root, 'node_modules'));
    const compiler = require('../../adapters/engine/cocos38/compiler.cjs');
    const original = fs.readFileSync(path.join(root, 'cc.config.json'), 'utf8');
    const overrides = { 'pal/system-info': path.join(root, 'pal/system-info/web/system-info.ts') };
    const input = await compiler.prepareCompilerInput(root, overrides);
    assert.equal(fs.readFileSync(path.join(root, 'cc.config.json'), 'utf8'), original);
    assert.equal(JSON.parse(fs.readFileSync(path.join(input, 'cc.config.json'))).includes.includes('pal/system-info/web/system-info.ts'), true);
    assert.equal(fs.existsSync(path.join(input, 'pal/system-info/web/system-info.ts')), true);
    fs.unlinkSync(path.join(root, 'cocos/removed.ts'));
    await compiler.prepareCompilerInput(root, overrides);
    assert.equal(fs.existsSync(path.join(input, 'cocos/removed.ts')), false);
    assert.equal(fs.existsSync(path.join(root, 'node_modules')), true);
});

test('prepared loader maps cannot omit a selected platform module', t => {
    const { root } = fixture(t);
    const { validateImportMap } = require('../../adapters/engine/cocos38/compiler.cjs');
    write(root, 'import-map.json', { imports: {} });
    const overrides = { 'pal/system-info': '/source/pal/system-info.ts' };
    assert.throws(() => validateImportMap(root, overrides), /omitted platform modules.*pal\/system-info/);
    write(root, 'import-map.json', { imports: { 'pal/system-info': 'q-bundled:///system-info.js' } });
    assert.doesNotThrow(() => validateImportMap(root, overrides));
});


function serializationExports() {
    return { CCON: class {}, encodeCCONBinary() {}, decodeCCONBinary() {}, BufferBuilder: class {} };
}

test('earlier pipeline options preserve the caller input and real asset UUIDs', async t => {
    const before = globalThis.Editor;
    t.after(() => { if (before === undefined) delete globalThis.Editor; else globalThis.Editor = before; });
    globalThis.Editor = { Message: { request: async () => null } };
    const adapter = require('../../adapters/engine/cocos38/index.cjs');
    for (const version of ['3.8.0', '3.8.1', '3.8.2', '3.8.3', '3.8.4', '3.8.7']) {
        const engine = { VERSION: version, cclegacy: { internal: {} }, game: { init(options) { return options; } } };
        adapter.configureRuntime(engine, serializationExports);
        const options = { overrideSettings: { rendering: { renderPipeline: 'builtin', customPipeline: false } } };
        const result = engine.game.init(options);
        assert.equal(result.overrideSettings.rendering.renderPipeline, Number(version.split('.')[2]) <= 3 ? '' : 'builtin');
        assert.equal(options.overrideSettings.rendering.renderPipeline, 'builtin');
        const custom = { overrideSettings: { rendering: { renderPipeline: 'real-asset-uuid' } } };
        assert.equal(engine.game.init(custom), custom);
    }
});

test('legacy Editor queries delegate to the actual host asset backend', async t => {
    const before = globalThis.Editor;
    t.after(() => { if (before === undefined) delete globalThis.Editor; else globalThis.Editor = before; });
    const asset = { uuid: 'asset', library: { '.cconb': '/library/asset.cconb' } };
    const requests = [];
    globalThis.Editor = { Message: { request: async (channel, method) => channel + '.' + method } };
    require('../../adapters/engine/cocos38/index.cjs').configureRuntime({ cclegacy: { internal: {} } }, serializationExports, {
        getLastSelected: () => '', queryAssetInfo: uuid => { requests.push(uuid); return asset; },
    });
    assert.equal(await globalThis.Editor.Message.request('asset-db', 'query-asset-info', 'asset'), asset);
    assert.deepEqual(requests, ['asset']);
    assert.equal(await globalThis.Editor.Message.request('engine', 'query-engine-info'), 'engine.query-engine-info');
});

test('old classic backends do not activate the incompatible custom effect library', () => {
    const query = { getFeatures: () => ['base', 'custom-pipeline'], constantManager: { genCCEnvConstants: () => ({}) } };
    for (let patch = 0; patch <= 3; patch++) assert.deepEqual(featuresFor(query, { features: {} }, '3.8.' + patch), ['base']);
    for (let patch = 4; patch <= 8; patch++) assert.deepEqual(featuresFor(query, { features: {} }, '3.8.' + patch), ['base', 'custom-pipeline']);
});

test('old effect and pass libraries follow the active pipeline without changing exports', t => {
    const { selection } = fixture(t);
    const before = globalThis.Editor;
    t.after(() => { globalThis.Editor = before; });
    globalThis.Editor = {};
    const rendering = { enableEffectImport: true, programLib: {} };
    const legacy = { internal: {}, rendering, director: { root: { usesCustomPipeline: false } } };
    const codec = Object.fromEntries(['CCON', 'encodeCCONBinary', 'decodeCCONBinary', 'BufferBuilder'].map(name => [name, function () {}]));
    getEngineBackendAdapter(selection).configureRuntime({ VERSION: '3.8.3', cclegacy: legacy }, () => codec);
    assert.equal(legacy.rendering.enableEffectImport, false);
    assert.equal(legacy.rendering.programLib, rendering.programLib);
    assert.equal(rendering.enableEffectImport, true);
    legacy.director.root.usesCustomPipeline = true;
    assert.equal(legacy.rendering.enableEffectImport, true);
    legacy.director.root.usesCustomPipeline = false;
    legacy.rendering = { ...rendering };
    assert.equal(legacy.rendering.enableEffectImport, false);
});

test('flat legacy templates resolve only existing internal files', t => {
    const { root, selection } = fixture(t);
    write(root, 'editor/assets/default_file_content/animgraph', '[]');
    const adapter = getEngineBackendAdapter(selection);
    assert.equal(adapter.resolveAssetTemplate('db://internal/default_file_content/animation-graph/default.animgraph', selection), 'db://internal/default_file_content/animgraph');
    assert.equal(adapter.resolveAssetTemplate('db://assets/custom/default.animgraph', selection), 'db://assets/custom/default.animgraph');
});

test('old editor resolvers recognize the CLI sole-bin CCON representation', async t => {
    const { selection } = fixture(t);
    const before = globalThis.Editor;
    t.after(() => { globalThis.Editor = before; });
    const info = Object.freeze({ uuid: 'clip', library: Object.freeze({ '.bin': 'clip.bin' }) });
    const codec = Object.fromEntries(['CCON', 'encodeCCONBinary', 'decodeCCONBinary', 'BufferBuilder'].map(name => [name, function () {}]));
    for (const version of ['3.8.0', '3.8.6', '3.8.7', '3.8.8']) {
        globalThis.Editor = { Message: { request() {} } };
        getEngineBackendAdapter(selection).configureRuntime({ VERSION: version, cclegacy: { internal: {} } }, () => codec, { queryAssetInfo: () => info });
        const actual = await globalThis.Editor.Message.request('asset-db', 'query-asset-info', 'clip');
        assert.deepEqual(actual.library, Number(version.split('.')[2]) < 7 ? { '.cconb': 'clip.bin' } : { '.bin': 'clip.bin' });
        assert.deepEqual(info.library, { '.bin': 'clip.bin' });
    }
});

test('3.8.0 pose input attributes are editable without mutating class metadata', t => {
    const { selection } = fixture(t);
    const before = globalThis.Editor;
    t.after(() => { globalThis.Editor = before; });
    globalThis.Editor = {};
    const attrs = Object.freeze({ type: 'Number', ctor: Number, visible: false, default: 1 });
    const animation = {};
    const codec = Object.fromEntries(['CCON', 'encodeCCONBinary', 'decodeCCONBinary', 'BufferBuilder'].map(name => [name, function () {}]));
    const engine = { VERSION: '3.8.0', cclegacy: { internal: {} }, CCClass: { Attr: { attr: () => attrs } } };
    getEngineBackendAdapter(selection).configureRuntime(engine, id => id === 'cc/editor/new-gen-anim' ? animation : codec);
    assert.deepEqual(animation.getPoseGraphNodeInputAttrs({ ratio: 1 }, ['ratio']), { visible: true, default: 1 });
    assert.deepEqual(animation.getPoseGraphNodeInputAttrs({ ratio: [1] }, ['ratio', 0]), { visible: true });
    assert.equal(attrs.visible, false);
});
