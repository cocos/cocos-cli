const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sourceFilter, engineFilter, failures, runMatrix } = require('../test-engine-adapters.cjs');
const { expectedRuntimeVersion } = require('../engine-test-identity.cjs');
const { byteResponseURL } = require('../../adapters/engine/cocos38/asset-transport.cjs');
const adapter = require('../../adapters/engine/cocos38/index.cjs');

function fixture(t, version) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-jest-contract-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'cocos/core'), { recursive: true });
    fs.writeFileSync(path.join(root, 'cocos/core/global-exports.ts'), 'const engineVersion = ' + JSON.stringify(version) + ';');
    return root;
}

test('matrix copies editable fixtures but excludes original engine and mutable project caches', () => {
    const root = path.resolve('fixture');
    for (const file of ['packages/engine', 'packages/engine/editor/a.ts', 'node_modules/foo/a.js', 'packages/asset-db/node_modules/a',
        '.git/config', 'tests/fixtures/projects/demo/library/data', 'tests/fixtures/projects/demo/temp/data', 'tests/fixtures/projects/demo/build/web/index.html']) {
        assert.equal(sourceFilter(root, path.join(root, file)), false, file);
    }
    for (const file of ['src/core/scene/test/node.testcase.ts', 'tests/fixtures/projects/demo/assets/Game.scene', 'tests/fixtures/projects/demo/settings/cocos.config.json']) {
        assert.equal(sourceFilter(root, path.join(root, file)), true, file);
    }
});

test('engine copies contain only the selected backend cache', () => {
    const root = path.resolve('engine');
    const file = value => path.join(root, value);
    assert.equal(engineFilter(root, file('bin/.cache/dev-cli/editor/loader.js'), 'cocos-4'), true);
    assert.equal(engineFilter(root, file('bin/.cache/dev-cli-3.8/editor/loader.js'), 'cocos-4'), false);
    assert.equal(engineFilter(root, file('bin/.cache/dev/editor/loader.js'), 'cocos-3.8-runtime'), false);
    assert.equal(engineFilter(root, file('bin/.cache/dev-cli-3.8/web/loader.js'), 'cocos-3.8-runtime'), true);
    assert.equal(engineFilter(root, file('node_modules/@cocos/native/index.js'), 'cocos-3.8-runtime'), false);
});

test('runtime identity accepts a package prerelease whose engine declares the same release core', t => {
    assert.equal(expectedRuntimeVersion(fixture(t, '4.0.0'), '4.0.0-alpha.32'), '4.0.0');
});
test('runtime identity rejects a stale source from another patch', t => {
    assert.throws(() => expectedRuntimeVersion(fixture(t, '3.8.9'), '3.8.8'), /differs/);
});
test('runtime identity verifies the exact stable declaration', t => {
    assert.equal(expectedRuntimeVersion(fixture(t, '3.8.8'), '3.8.8'), '3.8.8');
});
test('missing runtime source cannot count as a successful identity check', t => {
    const root = fixture(t, '3.8.8');
    fs.unlinkSync(path.join(root, 'cocos/core/global-exports.ts'));
    assert.throws(() => expectedRuntimeVersion(root, '3.8.8'), /ENOENT/);
});

test('legacy HTTP PAL requests bytes only for loopback flat asset routes', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
        const url = new URL(byteResponseURL('http://' + host + ':9527/ab/abcdef.json?token=test'));
        assert.equal(url.searchParams.get('isBrowser'), 'true');
        assert.equal(url.searchParams.get('token'), 'test');
    }
    for (const value of ['https://example.com/ab/abcdef.json', 'http://localhost:9527/api/query', './image.png', 'file:///tmp/asset.json']) {
        assert.equal(byteResponseURL(value), value);
    }
});

test('legacy templates map without rewriting custom project templates', () => {
    const prefix = 'db://internal/default_file_content/';
    for (const [before, after] of [['scene/3d.scene', 'scene/default.scene'], ['scene/2d.scene', 'scene/scene-2d.scene'],
        ['scene/quality.scene', 'scene/scene-quality.scene'], ['typescript/default', 'typescript/ts']]) {
        assert.equal(adapter.resolveAssetTemplate(prefix + before), prefix + after);
    }
    assert.equal(adapter.resolveAssetTemplate('db://assets/templates/custom.ts'), 'db://assets/templates/custom.ts');
});

test('legacy activation queries the live host selection rather than a cached value', t => {
    const before = globalThis.Editor;
    t.after(() => { if (before === undefined) delete globalThis.Editor; else globalThis.Editor = before; });
    globalThis.Editor = {};
    let selected = 'first';
    const codec = Object.fromEntries(['CCON', 'encodeCCONBinary', 'decodeCCONBinary', 'BufferBuilder'].map(name => [name, function () {}]));
    adapter.configureRuntime({ cclegacy: { internal: {} } }, () => codec, { getLastSelected: type => type === 'node' ? selected : '' });
    assert.equal(globalThis.Editor.Selection.getLastSelected('node'), 'first');
    selected = 'second';
    assert.equal(globalThis.Editor.Selection.getLastSelected('node'), 'second');
    assert.equal(globalThis.Editor.Selection.getLastSelected('asset'), '');
});

test('reports retain failures that happen before any test body runs', () => {
    const root = path.resolve('fixture');
    const results = { testResults: [{ name: path.join(root, 'node.test.ts'), status: 'failed', assertionResults: [], message: 'engine startup failed' }] };
    assert.deepEqual(failures(results, root), [{ file: 'node.test.ts', name: '[suite setup]', messages: ['engine startup failed'] }]);
});

test('matrix requires an explicit target and never silently tests the default engine', async () => {
    await assert.rejects(runMatrix({ engines: [] }), /At least one --engine-path/);
});


test('legacy xhr blob responses preserve binary video bytes before the load callback', async t => {
    const bytes = Buffer.from([0, 255, 128, 1, 254]);
    const server = require('node:http').createServer((request, response) => {
        assert.equal(new URL(request.url, 'http://localhost').searchParams.get('isBrowser'), 'true');
        response.setHeader('content-type', 'video/mp4');
        response.end(bytes);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const XHR = require('../../adapters/engine/cocos38/asset-transport.cjs').createXMLHttpRequest(require('xhr2'));
    const result = await new Promise((resolve, reject) => {
        const xhr = new XHR();
        xhr.open('GET', 'http://127.0.0.1:' + server.address().port + '/ab/video.mp4');
        xhr.responseType = 'blob';
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = reject;
        xhr.send();
    });
    assert.equal(result instanceof Blob, true);
    assert.equal(result.type, 'video/mp4');
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
});


test('a mistyped focused suite cannot pass by running only the identity test', () => {
    const { assertRequestedSuites } = require('../test-engine-adapters.cjs');
    const root = path.resolve('fixture');
    const results = { testResults: [{ name: path.join(root, 'identity.engine-test.ts') }] };
    assert.throws(() => assertRequestedSuites(results, root, ['missing.test.ts']), /did not run/);
    assert.doesNotThrow(() => assertRequestedSuites(results, root, ['identity.engine-test.ts']));
});

test('isolated CLI type bindings retain host ABI without rewriting project declarations', () => {
    const { bindHostDeclarations } = require('../test-engine-adapters.cjs');
    const content = '/// <reference path="../engine/bin/.declarations/cc.d.ts" />\n/// <reference path="../engine/bin/.declarations/cc.editor.d.ts" />\nexport * from "./src/preload";';
    const bound = bindHostDeclarations(content, path.resolve('host-types'));
    assert.equal(bound.includes('../engine/'), false);
    assert.equal(bound.includes('cc.editor.d.ts'), true);
    assert.equal(bound.endsWith('export * from "./src/preload";'), true);
    assert.equal(content.includes('../engine/'), true);
});
