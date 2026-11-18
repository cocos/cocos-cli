const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkEngineCompatibility } = require('../engine-compatibility');
const { getEngineBackendAdapter } = require('../../adapters/engine/registry.cjs');
const root = path.resolve(__dirname, '../..');
function withoutOptIn(t) {
    const before = process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS;
    delete process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS;
    t.after(() => {
        if (before === undefined) delete process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS;
        else process.env.COCOS_EXPERIMENTAL_ENGINE_ADAPTERS = before;
    });
}
function fixture(t, version) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'default-engine-adapter-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const write = (name, content = '') => {
        const file = path.join(directory, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
    };
    write('package.json', { version });
    write('cc.config.json', {});
    write('cocos/core/platform/macro.ts');
    write('editor/engine-features/render-config.json', { features: {} });
    const selection = { path: directory, version };
    const adapter = getEngineBackendAdapter(selection);
    if (adapter.runtimeSupport !== 'discovery-only') {
        const compiler = require(path.join(root, adapter.compile(selection).compilerModule));
        const layout = adapter.runtime(selection);
        for (const file of [layout.editorLoader, layout.webLoader, layout.declarations, layout.editorDeclarations]) write(path.relative(directory, file), 'prepared');
        for (const loader of [layout.editorLoader, layout.webLoader]) write(path.relative(directory, path.join(path.dirname(loader), 'backend.json')), {
            adapter: adapter.id, cacheVersion: compiler.CACHE_VERSION, ...compiler.identity(directory),
        });
    }
    return selection;
}
for (const [minor, max] of [[6, 3], [7, 4], [8, 8]]) {
    test(`implemented 3.${minor}.x patches start without the experimental environment variable`, t => {
        withoutOptIn(t);
        for (let patch = 0; patch <= max; patch++) {
            const selection = fixture(t, `3.${minor}.${patch}`);
            assert.equal(checkEngineCompatibility(selection, root, 'web').supported, true);
            assert.equal(checkEngineCompatibility(selection, root, 'web').experimental, true);
            const loader = getEngineBackendAdapter(selection).runtime(selection).webLoader;
            fs.unlinkSync(loader);
            assert.throws(() => checkEngineCompatibility(selection, root, 'web'), /Missing required web file/);
        }
    });
}
test('discovery-only patches and 3.5 remain gated without opt-in', t => {
    withoutOptIn(t);
    for (const version of ['3.6.4', '3.7.5', '3.8.9']) {
        assert.throws(() => checkEngineCompatibility(fixture(t, version), root), /discovery only/);
    }
    assert.throws(() => checkEngineCompatibility(fixture(t, '3.5.2'), root), /Outside stable range/);
});
test('default availability still rejects stale compilation stamps', t => {
    withoutOptIn(t);
    const selection = fixture(t, '3.6.0');
    const loader = getEngineBackendAdapter(selection).runtime(selection).editorLoader;
    fs.writeFileSync(path.join(path.dirname(loader), 'backend.json'), '{}');
    assert.throws(() => checkEngineCompatibility(selection, root, 'runtime'), /Stale or incompatible/);
});
