const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { parsePackArguments, runPack } = require('../pack-engine-npm');

test('legacy arguments still select Web and explicit kinds dispatch independently', async () => {
    const legacy = parsePackArguments(['--source', 'engine', '--output', 'web']);
    assert.equal(legacy.kind, 'web');
    const calls = [];
    const handlers = Object.fromEntries(['web', 'editor'].map(kind => [kind, async options => { calls.push({ kind, options }); return kind; }]));
    assert.equal(await runPack(legacy, handlers), 'web');
    const editor = parsePackArguments(['--kind', 'editor', '--source', 'engine', '--base', 'web', '--output', 'editor']);
    assert.equal(await runPack(editor, handlers), 'editor');
    assert.equal(calls[1].options.base, 'web');
    assert.equal(calls[1].options.output, 'editor');
    assert.equal(calls[0].options.kind, undefined);
});

test('kind-specific and required arguments cannot be silently ignored', () => {
    assert.throws(() => parsePackArguments(['--kind', 'unknown']), /Unknown package kind/);
    assert.throws(() => parsePackArguments(['--kind', 'editor', '--source', 'e', '--output', 'o']), /--base/);
    assert.throws(() => parsePackArguments(['--source', 'e', '--output', 'o', '--base', 'b']), /only valid for editor/);
    assert.throws(() => parsePackArguments(['--source', 'e', '--output', 'o', '--target', 'windows']), /only valid for native/);
    assert.throws(() => parsePackArguments(['--source', ' ']), /--source is required/);
    assert.throws(() => parsePackArguments(['--source', 'e']), /--output is required/);
});

test('native is explicitly unavailable rather than producing a Web package', () => {
    assert.throws(() => parsePackArguments(['--kind', 'native', '--target', 'windows', '--arch', 'x64', '--configuration', 'Release', '--library-type', 'static']),
        { code: 'ENGINE_NPM_NATIVE_NOT_IMPLEMENTED' });
});

test('real command help succeeds without reading engine input; invalid kind exits nonzero', () => {
    const script = path.resolve(__dirname, '../pack-engine-npm.js');
    const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--kind web\|editor/);
    const invalid = spawnSync(process.execPath, [script, '--kind', 'native', '--source', 'missing', '--output', 'missing'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /not implemented/);
});
