const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { getEngineBackendAdapter } = require('../../adapters/engine/registry.cjs');

test('stable 3.5.0 through 3.5.2 use their own experimental caches', () => {
    for (let patch = 0; patch < 3; patch++) {
        const selection = { path: path.resolve('fixture'), version: '3.5.' + patch };
        const adapter = getEngineBackendAdapter(selection);
        assert.equal(adapter.id, 'cocos-3.5-runtime');
        assert.equal(adapter.runtime(selection).engineDev, path.join(selection.path, 'bin/.cache/dev-cli-3.5'));
        assert.equal(adapter.runtime(selection).requiredModules.includes('cc/editor/embedded-player'), false);
    }
    assert.equal(getEngineBackendAdapter({ path: path.resolve('fixture'), version: '3.5.3' }).runtimeSupport, 'discovery-only');
});

test('3.5 initialization translates settings and completes the native pipeline step', async () => {
    const calls = [];
    const shaderAssembly = {};
    const glsl4 = [];
    const engine = {
        VERSION: '3.5.0', CCClass: {},
        js: { _getClassById: () => 'native-class', _getClassId: () => 'native-id', getClassByName: () => undefined },
        cclegacy: { internal: {}, js: { _getClassById: () => 'legacy-class' }, gfx: {} },
        game: {
            _gfxDevice: { name: 'selected-device' },
            init: async function (config) { calls.push(config); return true; },
            _setupRenderPipeline: async () => calls.push('pipeline'),
        },
    };
    const codec = Object.fromEntries(['CCON', 'encodeCCONBinary', 'decodeCCONBinary', 'BufferBuilder'].map(key => [key, function () {}]));
    const previous = global.document;
    global.document = { getElementById: id => ({ id }) };
    try {
        const adapter = getEngineBackendAdapter({ path: path.resolve('fixture'), version: '3.5.0' });
        adapter.configureRuntime(engine, id => id === 'cc/editor/cli-host'
            ? { EmptyDevice: class {}, shaderAssembly, glsl4 }
            : id === 'cc/editor/new-gen-anim' ? {} : codec);
        const result = await engine.game.init({ overrideSettings: {
            rendering: { renderMode: 3, renderPipeline: 'builtin' },
            assets: { importBase: '/assets' },
            engine: { customLayers: [{ name: 'Test', bit: 4 }] },
        } });
        assert.equal(result, true);
        assert.equal(calls[0].renderMode, 3);
        assert.equal(calls[0].renderPipeline, '');
        assert.equal(calls[0].assetOptions.importBase, '/assets');
        assert.deepEqual(calls[0].layers, [{ name: 'Test', value: 16 }]);
        assert.equal(calls[1], 'pipeline');
        assert.equal(shaderAssembly.glsl4, glsl4);
        assert.equal(engine.js.getClassId(), 'native-id');
        assert.equal(engine.js.getClassById(), 'native-class');
        assert.equal(engine.cclegacy.js.getClassById(), 'legacy-class');
        assert.equal(engine.cclegacy.gfx.deviceManager.gfxDevice, engine.game._gfxDevice);
    } finally { global.document = previous; }
});

test('constant values come from the selected legacy build package', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine35-constants-'));
    t.after(() => {
        assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
        fs.rmSync(root, { recursive: true, force: true });
    });
    const directory = path.join(root, 'node_modules/@cocos/build-engine/dist');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'build-time-constants.js'), 'exports.setupBuildTimeConstants=()=>({HTML5:true,EDITOR:false,LEGACY_ONLY:7})');
    const values = require('../../adapters/engine/cocos35/constants.cjs')(root);
    assert.equal(values.LEGACY_ONLY.value, 7);
    assert.equal(values.LEGACY_ONLY.type, 'number');
    assert.equal(values.EDITOR.value, false);
    assert.equal(values.HTML5.ccGlobal, true);
    assert.equal(values.HTML5.dynamic, true);
});
