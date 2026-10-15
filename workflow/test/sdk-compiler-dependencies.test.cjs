const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { compilerDependencies } = require('../sdk-compiler-dependencies');
const { cacheKey } = require('../sdk-prepared-cache');
function fixture(t, dynamic = false) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-scope-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const cli = { files: [] };
    function write(name, value) {
        const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), bytes);
        cli.files.push({ path: name, bytes: bytes.length, mode: 420, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    }
    write('packages/engine-compiler/dist/index.js', dynamic ? 'require(process.env.PLUGIN)' : "require('compiler/subpath'); require('node:path');");
    write('node_modules/compiler/package.json', { dependencies: { helper: '*', shared: '*' }, optionalDependencies: { absent: '*' } });
    write('node_modules/compiler/index.js', 'compile');
    write('node_modules/compiler/node_modules/helper/package.json', { dependencies: { compiler: '*' } });
    write('node_modules/shared/package.json', { peerDependencies: { peer: '*' } });
    write('node_modules/peer/package.json', {});
    write('node_modules/unrelated/package.json', {});
    write('node_modules/unrelated/native.node', 'native build output');
    return { root, cli };
}
test('compiler closure resolves nested, hoisted, peer and cyclic dependencies', t => {
    const { root, cli } = fixture(t);
    const result = compilerDependencies(root, cli);
    assert.equal(result.scope, 'compiler-closure');
    assert.deepEqual(result.packages, ['node_modules/compiler', 'node_modules/compiler/node_modules/helper', 'node_modules/peer', 'node_modules/shared']);
    assert(!result.cli.files.some(file => file.path.startsWith('node_modules/unrelated/')));
    const key = cacheKey({}, result.cli, []);
    cli.files.find(file => file.path.endsWith('native.node')).sha256 = 'another-build';
    assert.equal(key, cacheKey({}, compilerDependencies(root, cli).cli, []));
    const compiled = compilerDependencies(root, cli).cli;
    compiled.files = compiled.files.map(file => file.path === 'node_modules/compiler/index.js' ? { ...file, sha256: 'changed' } : file);
    assert.notEqual(key, cacheKey({}, compiled, []));
});
test('dynamic compiler imports retain full dependency validation', t => {
    const { root, cli } = fixture(t, true);
    assert.equal(compilerDependencies(root, cli).cli, cli);
    assert.equal(compilerDependencies(root, cli).scope, 'all');
});
test('changed package metadata and missing required dependencies fail closed', t => {
    const { root, cli } = fixture(t);
    fs.writeFileSync(path.join(root, 'node_modules/compiler/package.json'), '{}');
    assert.throws(() => compilerDependencies(root, cli), /Build input changed/);
    cli.files = cli.files.filter(file => file.path !== 'node_modules/compiler/package.json');
    assert.throws(() => compilerDependencies(root, cli), /Missing compiler dependency/);
});
